<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  FilePlus2,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  MapPin,
} from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { createFileAt, createFolderAt, getSystemPaths, pickPath } from '../lib/platform'
import { addFolderPath, addLocalPaths, desk, updateSettings } from '../stores/desk'
import { closeCreator, overlayState } from '../lib/overlays'
import { errorMessage, toast } from '../lib/feedback'
import { joinPath, shortPath, validateEntryName } from '../lib/utils'

type CreateMode = 'folder' | 'file'

const mode = ref<CreateMode>('folder')
const location = ref('')
const name = ref('')
const content = ref('')
const error = ref('')
const busy = ref(false)

const category = computed(
  () => desk.categories.find((entry) => entry.id === overlayState.creatorCategoryId) ?? null,
)
const fullPath = computed(() => (location.value.trim() && name.value.trim() ? joinPath(location.value, name.value.trim()) : ''))
const description = computed(() =>
  category.value ? `新内容会创建在你选择的路径，并加入「${category.value.name}」。` : '新内容会创建在你选择的路径。',
)

watch(
  () => overlayState.creatorOpen,
  async (open) => {
    if (!open) return
    mode.value = 'folder'
    name.value = ''
    content.value = ''
    error.value = ''
    busy.value = false
    location.value = desk.settings.lastCreateDir || ''
    if (!location.value) {
      try {
        const paths = await getSystemPaths()
        if (!location.value) location.value = paths.desktop || paths.home || ''
      } catch {
        // The user can still type or browse to a path manually.
      }
    }
  },
  { immediate: true },
)

async function browseLocation(): Promise<void> {
  try {
    const selected = await pickPath('folder', {
      title: '选择创建位置',
      defaultPath: location.value || desk.settings.lastCreateDir || undefined,
    })
    if (selected) {
      location.value = selected
      error.value = ''
    }
  } catch (err) {
    error.value = errorMessage(err)
  }
}

async function create(): Promise<void> {
  if (busy.value) return
  const parent = location.value.trim()
  const fileName = name.value.trim()
  if (!parent) {
    error.value = '请选择或输入创建位置'
    return
  }
  const nameError = validateEntryName(fileName)
  if (nameError) {
    error.value = nameError
    return
  }
  if (!category.value) {
    error.value = '当前分类不存在，请重新打开'
    return
  }
  busy.value = true
  error.value = ''
  const path = joinPath(parent, fileName)
  try {
    if (mode.value === 'folder') {
      await createFolderAt(path)
      addFolderPath(category.value.id, path)
      toast.success('文件夹已创建并添加')
    } else {
      await createFileAt(path, content.value)
      addLocalPaths(category.value.id, [path])
      toast.success('文件已创建并添加')
    }
    updateSettings({ lastCreateDir: parent })
    closeCreator()
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal
    :open="overlayState.creatorOpen"
    title="新建并添加"
    :description="description"
    size="md"
    @close="!busy && closeCreator()"
  >
    <form class="space-y-4" @submit.prevent="create">
      <div class="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/80 p-1.5 dark:bg-white/[0.045]">
        <button
          type="button"
          class="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium transition"
          :class="
            mode === 'folder'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.1] dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="mode = 'folder'; error = ''"
        >
          <FolderPlus :size="16" />
          新建文件夹
        </button>
        <button
          type="button"
          class="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium transition"
          :class="
            mode === 'file'
              ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.1] dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          "
          @click="mode = 'file'; error = ''"
        >
          <FilePlus2 :size="16" />
          新建文件
        </button>
      </div>

      <div>
        <label class="field-label" for="create-location">创建位置</label>
        <div class="flex gap-2">
          <div class="relative min-w-0 flex-1">
            <MapPin
              :size="15"
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              id="create-location"
              v-model="location"
              class="field pl-9 font-mono text-[12px]"
              placeholder="例如：D:\Workspace\Inbox"
              autocomplete="off"
              spellcheck="false"
              @input="error = ''"
            />
          </div>
          <button class="btn-secondary shrink-0 px-3" type="button" @click="browseLocation">
            <FolderOpen :size="15" />
            浏览
          </button>
        </div>
        <p class="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          支持直接输入任意本机路径，也可以从资源管理器选择。
        </p>
      </div>

      <div>
        <label class="field-label" for="create-name">名称</label>
        <input
          id="create-name"
          v-model="name"
          class="field"
          autofocus
          maxlength="180"
          :placeholder="mode === 'folder' ? '例如：项目资料' : '例如：待办清单.md'"
          autocomplete="off"
          @input="error = ''"
        />
        <p v-if="mode === 'file'" class="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          文件会以空白内容创建，建议保留扩展名。
        </p>
      </div>

      <div v-if="mode === 'file'">
        <label class="field-label" for="create-content">
          初始内容 <span class="font-normal text-slate-400">（可选）</span>
        </label>
        <textarea
          id="create-content"
          v-model="content"
          class="field min-h-[96px] resize-y"
          placeholder="留空则创建空文件"
          spellcheck="false"
        />
      </div>

      <div
        v-if="fullPath"
        class="flex items-start gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.03]"
      >
        <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
        <div class="min-w-0 text-[11px] leading-5">
          <p class="text-slate-400 dark:text-slate-500">将要创建</p>
          <p class="break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">
            {{ shortPath(fullPath, 86) }}
          </p>
        </div>
      </div>

      <p
        v-if="error"
        class="rounded-xl border border-rose-500/15 bg-rose-500/[0.08] px-3 py-2.5 text-[12px] leading-5 text-rose-600 dark:text-rose-300"
      >
        {{ error }}
      </p>
    </form>

    <template #footer>
      <button class="btn-secondary" type="button" :disabled="busy" @click="closeCreator">
        取消
      </button>
      <button class="btn-primary min-w-[104px]" type="button" :disabled="busy" @click="create">
        <LoaderCircle v-if="busy" :size="15" class="animate-spin" />
        {{ busy ? '创建中…' : '创建并添加' }}
      </button>
    </template>
  </BaseModal>
</template>
