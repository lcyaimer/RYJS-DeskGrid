<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Bookmark,
  Check,
  FileUp,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
} from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import type { BookmarkLink, BookmarkSource } from '../types'
import { ACCENTS, ACCENT_KEYS } from '../constants'
import { addBookmarks, desk } from '../stores/desk'
import {
  listBookmarkSources,
  pickPath,
  readBrowserBookmarks,
  readTextFile,
} from '../lib/platform'
import { parseNetscapeBookmarks, dedupeBookmarks } from '../lib/bookmarks'
import { closeBookmarkImporter, overlayState } from '../lib/overlays'
import { errorMessage, toast } from '../lib/feedback'
import { hostnameOf, initialOf, shortPath, tileBackground } from '../lib/utils'

type ImportMode = 'auto' | 'file'

const mode = ref<ImportMode>('auto')
const loadingSources = ref(false)
const loadingBookmarks = ref(false)
const importing = ref(false)
const error = ref('')
const search = ref('')
const sources = ref<BookmarkSource[]>([])
const selectedSourcePath = ref('')
const links = ref<BookmarkLink[]>([])
const selectedUrls = ref<Set<string>>(new Set())
const loadedFile = ref('')

const MAX_RENDER_ROWS = 300

const category = computed(
  () => desk.categories.find((entry) => entry.id === overlayState.bookmarksCategoryId) ?? null,
)
const filteredLinks = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return links.value
  return links.value.filter(
    (link) =>
      link.title.toLowerCase().includes(query) ||
      link.url.toLowerCase().includes(query) ||
      link.folder.toLowerCase().includes(query),
  )
})
const visibleLinks = computed(() => filteredLinks.value.slice(0, MAX_RENDER_ROWS))
const selectedCount = computed(() => selectedUrls.value.size)
const allFilteredSelected = computed(
  () => filteredLinks.value.length > 0 && filteredLinks.value.every((link) => selectedUrls.value.has(link.url)),
)
const overflowCount = computed(() => Math.max(0, filteredLinks.value.length - MAX_RENDER_ROWS))

function accentKeyFor(url: string) {
  let hash = 0
  for (let i = 0; i < url.length; i += 1) hash = (hash * 31 + url.charCodeAt(i)) >>> 0
  return ACCENT_KEYS[hash % ACCENT_KEYS.length]
}

function tileStyleFor(url: string) {
  const key = accentKeyFor(url)
  return {
    background: tileBackground(key),
    boxShadow: `0 5px 12px -8px rgb(${ACCENTS[key].rgb} / 0.6)`,
  }
}

function selectAllVisible(): void {
  const next = new Set(selectedUrls.value)
  if (allFilteredSelected.value) {
    for (const link of filteredLinks.value) next.delete(link.url)
  } else {
    for (const link of filteredLinks.value) next.add(link.url)
  }
  selectedUrls.value = next
}

function toggleUrl(url: string): void {
  const next = new Set(selectedUrls.value)
  if (next.has(url)) next.delete(url)
  else next.add(url)
  selectedUrls.value = next
}

function applyLinks(nextLinks: BookmarkLink[]): void {
  const unique = dedupeBookmarks(nextLinks)
  links.value = unique
  selectedUrls.value = new Set(unique.map((link) => link.url))
  search.value = ''
}

async function chooseSource(source: BookmarkSource): Promise<void> {
  selectedSourcePath.value = source.path
  loadedFile.value = ''
  error.value = ''
  loadingBookmarks.value = true
  links.value = []
  selectedUrls.value = new Set()
  try {
    const bookmarks = await readBrowserBookmarks(source.path)
    applyLinks(bookmarks)
    if (bookmarks.length === 0) error.value = '这个浏览器资料中没有可导入的书签。'
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loadingBookmarks.value = false
  }
}

async function refreshSources(autoSelect = true): Promise<void> {
  loadingSources.value = true
  error.value = ''
  try {
    sources.value = await listBookmarkSources()
    if (sources.value.length > 0 && autoSelect) {
      await chooseSource(sources.value[0])
    } else if (sources.value.length === 0) {
      selectedSourcePath.value = ''
      links.value = []
      selectedUrls.value = new Set()
    }
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loadingSources.value = false
  }
}

async function selectFile(): Promise<void> {
  error.value = ''
  try {
    const path = await pickPath('file', {
      title: '选择书签文件',
      filters: [{ name: '浏览器书签', extensions: ['html', 'htm', 'json'] }],
    })
    if (!path) return
    loadingBookmarks.value = true
    links.value = []
    selectedSourcePath.value = ''
    selectedUrls.value = new Set()
    const lower = path.toLowerCase()
    if (lower.endsWith('.json')) {
      const bookmarks = await readBrowserBookmarks(path)
      applyLinks(bookmarks)
    } else {
      const html = await readTextFile(path)
      applyLinks(parseNetscapeBookmarks(html))
    }
    loadedFile.value = path
    if (links.value.length === 0) error.value = '文件中没有找到可导入的 http / https 书签。'
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loadingBookmarks.value = false
  }
}

async function switchMode(next: ImportMode): Promise<void> {
  if (mode.value === next) return
  mode.value = next
  search.value = ''
  error.value = ''
  links.value = []
  selectedUrls.value = new Set()
  selectedSourcePath.value = ''
  loadedFile.value = ''
  if (next === 'auto' && sources.value.length === 0) {
    await refreshSources()
  }
}

function doImport(): void {
  if (!category.value || importing.value) return
  const selected = links.value.filter((link) => selectedUrls.value.has(link.url))
  if (selected.length === 0) return
  importing.value = true
  try {
    const added = addBookmarks(category.value.id, selected)
    if (added === 0) {
      toast.info('没有新增书签，可能都已经存在')
    } else if (added < selected.length) {
      toast.success(`已导入 ${added} 个书签，跳过 ${selected.length - added} 个重复项`)
    } else {
      toast.success(`已导入 ${added} 个书签`)
    }
    closeBookmarkImporter()
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    importing.value = false
  }
}

watch(
  () => overlayState.bookmarksOpen,
  async (open) => {
    if (!open) return
    mode.value = 'auto'
    search.value = ''
    error.value = ''
    sources.value = []
    links.value = []
    selectedUrls.value = new Set()
    selectedSourcePath.value = ''
    loadedFile.value = ''
    await refreshSources()
  },
  { immediate: true },
)
</script>

<template>
  <BaseModal
    :open="overlayState.bookmarksOpen"
    title="导入浏览器书签"
    :description="category ? `选择一个来源，导入到「${category.name}」。` : '选择一个来源导入书签。'"
    size="lg"
    flush
    @close="closeBookmarkImporter"
  >
    <div class="flex h-[min(540px,calc(88vh-172px))] flex-col">
      <div class="flex items-center gap-1.5 border-b border-slate-200/70 px-5 py-3 dark:border-white/[0.07]">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
          :class="
            mode === 'auto'
              ? 'bg-slate-900/[0.06] text-slate-900 dark:bg-white/[0.09] dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="switchMode('auto')"
        >
          <Server :size="14" />
          自动检测
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition"
          :class="
            mode === 'file'
              ? 'bg-slate-900/[0.06] text-slate-900 dark:bg-white/[0.09] dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="switchMode('file')"
        >
          <FileUp :size="14" />
          从文件导入
        </button>
        <span class="ml-auto hidden text-[10.5px] text-slate-400 sm:block">
          支持 Chrome · Edge · Brave · 书签 HTML
        </span>
      </div>

      <div v-if="mode === 'auto'" class="flex min-h-0 flex-1">
        <aside class="flex w-[208px] shrink-0 flex-col border-r border-slate-200/70 dark:border-white/[0.07]">
          <div class="flex items-center justify-between px-3.5 pb-1.5 pt-3">
            <span class="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">浏览器来源</span>
            <button
              type="button"
              class="icon-btn h-6 w-6"
              title="重新检测"
              aria-label="重新检测浏览器书签"
              :disabled="loadingSources"
              @click="refreshSources()"
            >
              <RefreshCw :size="13" :class="loadingSources ? 'animate-spin' : ''" />
            </button>
          </div>
          <div class="desk-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            <div v-if="loadingSources" class="flex items-center gap-2 px-2.5 py-4 text-[11.5px] text-slate-400">
              <LoaderCircle :size="14" class="animate-spin" />
              正在扫描浏览器…
            </div>
            <template v-else-if="sources.length > 0">
              <button
                v-for="source in sources"
                :key="source.path"
                type="button"
                class="mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition"
                :class="
                  selectedSourcePath === source.path
                    ? 'bg-brand-500/[0.09] ring-1 ring-inset ring-brand-500/20'
                    : 'hover:bg-slate-900/[0.045] dark:hover:bg-white/[0.05]'
                "
                @click="chooseSource(source)"
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900/[0.06] text-slate-500 dark:bg-white/[0.07] dark:text-slate-300">
                  <Globe2 :size="14" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12px] font-medium">{{ source.browser }}</span>
                  <span class="block truncate text-[10px] text-slate-400">
                    {{ source.profile }} · {{ source.count }} 条
                  </span>
                </span>
              </button>
            </template>
            <div v-else class="px-2.5 py-5 text-center">
              <Server :size="20" class="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p class="text-[11.5px] leading-5 text-slate-400">
                未检测到浏览器书签。<br />
                可以在浏览器中导出 HTML 后切换「从文件导入」。
              </p>
            </div>
          </div>
        </aside>

        <section class="flex min-w-0 flex-1 flex-col">
          <div class="flex items-center gap-2 px-4 py-3">
            <div class="relative min-w-0 flex-1">
              <Search
                :size="14"
                class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                v-model="search"
                class="field py-1.5 pl-8 text-[12px]"
                placeholder="搜索标题、网址或文件夹"
                aria-label="搜索书签"
              />
            </div>
            <button
              type="button"
              class="btn-secondary shrink-0 px-2.5 py-1.5 text-[11px]"
              :disabled="filteredLinks.length === 0"
              @click="selectAllVisible"
            >
              {{ allFilteredSelected ? '取消全选' : '全选' }}
            </button>
          </div>

          <div class="desk-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
            <div v-if="loadingBookmarks" class="flex flex-col items-center justify-center py-16 text-slate-400">
              <LoaderCircle :size="21" class="mb-2 animate-spin" />
              <span class="text-[11.5px]">正在读取书签…</span>
            </div>
            <template v-else-if="links.length > 0">
              <button
                v-for="link in visibleLinks"
                :key="link.url"
                type="button"
                class="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.045]"
                :aria-pressed="selectedUrls.has(link.url)"
                @click="toggleUrl(link.url)"
              >
                <span
                  class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition"
                  :class="
                    selectedUrls.has(link.url)
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-slate-300 bg-white/60 dark:border-white/20 dark:bg-white/[0.03]'
                  "
                >
                  <Check v-if="selectedUrls.has(link.url)" :size="11" :stroke-width="3" />
                </span>
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/25 text-[12px] font-semibold text-white"
                  :style="tileStyleFor(link.url)"
                >
                  {{ initialOf(link.title, 'W') }}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">
                    {{ link.title }}
                  </span>
                  <span class="block truncate text-[10.5px] text-slate-400">
                    {{ hostnameOf(link.url) }}
                    <span v-if="link.folder"> · {{ link.folder }}</span>
                  </span>
                </span>
              </button>
              <p v-if="overflowCount > 0" class="px-2 py-3 text-center text-[10.5px] text-slate-400">
                列表仅展示前 {{ MAX_RENDER_ROWS }} 条，搜索可继续筛选；全选操作仍作用于全部
                {{ filteredLinks.length }} 条。
              </p>
            </template>
            <div v-else class="flex flex-col items-center justify-center py-14 text-center">
              <Bookmark :size="24" class="mb-2.5 text-slate-300 dark:text-slate-600" />
              <p class="text-[12px] text-slate-400">
                {{ selectedSourcePath ? '没有匹配的书签' : '选择左侧的浏览器来源开始' }}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div v-else class="flex min-h-0 flex-1 flex-col">
        <div class="flex items-center gap-3 border-b border-slate-200/70 px-5 py-3.5 dark:border-white/[0.07]">
          <button class="btn-secondary shrink-0" type="button" @click="selectFile">
            <FileUp :size="15" />
            选择文件
          </button>
          <div class="min-w-0 flex-1">
            <p v-if="loadedFile" class="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {{ shortPath(loadedFile, 72) }}
            </p>
            <p v-else class="text-[11.5px] leading-5 text-slate-400">
              选择浏览器导出的 HTML 书签文件，或 Chromium 的 Bookmarks JSON 文件。
            </p>
            <p v-if="links.length > 0" class="mt-0.5 text-[10.5px] text-emerald-600 dark:text-emerald-300">
              已读取 {{ links.length }} 条书签
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 px-4 py-3">
          <div class="relative min-w-0 flex-1">
            <Search
              :size="14"
              class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              v-model="search"
              class="field py-1.5 pl-8 text-[12px]"
              placeholder="搜索标题、网址或文件夹"
              aria-label="搜索书签"
            />
          </div>
          <button
            type="button"
            class="btn-secondary shrink-0 px-2.5 py-1.5 text-[11px]"
            :disabled="filteredLinks.length === 0"
            @click="selectAllVisible"
          >
            {{ allFilteredSelected ? '取消全选' : '全选' }}
          </button>
        </div>

        <div class="desk-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          <div v-if="loadingBookmarks" class="flex flex-col items-center justify-center py-16 text-slate-400">
            <LoaderCircle :size="21" class="mb-2 animate-spin" />
            <span class="text-[11.5px]">正在读取书签…</span>
          </div>
          <template v-else-if="links.length > 0">
            <button
              v-for="link in visibleLinks"
              :key="link.url"
              type="button"
              class="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.045]"
              :aria-pressed="selectedUrls.has(link.url)"
              @click="toggleUrl(link.url)"
            >
              <span
                class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition"
                :class="
                  selectedUrls.has(link.url)
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-slate-300 bg-white/60 dark:border-white/20 dark:bg-white/[0.03]'
                "
              >
                <Check v-if="selectedUrls.has(link.url)" :size="11" :stroke-width="3" />
              </span>
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/25 text-[12px] font-semibold text-white"
                :style="tileStyleFor(link.url)"
              >
                {{ initialOf(link.title, 'W') }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">
                  {{ link.title }}
                </span>
                <span class="block truncate text-[10.5px] text-slate-400">
                  {{ hostnameOf(link.url) }}
                  <span v-if="link.folder"> · {{ link.folder }}</span>
                </span>
              </span>
            </button>
            <p v-if="overflowCount > 0" class="px-2 py-3 text-center text-[10.5px] text-slate-400">
              列表仅展示前 {{ MAX_RENDER_ROWS }} 条，搜索可继续筛选；全选操作仍作用于全部
              {{ filteredLinks.length }} 条。
            </p>
          </template>
          <div v-else class="flex flex-col items-center justify-center py-14 text-center">
            <FileUp :size="24" class="mb-2.5 text-slate-300 dark:text-slate-600" />
            <p class="text-[12px] text-slate-400">
              {{ loadedFile ? '没有找到可导入的书签' : '先选择一个书签文件' }}
            </p>
            <p class="mt-1 text-[10.5px] text-slate-400 dark:text-slate-500">
              可从浏览器「书签管理器 → 导出书签」得到 HTML 文件
            </p>
          </div>
        </div>
      </div>

      <p
        v-if="error"
        class="border-t border-rose-500/10 bg-rose-500/[0.06] px-5 py-2 text-[11.5px] text-rose-600 dark:text-rose-300"
      >
        {{ error }}
      </p>
    </div>

    <template #footer>
      <div class="mr-auto text-[11.5px] text-slate-400">
        已选择 <span class="font-mono text-slate-600 dark:text-slate-300">{{ selectedCount }}</span> 条
      </div>
      <button class="btn-secondary" type="button" @click="closeBookmarkImporter">取消</button>
      <button
        class="btn-primary min-w-[116px]"
        type="button"
        :disabled="selectedCount === 0 || loadingBookmarks || importing"
        @click="doImport"
      >
        <LoaderCircle v-if="importing" :size="15" class="animate-spin" />
        导入 {{ selectedCount > 0 ? selectedCount : '' }} 条
      </button>
    </template>
  </BaseModal>
</template>
