<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  AppWindow,
  Bookmark,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Code2,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  LayoutGrid,
  Link2,
  LockKeyhole,
  MessageSquareText,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'
import type { DeskCategory, DeskItem, MenuAnchor } from '../types'
import { ACCENTS } from '../constants'
import {
  addFolderPath,
  addLocalPaths,
  clampCategoryPosition,
  deleteCategory,
  desk,
  effectiveCategoryAccent,
  effectiveCategoryOpacity,
  focusCategory,
  moveCategory,
  persistNow,
  updateCategory,
} from '../stores/desk'
import { pickPath } from '../lib/platform'
import { askConfirm, errorMessage, toast } from '../lib/feedback'
import {
  openBookmarkImporter,
  openCategoryEditor,
  openCreator,
  openItemEditor,
} from '../lib/overlays'
import { categoryBackground } from '../lib/utils'
import { WINDOW_EDGE } from '../lib/layout'
import { dragDropState } from '../lib/dragDrop'
import {
  alignmentState,
  clearAlignment,
  collectSnapRects,
  snapRect,
} from '../lib/alignment'
import DropdownMenu from './DropdownMenu.vue'
import IconTile from './IconTile.vue'

const props = defineProps<{
  category: DeskCategory
}>()

const emit = defineEmits<{
  // Kept for potential parent-level coordination; the card opens overlays directly.
  (event: 'focus'): void
}>()

const accent = computed(
  () => ACCENTS[effectiveCategoryAccent(props.category)] ?? ACCENTS.violet,
)
const theme = computed(() => desk.settings.theme)
const effectiveOpacity = computed(() => effectiveCategoryOpacity(props.category))
const surfaceBackground = computed(() => categoryBackground(theme.value, effectiveOpacity.value))
const zIndex = computed(
  () => 10 + Math.min(Math.max(desk.categories.findIndex((entry) => entry.id === props.category.id), 0), 20),
)
const opacityPercent = computed(() => Math.round(props.category.opacity * 100))
const effectiveOpacityPercent = computed(() => Math.round(effectiveOpacity.value * 100))
const dropTargeted = computed(
  () =>
    dragDropState.active && dragDropState.targetCategoryId === props.category.id,
)
const uniformCards = computed(() => desk.settings.uniformCards)
const displayedOpacityPercent = computed(() =>
  uniformCards.value ? effectiveOpacityPercent.value : opacityPercent.value,
)

const categoryGlyph = computed(() => {
  const name = props.category.name.toLowerCase()
  if (/(交流|反馈|留言|chat|feedback|comment)/.test(name)) return MessageSquareText
  if (/(开发|代码|code|dev)/.test(name)) return Code2
  if (/(收藏|书签|网址|bookmark|link)/.test(name)) return Bookmark
  if (/(工作|办公|work|office)/.test(name)) return Briefcase
  if (/(游戏|娱乐|game|play)/.test(name)) return Gamepad2
  if (/(设计|素材|design|art)/.test(name)) return Palette
  if (/(日常|常用|daily)/.test(name)) return Sparkles
  return LayoutGrid
})

const cardStyle = computed<Record<string, string>>(() => ({
  left: `${props.category.x}px`,
  top: `${props.category.y}px`,
  width: '356px',
  zIndex: String(zIndex.value),
  '--category-bg': surfaceBackground.value,
}))

const addMenuOpen = ref(false)
const moreMenuOpen = ref(false)
const addAnchor = ref<MenuAnchor | null>(null)
const moreAnchor = ref<MenuAnchor | null>(null)
const dragging = ref(false)
const cardEl = ref<HTMLElement | null>(null)

const rangeStyle = computed(() => ({
  '--range-color': accent.value.color,
  '--range-value': `${displayedOpacityPercent.value}%`,
}))

function anchorFrom(event: MouseEvent): MenuAnchor {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

function toggleAddMenu(event: MouseEvent): void {
  moreMenuOpen.value = false
  addAnchor.value = anchorFrom(event)
  addMenuOpen.value = !addMenuOpen.value
}

function toggleMoreMenu(event: MouseEvent): void {
  addMenuOpen.value = false
  moreAnchor.value = anchorFrom(event)
  moreMenuOpen.value = !moreMenuOpen.value
}

function toggleCollapsed(): void {
  updateCategory(props.category.id, { collapsed: !props.category.collapsed })
}

function editCategory(): void {
  moreMenuOpen.value = false
  openCategoryEditor(props.category.id)
}

function adjustOpacity(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  updateCategory(props.category.id, { opacity: value / 100 })
}

async function addFile(): Promise<void> {
  addMenuOpen.value = false
  try {
    const path = await pickPath('file', { defaultPath: desk.settings.lastCreateDir || undefined })
    if (!path) return
    const count = addLocalPaths(props.category.id, [path])
    if (count > 0) toast.success('文件快捷方式已添加')
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

async function addApp(): Promise<void> {
  addMenuOpen.value = false
  try {
    const path = await pickPath('file', {
      title: '选择要添加的软件',
      defaultPath: desk.settings.lastCreateDir || undefined,
      filters: [
        {
          name: '应用程序',
          extensions: ['exe', 'lnk', 'bat', 'cmd', 'msi', 'appref-ms'],
        },
      ],
    })
    if (!path) return
    const count = addLocalPaths(props.category.id, [path])
    if (count > 0) toast.success('软件快捷方式已添加')
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

async function addFolder(): Promise<void> {
  addMenuOpen.value = false
  try {
    const path = await pickPath('folder', { defaultPath: desk.settings.lastCreateDir || undefined })
    if (!path) return
    if (addFolderPath(props.category.id, path)) toast.success('文件夹入口已添加')
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

function openCreate(): void {
  addMenuOpen.value = false
  openCreator(props.category.id)
}

function openLink(): void {
  addMenuOpen.value = false
  openItemEditor(props.category.id, null)
}

function openBookmarks(): void {
  addMenuOpen.value = false
  openBookmarkImporter(props.category.id)
}

function editItem(item: DeskItem): void {
  openItemEditor(props.category.id, item.id)
}

async function removeCategory(): Promise<void> {
  moreMenuOpen.value = false
  const confirmed = await askConfirm({
    title: `删除「${props.category.name}」？`,
    message:
      props.category.items.length > 0
        ? `分类中的 ${props.category.items.length} 个图标入口会一并移除，但不会删除本机文件或浏览器书签。`
        : '这个分类会被移除，此操作无法撤销。',
    confirmText: '删除分类',
    tone: 'danger',
  })
  if (!confirmed) return
  deleteCategory(props.category.id)
  toast.success('分类已删除')
}

let dragStart = { pointerX: 0, pointerY: 0, categoryX: 0, categoryY: 0 }
let dragMoved = false
let dragActive = false
let dragSize = { width: 356, height: 280 }
let snapTargets: ReturnType<typeof collectSnapRects> = []

function startDrag(event: PointerEvent): void {
  if (event.button !== 0) return
  if ((event.target as HTMLElement).closest('button, input, a, [data-no-drag]')) return
  event.preventDefault()
  addMenuOpen.value = false
  moreMenuOpen.value = false
  focusCategory(props.category.id)
  emit('focus')
  dragStart = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    categoryX: props.category.x,
    categoryY: props.category.y,
  }
  const bounds = cardEl.value?.getBoundingClientRect()
  dragSize = {
    width: bounds?.width ?? 356,
    height: bounds?.height ?? 280,
  }
  snapTargets = collectSnapRects(cardEl.value)
  dragMoved = false
  dragActive = true
  dragging.value = true
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function onDragMove(event: PointerEvent): void {
  if (!dragActive) return
  const dx = event.clientX - dragStart.pointerX
  const dy = event.clientY - dragStart.pointerY
  if (!dragMoved && Math.abs(dx) + Math.abs(dy) < 3) return
  dragMoved = true
  if (event.cancelable) event.preventDefault()

  let nextX = dragStart.categoryX + dx
  let nextY = dragStart.categoryY + dy
  if (event.altKey) {
    clearAlignment()
  } else {
    const snapped = snapRect(
      {
        left: dragStart.categoryX + WINDOW_EDGE + dx,
        top: dragStart.categoryY + WINDOW_EDGE + dy,
        ...dragSize,
      },
      snapTargets,
    )
    nextX = snapped.left - WINDOW_EDGE
    nextY = snapped.top - WINDOW_EDGE
    const clamped = clampCategoryPosition(nextX, nextY)
    alignmentState.vertical = Math.abs(clamped.x - nextX) < 1 ? snapped.vertical : null
    alignmentState.horizontal = Math.abs(clamped.y - nextY) < 1 ? snapped.horizontal : null
    moveCategory(props.category.id, clamped.x, clamped.y)
    return
  }

  moveCategory(props.category.id, nextX, nextY)
}

function endDrag(): void {
  if (!dragActive) return
  dragActive = false
  dragging.value = false
  clearAlignment()
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
  if (dragMoved) persistNow()
}

onBeforeUnmount(endDrag)
</script>

<template>
  <article
    ref="cardEl"
    class="category-surface group/card absolute flex max-w-[calc(100vw-24px)] flex-col rounded-[24px] border border-white/40 text-slate-800 transition-[box-shadow,border-color] duration-200 dark:border-white/[0.11] dark:text-slate-100"
    :class="[
      dragging ? 'is-dragging' : '',
      dropTargeted
        ? 'border-brand-300/80 ring-2 ring-brand-400/75 dark:border-brand-300/60'
        : '',
    ]"
    :style="cardStyle"
    :aria-label="`${category.name} 分类`"
    :data-category-id="category.id"
    data-snap-card
    data-desktop-hit
    data-hit-padding="38"
  >
    <div
      class="pointer-events-none absolute inset-x-8 top-0 h-px opacity-70"
      :style="{ background: `linear-gradient(90deg, transparent, ${accent.color}, transparent)` }"
    />
    <div
      v-if="dropTargeted"
      class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[24px] border-2 border-dashed border-brand-400/60 bg-brand-500/[0.09]"
    >
      <span class="flex items-center gap-2 rounded-xl border border-brand-400/30 bg-[#171b2c]/90 px-3 py-2 text-[12px] font-medium text-white shadow-xl backdrop-blur-md">
        <FilePlus2 :size="15" />
        松开添加到「{{ category.name }}」
      </span>
    </div>

    <header
      class="drag-region flex items-center gap-2.5 px-3.5 pb-2.5 pt-3.5"
      @pointerdown="startDrag"
    >
      <span
        class="flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset"
        :style="{
          backgroundColor: accent.soft,
          color: accent.color,
          borderColor: `rgb(${accent.rgb} / 0.22)`,
          boxShadow: `inset 0 0 0 1px rgb(${accent.rgb} / 0.16)`,
        }"
      >
        <component :is="categoryGlyph" :size="15" :stroke-width="1.9" />
      </span>
      <div class="min-w-0 flex-1">
        <h2 class="truncate font-display text-[14px] font-semibold leading-5 tracking-[-0.005em]">
          {{ category.name }}
        </h2>
        <p class="mt-0.5 flex items-center gap-1 text-[10.5px] leading-3 text-slate-500 dark:text-slate-400">
          <span>{{ category.items.length }} 个图标</span>
          <span
            v-if="category.privacy"
            class="inline-flex items-center gap-0.5 rounded bg-brand-500/10 px-1 py-0.5 text-[8.5px] font-medium text-brand-600 dark:text-brand-300"
            title="隐私分类"
          >
            <LockKeyhole :size="8" :stroke-width="2.4" />
            隐私
          </span>
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          class="icon-btn h-7 w-7"
          aria-label="添加图标"
          title="添加图标"
          @click="toggleAddMenu"
        >
          <Plus :size="16" />
        </button>
        <button
          type="button"
          class="icon-btn h-7 w-7"
          :aria-label="category.collapsed ? '展开分类' : '折叠分类'"
          :aria-expanded="!category.collapsed"
          :title="category.collapsed ? '展开' : '折叠'"
          @click="toggleCollapsed"
        >
          <ChevronUp v-if="category.collapsed" :size="15" />
          <ChevronDown v-else :size="15" />
        </button>
        <button
          type="button"
          class="icon-btn h-7 w-7"
          aria-label="分类设置"
          title="分类设置"
          @click="toggleMoreMenu"
        >
          <MoreHorizontal :size="16" />
        </button>
      </div>
    </header>

    <div
      v-if="!category.collapsed"
      class="desk-scroll max-h-[min(438px,calc(100vh-230px))] overflow-y-auto px-3 pb-3.5 pt-0.5"
    >
      <div v-if="category.items.length > 0" class="grid grid-cols-4 gap-x-1 gap-y-2.5">
        <IconTile
          v-for="item in category.items"
          :key="item.id"
          :item="item"
          :category-id="category.id"
          @edit="editItem"
        />
        <button
          type="button"
          class="group/add flex min-w-0 flex-col items-center rounded-2xl px-0.5 pb-1 pt-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-400/80"
          title="添加图标"
          @click="toggleAddMenu"
        >
          <span
            class="flex h-[58px] w-[58px] items-center justify-center rounded-[18px] border border-dashed border-slate-400/35 text-slate-400 transition duration-200 group-hover/add:scale-[1.03] group-hover/add:border-slate-400/60 group-hover/add:bg-slate-900/[0.035] group-hover/add:text-slate-600 dark:border-white/15 dark:text-slate-500 dark:group-hover/add:border-white/25 dark:group-hover/add:bg-white/[0.045] dark:group-hover/add:text-slate-300"
          >
            <Plus :size="21" :stroke-width="1.6" />
          </span>
          <span class="mt-1.5 min-h-[26px] text-[11px] leading-[13px] text-slate-400 dark:text-slate-500">
            添加
          </span>
        </button>
      </div>

      <button
        v-else
        type="button"
        class="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-400/25 px-4 py-6 text-center transition hover:border-brand-400/50 hover:bg-brand-500/[0.04] dark:border-white/[0.12]"
        @click="toggleAddMenu"
      >
        <span
          class="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl"
          :style="{ backgroundColor: accent.soft, color: accent.color }"
        >
          <Plus :size="18" />
        </span>
        <span class="text-[12.5px] font-medium text-slate-600 dark:text-slate-300">添加第一个图标</span>
        <span class="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          文件、文件夹或网页书签
        </span>
      </button>
    </div>

    <DropdownMenu
      :open="addMenuOpen"
      :anchor="addAnchor"
      :width="230"
      :z-index="75"
      @close="addMenuOpen = false"
    >
      <div class="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-400 dark:text-slate-500">
        添加到本分类
      </div>
      <button class="menu-item" type="button" @click="addApp">
        <AppWindow :size="15" class="text-slate-400" />
        添加软件快捷方式
      </button>
      <button class="menu-item" type="button" @click="addFile">
        <FilePlus2 :size="15" class="text-slate-400" />
        添加本机文件
      </button>
      <button class="menu-item" type="button" @click="addFolder">
        <FolderOpen :size="15" class="text-slate-400" />
        文件夹快捷方式
      </button>
      <button class="menu-item" type="button" @click="openLink">
        <Link2 :size="15" class="text-slate-400" />
        添加网址
      </button>
      <button class="menu-item" type="button" @click="openBookmarks">
        <Bookmark :size="15" class="text-slate-400" />
        导入浏览器书签
      </button>
      <div class="my-1 h-px bg-slate-900/[0.07] dark:bg-white/[0.08]" />
      <button class="menu-item" type="button" @click="openCreate">
        <FolderPlus :size="15" class="text-slate-400" />
        新建文件 / 文件夹
      </button>
    </DropdownMenu>

    <DropdownMenu
      :open="moreMenuOpen"
      :anchor="moreAnchor"
      :width="246"
      :z-index="75"
      @close="moreMenuOpen = false"
    >
      <div class="px-2.5 pb-2 pt-2">
        <div class="mb-2 flex items-center justify-between text-[11px]">
          <span class="font-medium text-slate-500 dark:text-slate-400">卡片背景不透明度</span>
          <span class="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
            {{ displayedOpacityPercent }}%
          </span>
        </div>
        <input
          class="range"
          type="range"
          min="0"
          max="100"
          step="1"
          :value="displayedOpacityPercent"
          :style="rangeStyle"
          :disabled="uniformCards"
          aria-label="卡片背景不透明度"
          :class="uniformCards ? 'pointer-events-none opacity-40' : ''"
          @input="adjustOpacity"
        />
        <p v-if="uniformCards" class="mt-1.5 text-[9.5px] text-slate-400 dark:text-slate-500">
          当前由设置中的「统一分类外观」控制
        </p>
      </div>
      <div class="my-1 h-px bg-slate-900/[0.07] dark:bg-white/[0.08]" />
      <button class="menu-item" type="button" @click="editCategory">
        <Pencil :size="15" class="text-slate-400" />
        编辑分类与配色
      </button>
      <button
        class="menu-item"
        type="button"
        @click="toggleCollapsed(); moreMenuOpen = false"
      >
        <ChevronDown v-if="!category.collapsed" :size="15" class="text-slate-400" />
        <ChevronUp v-else :size="15" class="text-slate-400" />
        {{ category.collapsed ? '展开分类' : '折叠分类' }}
      </button>
      <div class="my-1 h-px bg-slate-900/[0.07] dark:bg-white/[0.08]" />
      <button class="menu-item-danger" type="button" @click="removeCategory">
        <Trash2 :size="15" />
        删除分类
      </button>
    </DropdownMenu>
  </article>
</template>
