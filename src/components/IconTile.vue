<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, ExternalLink, Globe2, Pencil, Trash2 } from 'lucide-vue-next'
import type { AccentKey, DeskItem } from '../types'
import { ACCENTS, ITEM_TYPE_META } from '../constants'
import { copyText, initialOf, shortPath, tileBackground } from '../lib/utils'
import { faviconUrlFor } from '../lib/favicon'
import { inferItemIcon } from '../lib/itemIcons'
import { toast } from '../lib/feedback'
import { askConfirm } from '../lib/feedback'
import { deleteItem, desk, launchItem } from '../stores/desk'
import { appIconDataUrl } from '../lib/platform'
import DropdownMenu from './DropdownMenu.vue'
import ItemGlyph from './ItemGlyph.vue'

const props = defineProps<{
  item: DeskItem
  categoryId: string
}>()

const emit = defineEmits<{
  edit: [item: DeskItem]
}>()

const menuOpen = ref(false)
const menuPoint = ref<{ x: number; y: number } | null>(null)

const meta = computed(() => ITEM_TYPE_META[props.item.kind])
const accentKey = computed<AccentKey>(() =>
  desk.settings.uniformCards ? desk.settings.globalAccent : props.item.accent,
)
const accent = computed(() => ACCENTS[accentKey.value] ?? ACCENTS.violet)
const resolvedIcon = computed(() => inferItemIcon(props.item))
const letterMode = computed(() => desk.settings.iconStyle === 'letter')
const isLink = computed(() => props.item.kind === 'link')
const isNativeApp = computed(() => props.item.kind === 'app' && !letterMode.value)
const linkWantsFavicon = computed(() => isLink.value && !letterMode.value && !props.item.icon)
const faviconSrc = computed(() =>
  linkWantsFavicon.value ? faviconUrlFor(props.item.target) : null,
)
const faviconLoaded = ref(false)
const faviconFailed = ref(false)
const showLetterInitial = computed(
  () =>
    (isLink.value && !props.item.icon && (letterMode.value || faviconFailed.value)) ||
    (props.item.kind === 'app' && letterMode.value),
)
const usesTextGlyph = computed(
  () => showLetterInitial.value || (linkWantsFavicon.value && !props.item.icon),
)
const appIconSrc = ref<string | null>(null)
const appIconFailed = ref(false)
let appIconRequest = 0

watch(faviconSrc, () => {
  faviconLoaded.value = false
  faviconFailed.value = false
})

watch(
  [() => props.item.target, () => props.item.kind, letterMode],
  async ([target, kind, letter]) => {
    const request = ++appIconRequest
    appIconSrc.value = null
    appIconFailed.value = false
    if (kind !== 'app' || letter) return
    const source = await appIconDataUrl(target)
    if (request !== appIconRequest) return
    if (source) {
      appIconSrc.value = source
    } else {
      appIconFailed.value = true
    }
  },
  { immediate: true },
)

const tileStyle = computed(() => ({
  background: tileBackground(accentKey.value),
  boxShadow: `0 9px 22px -10px rgb(${accent.value.rgb} / 0.58), inset 0 1px 0 0 rgba(255,255,255,0.28)`,
}))

function openItem(): void {
  void launchItem(props.item)
}

function openContextMenu(event: MouseEvent): void {
  menuOpen.value = true
  menuPoint.value = { x: event.clientX, y: event.clientY }
}

function editItem(): void {
  menuOpen.value = false
  emit('edit', props.item)
}

async function copyTarget(): Promise<void> {
  menuOpen.value = false
  const ok = await copyText(props.item.target)
  if (ok) {
    toast.success(props.item.kind === 'link' ? '链接已复制' : '路径已复制')
  } else {
    toast.error('复制失败')
  }
}

async function removeItem(): Promise<void> {
  menuOpen.value = false
  const confirmed = await askConfirm({
    title: `移除「${props.item.name}」？`,
    message:
      props.item.kind === 'link'
        ? '只会从桌面收纳中移除这个书签，不会影响浏览器中的收藏。'
        : '只会从桌面收纳中移除快捷方式，不会删除本机上的文件或文件夹。',
    confirmText: '移除',
    tone: 'danger',
  })
  if (!confirmed) return
  deleteItem(props.categoryId, props.item.id)
  toast.success('已移除')
}
</script>

<template>
  <div class="icon-cell group relative flex min-w-0 flex-col items-center">
    <button
      type="button"
      class="relative flex w-full flex-col items-center rounded-2xl px-0.5 pb-1 pt-0.5 outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-brand-400/80"
      :title="`${item.name}\n${shortPath(item.target, 72)}${item.note ? `\n${item.note}` : ''}`"
      :aria-label="`打开${meta.label}：${item.name}`"
      @click="openItem"
      @contextmenu.prevent.stop="openContextMenu"
    >
      <span
        class="relative flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[18px] border border-white/25 text-white transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.035] group-hover:brightness-110 group-active:translate-y-0 group-active:scale-[0.98]"
        :class="usesTextGlyph ? 'font-display text-[22px] font-semibold' : ''"
        :style="tileStyle"
      >
        <span
          class="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_42%)] opacity-70"
        />
        <template v-if="linkWantsFavicon">
          <span
            class="absolute inset-0 m-auto flex h-[38px] w-[38px] items-center justify-center rounded-[11px] transition-colors duration-150"
            :class="faviconLoaded ? 'bg-white shadow-sm ring-1 ring-black/5' : 'bg-transparent'"
          >
            <img
              :src="faviconSrc || undefined"
              alt=""
              class="h-[27px] w-[27px] object-contain transition-opacity duration-150"
              :class="faviconLoaded ? 'opacity-100' : 'opacity-0'"
              referrerpolicy="no-referrer"
              draggable="false"
              @load="faviconLoaded = true"
              @error="faviconFailed = true"
            />
          </span>
          <span v-if="!faviconLoaded" class="relative -mt-0.5 tracking-tight drop-shadow-sm">
            {{ initialOf(item.name, 'W') }}
          </span>
        </template>
        <template v-else-if="isNativeApp">
          <img
            v-if="appIconSrc && !appIconFailed"
            :src="appIconSrc"
            alt=""
            class="relative h-[40px] w-[40px] object-contain drop-shadow-sm"
            draggable="false"
            @error="appIconFailed = true"
          />
          <ItemGlyph v-else :icon="resolvedIcon" :size="24" class="relative drop-shadow-sm" />
        </template>
        <span v-else-if="showLetterInitial" class="relative -mt-0.5 tracking-tight drop-shadow-sm">
          {{ initialOf(item.name, 'W') }}
        </span>
        <ItemGlyph
          v-else
          :icon="resolvedIcon"
          :size="25"
          class="relative drop-shadow-sm"
        />
        <span
          v-if="linkWantsFavicon && !faviconLoaded"
          class="absolute bottom-1 right-1 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm"
        >
          <Globe2 :size="9.5" :stroke-width="2.3" />
        </span>
      </span>
      <span
        class="mt-1.5 line-clamp-2 min-h-[26px] w-full break-words text-center text-[11.5px] font-medium leading-[13px] text-slate-700 dark:text-slate-200"
      >
        {{ item.name }}
      </span>
      <span class="type-chip mt-1" :class="meta.chipClass">
        <span class="h-1 w-1 rounded-full" :class="meta.dotClass" />
        {{ meta.label }}
      </span>
    </button>

    <DropdownMenu
      :open="menuOpen"
      :point="menuPoint"
      :width="186"
      :z-index="72"
      @close="menuOpen = false"
    >
      <button class="menu-item" type="button" @click="openItem(); menuOpen = false">
        <ExternalLink :size="15" class="text-slate-400" />
        打开
      </button>
      <button class="menu-item" type="button" @click="editItem">
        <Pencil :size="15" class="text-slate-400" />
        编辑图标
      </button>
      <button class="menu-item" type="button" @click="copyTarget">
        <Copy :size="15" class="text-slate-400" />
        {{ item.kind === 'link' ? '复制链接' : '复制路径' }}
      </button>
      <div class="my-1 h-px bg-slate-900/[0.07] dark:bg-white/[0.08]" />
      <button class="menu-item-danger" type="button" @click="removeItem">
        <Trash2 :size="15" />
        从分类中移除
      </button>
    </DropdownMenu>
  </div>
</template>
