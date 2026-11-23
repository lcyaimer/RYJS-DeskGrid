<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { LockKeyhole, Plus, Settings, SlidersHorizontal } from 'lucide-vue-next'
import type { AccentKey, MenuAnchor } from '../types'
import { ACCENTS, MIN_SYSTEM_CARD_OPACITY } from '../constants'
import {
  clampCategoryPosition,
  desk,
  effectiveSystemCardOpacity,
  hasPrivateCategories,
  lockPrivateCategories,
  persistNow,
  updateSettings,
} from '../stores/desk'
import { categoryBackground, tileBackground } from '../lib/utils'
import { WINDOW_EDGE } from '../lib/layout'
import {
  alignmentState,
  clearAlignment,
  collectSnapRects,
  snapRect,
} from '../lib/alignment'
import { askConfirm, toast } from '../lib/feedback'
import {
  openCategoryEditor,
  openPrivacyUnlock,
  openSettings,
} from '../lib/overlays'
import BrandMark from './BrandMark.vue'
import DropdownMenu from './DropdownMenu.vue'

const privacyLocked = computed(
  () => desk.settings.privacyLocked && hasPrivateCategories(),
)
const privateCategoryCount = computed(
  () => desk.categories.filter((category) => category.privacy).length,
)
const visibleCategories = computed(() =>
  desk.categories.filter(
    (category) => !(desk.settings.privacyLocked && category.privacy),
  ),
)
const visibleCategoryCount = computed(() => visibleCategories.value.length)
const visibleItemCount = computed(() =>
  visibleCategories.value.reduce((total, category) => total + category.items.length, 0),
)
const uniformCards = computed(() => desk.settings.uniformCards)
const accent = computed(() => {
  const key: AccentKey = desk.settings.uniformCards
    ? desk.settings.globalAccent
    : 'violet'
  return ACCENTS[key] ?? ACCENTS.violet
})
const surfaceBackground = computed(() =>
  categoryBackground(desk.settings.theme, effectiveSystemCardOpacity()),
)
const cardStyle = computed<Record<string, string>>(() => ({
  left: `${desk.settings.systemCardX}px`,
  top: `${desk.settings.systemCardY}px`,
  width: '356px',
  zIndex: '40',
  '--category-bg': surfaceBackground.value,
}))

const opacityPercent = computed(() =>
  Math.round(effectiveSystemCardOpacity() * 100),
)
const rangeStyle = computed(() => ({
  '--range-color': accent.value.color,
  '--range-value': `${Math.round(
    Math.max(
      0,
      (effectiveSystemCardOpacity() - MIN_SYSTEM_CARD_OPACITY) /
        (1 - MIN_SYSTEM_CARD_OPACITY),
    ) * 100,
  )}%`,
}))

const opacityMenuOpen = ref(false)
const opacityAnchor = ref<MenuAnchor | null>(null)
const dragging = ref(false)
const cardEl = ref<HTMLElement | null>(null)

let dragActive = false
let dragMoved = false
let dragStart = { pointerX: 0, pointerY: 0, cardX: 0, cardY: 0 }
let dragSize = { width: 356, height: 160 }
let snapTargets: ReturnType<typeof collectSnapRects> = []

function actionStyle(key: AccentKey): Record<string, string> {
  const item = ACCENTS[key] ?? ACCENTS.violet
  return {
    background: tileBackground(key),
    boxShadow: `0 9px 22px -10px rgb(${item.rgb} / 0.58), inset 0 1px 0 0 rgba(255,255,255,0.28)`,
  }
}

const privacyTileStyle = computed(() =>
  actionStyle(privacyLocked.value ? 'rose' : 'amber'),
)

function addCategory(): void {
  openCategoryEditor(null)
}

function openPreferences(): void {
  openSettings('appearance')
}

function toggleOpacityMenu(event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  opacityAnchor.value = {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
  opacityMenuOpen.value = !opacityMenuOpen.value
}

function adjustOpacity(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  updateSettings({ topBarOpacity: value / 100 })
}

function openAppearanceSettings(): void {
  opacityMenuOpen.value = false
  openSettings('appearance')
}

async function togglePrivacy(): Promise<void> {
  if (privacyLocked.value) {
    openPrivacyUnlock()
    return
  }
  if (!desk.settings.passwordHash) {
    toast.info('请先设置隐私锁密码')
    openSettings('security')
    return
  }
  if (privateCategoryCount.value === 0) {
    toast.info('还没有开启隐私的分类，请在分类设置中开启')
    return
  }
  const confirmed = await askConfirm({
    title: '锁定隐私分类？',
    message: `${privateCategoryCount.value} 个隐私分类会从桌面隐藏。右键托盘选择「隐私锁…」或点击「系统」卡上的锁按钮即可解锁。`,
    confirmText: '锁定',
    tone: 'normal',
  })
  if (!confirmed) return
  if (lockPrivateCategories()) {
    toast.success('隐私分类已隐藏，可在托盘菜单中解锁')
  }
}

function startDrag(event: PointerEvent): void {
  if (event.button !== 0) return
  if ((event.target as HTMLElement).closest('button, input, a, [data-no-drag]')) return
  event.preventDefault()
  opacityMenuOpen.value = false
  dragStart = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    cardX: desk.settings.systemCardX,
    cardY: desk.settings.systemCardY,
  }
  const bounds = cardEl.value?.getBoundingClientRect()
  dragSize = {
    width: bounds?.width ?? 356,
    height: bounds?.height ?? 160,
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

  let nextX = dragStart.cardX + dx
  let nextY = dragStart.cardY + dy
  if (!event.altKey) {
    const snapped = snapRect(
      {
        left: dragStart.cardX + WINDOW_EDGE + dx,
        top: dragStart.cardY + WINDOW_EDGE + dy,
        ...dragSize,
      },
      snapTargets,
    )
    nextX = snapped.left - WINDOW_EDGE
    nextY = snapped.top - WINDOW_EDGE
    const position = clampCategoryPosition(nextX, nextY)
    alignmentState.vertical = Math.abs(position.x - nextX) < 1 ? snapped.vertical : null
    alignmentState.horizontal = Math.abs(position.y - nextY) < 1 ? snapped.horizontal : null
    updateSettings({ systemCardX: position.x, systemCardY: position.y })
    return
  }

  clearAlignment()
  const position = clampCategoryPosition(nextX, nextY)
  updateSettings({ systemCardX: position.x, systemCardY: position.y })
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
    :class="dragging ? 'is-dragging' : ''"
    :style="cardStyle"
    aria-label="系统"
    data-snap-card
    data-desktop-hit
    data-hit-padding="38"
  >
    <div
      class="pointer-events-none absolute inset-x-8 top-0 h-px opacity-70"
      :style="{ background: `linear-gradient(90deg, transparent, ${accent.color}, transparent)` }"
    />

    <header
      class="drag-region flex items-center gap-2.5 px-3.5 pb-2 pt-3"
      @pointerdown="startDrag"
    >
      <BrandMark :size="31" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <h2 class="truncate font-display text-[14px] font-semibold leading-5 tracking-[-0.005em]">
            系统
          </h2>
          <span
            v-if="privacyLocked"
            class="inline-flex items-center gap-0.5 rounded bg-brand-500/10 px-1 py-0.5 text-[8.5px] font-medium text-brand-600 dark:text-brand-300"
          >
            <LockKeyhole :size="8" :stroke-width="2.4" />
            已锁
          </span>
        </div>
        <p class="mt-0.5 flex items-center gap-1 text-[10.5px] leading-3 text-slate-500 dark:text-slate-400">
          <span>{{ visibleCategoryCount }} 个分类 · {{ visibleItemCount }} 个图标</span>
        </p>
      </div>
    </header>

    <div class="px-3 pb-3 pt-0.5">
      <div class="grid grid-cols-4 gap-x-1 gap-y-2.5">
        <button
          type="button"
          class="group/action flex min-w-0 flex-col items-center rounded-2xl px-0.5 pb-0.5 pt-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400/80"
          title="新建分类"
          @click="addCategory"
        >
          <span
            class="relative flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[18px] border border-white/25 text-white transition duration-200 group-hover/action:-translate-y-0.5 group-hover/action:scale-[1.035] group-hover/action:brightness-110 group-active/action:translate-y-0 group-active/action:scale-[0.98]"
            :style="actionStyle('violet')"
          >
            <span class="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_42%)] opacity-70" />
            <Plus :size="25" :stroke-width="1.9" class="relative drop-shadow-sm" />
          </span>
          <span class="mt-1 line-clamp-1 w-full text-center text-[11.5px] font-medium leading-[14px] text-slate-700 dark:text-slate-200">
            新建分类
          </span>
        </button>

        <button
          type="button"
          class="group/action flex min-w-0 flex-col items-center rounded-2xl px-0.5 pb-0.5 pt-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400/80"
          title="系统卡背景不透明度"
          aria-label="调节系统卡背景不透明度"
          @click="toggleOpacityMenu"
        >
          <span
            class="relative flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[18px] border border-white/25 text-white transition duration-200 group-hover/action:-translate-y-0.5 group-hover/action:scale-[1.035] group-hover/action:brightness-110 group-active/action:translate-y-0 group-active/action:scale-[0.98]"
            :style="actionStyle('cyan')"
          >
            <span class="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_42%)] opacity-70" />
            <SlidersHorizontal :size="24" :stroke-width="1.9" class="relative drop-shadow-sm" />
          </span>
          <span class="mt-1 line-clamp-1 w-full text-center text-[11.5px] font-medium leading-[14px] text-slate-700 dark:text-slate-200">
            透明度
          </span>
        </button>

        <button
          type="button"
          class="group/action flex min-w-0 flex-col items-center rounded-2xl px-0.5 pb-0.5 pt-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400/80"
          :title="privacyLocked ? '解锁隐私分类' : '锁定隐私分类'"
          :aria-label="privacyLocked ? '解锁隐私分类' : '锁定隐私分类'"
          @click="togglePrivacy"
        >
          <span
            class="relative flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[18px] border border-white/25 text-white transition duration-200 group-hover/action:-translate-y-0.5 group-hover/action:scale-[1.035] group-hover/action:brightness-110 group-active/action:translate-y-0 group-active/action:scale-[0.98]"
            :style="privacyTileStyle"
          >
            <span class="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_42%)] opacity-70" />
            <LockKeyhole :size="24" :stroke-width="1.9" class="relative drop-shadow-sm" />
          </span>
          <span class="mt-1 line-clamp-1 w-full text-center text-[11.5px] font-medium leading-[14px] text-slate-700 dark:text-slate-200">
            隐私锁
          </span>
        </button>

        <button
          type="button"
          class="group/action flex min-w-0 flex-col items-center rounded-2xl px-0.5 pb-0.5 pt-0.5 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400/80"
          title="设置"
          aria-label="打开设置"
          @click="openPreferences"
        >
          <span
            class="relative flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[18px] border border-white/25 text-white transition duration-200 group-hover/action:-translate-y-0.5 group-hover/action:scale-[1.035] group-hover/action:brightness-110 group-active/action:translate-y-0 group-active/action:scale-[0.98]"
            :style="actionStyle('slate')"
          >
            <span class="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_42%)] opacity-70" />
            <Settings :size="24" :stroke-width="1.9" class="relative drop-shadow-sm" />
          </span>
          <span class="mt-1 line-clamp-1 w-full text-center text-[11.5px] font-medium leading-[14px] text-slate-700 dark:text-slate-200">
            设置
          </span>
        </button>
      </div>
    </div>

    <DropdownMenu
      :open="opacityMenuOpen"
      :anchor="opacityAnchor"
      :width="250"
      :z-index="75"
      @close="opacityMenuOpen = false"
    >
      <div class="px-2.5 pb-2 pt-2">
        <div class="mb-2 flex items-center justify-between text-[11px]">
          <span class="font-medium text-slate-500 dark:text-slate-400">系统卡背景不透明度</span>
          <span class="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">{{ opacityPercent }}%</span>
        </div>
        <input
          class="range"
          type="range"
          :min="Math.round(MIN_SYSTEM_CARD_OPACITY * 100)"
          max="100"
          step="1"
          :value="opacityPercent"
          :style="rangeStyle"
          :disabled="uniformCards"
          aria-label="系统卡背景不透明度"
          :class="uniformCards ? 'pointer-events-none opacity-40' : ''"
          @input="adjustOpacity"
        />
        <p v-if="uniformCards" class="mt-1.5 text-[9.5px] text-slate-400 dark:text-slate-500">
          当前由设置中的「统一分类外观」控制
        </p>
      </div>
      <div class="my-1 h-px bg-slate-900/[0.07] dark:bg-white/[0.08]" />
      <button class="menu-item" type="button" @click="openAppearanceSettings">
        <Settings :size="15" class="text-slate-400" />
        更多外观设置…
      </button>
    </DropdownMenu>
  </article>
</template>
