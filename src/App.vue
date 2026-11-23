<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { LayoutGrid, Plus, RotateCcw } from 'lucide-vue-next'
import BrandMark from './components/BrandMark.vue'
import SystemCard from './components/SystemCard.vue'
import CategoryCard from './components/CategoryCard.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import CategoryEditor from './components/CategoryEditor.vue'
import ItemEditor from './components/ItemEditor.vue'
import CreatorDialog from './components/CreatorDialog.vue'
import BookmarkImporter from './components/BookmarkImporter.vue'
import PrivacyUnlockDialog from './components/PrivacyUnlockDialog.vue'
import OnboardingOverlay from './components/OnboardingOverlay.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import ToastStack from './components/ToastStack.vue'
import AlignmentGuides from './components/AlignmentGuides.vue'
import DragDropOverlay from './components/DragDropOverlay.vue'
import {
  addDroppedItems,
  clampAllCategoryPositions,
  desk,
  hasPrivateCategories,
  initDesk,
  isReady,
  lockPrivateCategories,
  persistNow,
} from './stores/desk'
import {
  openCategoryEditor,
  openOnboarding,
  openPrivacyUnlock,
  openSettings,
} from './lib/overlays'
import {
  getAutostartEnabled,
  inspectDroppedPaths,
  isTauriRuntime,
  listenOnboardingRequests,
  listenTrayEvents,
  setAutostartEnabled,
  type TrayAction,
} from './lib/platform'
import { useWindowLayer } from './lib/windowLayer'
import { WINDOW_EDGE } from './lib/layout'
import { errorMessage, toast } from './lib/feedback'
import {
  categoryIdForDrag,
  dragDropState,
  resetDragDrop,
} from './lib/dragDrop'

const booting = ref(true)
const bootError = ref('')
const contentStyle = {
  left: `${WINDOW_EDGE}px`,
  top: `${WINDOW_EDGE}px`,
  width: `calc(100% - ${WINDOW_EDGE * 2}px)`,
  height: `calc(100% - ${WINDOW_EDGE * 2}px)`,
}
let trayUnlisten: (() => void) | null = null
let onboardingUnlisten: (() => void) | null = null
let dragUnlisten: (() => void) | null = null
let resizeFrame = 0

const extraOverlay = computed(() => Boolean(bootError.value))
const visibleCategories = computed(() =>
  desk.categories.filter(
    (category) => !(desk.settings.privacyLocked && category.privacy),
  ),
)

useWindowLayer(extraOverlay)

function handlePrivacyAction(): void {
  if (!desk.settings.passwordHash) {
    toast.info('请先在设置中创建隐私锁密码')
    openSettings('security')
    return
  }
  if (!hasPrivateCategories()) {
    toast.info('还没有开启隐私的分类，可在分类设置中开启')
    return
  }
  if (desk.settings.privacyLocked) {
    openPrivacyUnlock()
    return
  }
  if (lockPrivateCategories()) {
    toast.success('隐私分类已隐藏，可通过托盘菜单「隐私锁…」解锁')
  }
}

function handleTrayAction(action: TrayAction): void {
  if (action === 'open-settings') {
    openSettings('appearance')
    return
  }
  handlePrivacyAction()
}

async function addDroppedToCategory(
  categoryId: string | null,
  paths: string[],
): Promise<void> {
  if (!categoryId) {
    toast.info('请把文件、文件夹或快捷方式拖到分类卡片上松开')
    return
  }
  const category = desk.categories.find((entry) => entry.id === categoryId)
  if (!category) return
  try {
    const entries = await inspectDroppedPaths(paths)
    const result = addDroppedItems(categoryId, entries)
    if (result.added > 0) {
      const skipped = result.skipped > 0 ? `，跳过 ${result.skipped} 个重复项` : ''
      toast.success(`已添加 ${result.added} 项到「${category.name}」${skipped}`)
    } else if (result.skipped > 0) {
      toast.info('这些项目已经在分类中')
    } else {
      toast.error('没有识别到可添加的文件')
    }
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

interface NativeDragPayload {
  paths?: string[]
  position: { x: number; y: number }
}

type NativeDragKind = 'enter' | 'over' | 'drop'

function handleNativeDrag(kind: NativeDragKind, payload: NativeDragPayload): void {
  const dpr = window.devicePixelRatio || 1
  dragDropState.active = true
  if (kind === 'enter') {
    dragDropState.fileCount = payload.paths?.length ?? 0
  }
  const hit = categoryIdForDrag(payload.position, dpr)
  if (kind === 'drop') {
    const target = hit ?? dragDropState.targetCategoryId
    const paths = [...(payload.paths ?? [])]
    resetDragDrop()
    if (paths.length > 0) void addDroppedToCategory(target, paths)
    return
  }
  dragDropState.targetCategoryId = hit
}

async function listenNativeDrag(): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen<NativeDragPayload>('deskgrid://native-drag-enter', (event) =>
      handleNativeDrag('enter', event.payload),
    ),
    listen<NativeDragPayload>('deskgrid://native-drag-over', (event) =>
      handleNativeDrag('over', event.payload),
    ),
    listen<NativeDragPayload>('deskgrid://native-drag-drop', (event) =>
      handleNativeDrag('drop', event.payload),
    ),
    listen('deskgrid://native-drag-leave', () => resetDragDrop()),
  ])
  return () => {
    for (const unlisten of unlisteners) unlisten()
  }
}

function onResize(): void {
  if (resizeFrame) return
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0
    clampAllCategoryPositions()
  })
}

function onGlobalContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"]')) return
  event.preventDefault()
}

function reloadApp(): void {
  window.location.reload()
}

function flushPersistence(): void {
  if (isReady.value) persistNow()
}

async function syncAutostartPreference(): Promise<void> {
  if (!isTauriRuntime() || !import.meta.env.PROD) return
  try {
    const desired = desk.settings.autostart
    const actual = await getAutostartEnabled()
    if (actual !== desired) await setAutostartEnabled(desired)
  } catch {
    // Registry access is best-effort and must never block the desktop.
  }
}

watch(
  () => desk.settings.autostart,
  () => {
    void syncAutostartPreference()
  },
)

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    resetDragDrop()
    flushPersistence()
  }
}

onMounted(async () => {
  window.addEventListener('resize', onResize)
  document.addEventListener('contextmenu', onGlobalContextMenu)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('beforeunload', flushPersistence)

  listenTrayEvents(handleTrayAction)
    .then((unlisten) => {
      trayUnlisten = unlisten
    })
    .catch(() => undefined)

  listenOnboardingRequests(() => openOnboarding())
    .then((unlisten) => {
      onboardingUnlisten = unlisten
    })
    .catch(() => undefined)

  if (isTauriRuntime()) {
    listenNativeDrag()
      .then((unlisten) => {
        dragUnlisten = unlisten
      })
      .catch(() => undefined)
  }

  try {
    await initDesk()
    booting.value = false
    if (!desk.settings.onboardingDone) {
      openOnboarding()
    }
    void syncAutostartPreference()
  } catch (error) {
    bootError.value = errorMessage(error)
    booting.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  document.removeEventListener('contextmenu', onGlobalContextMenu)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('beforeunload', flushPersistence)
  trayUnlisten?.()
  onboardingUnlisten?.()
  dragUnlisten?.()
  resetDragDrop()
  if (resizeFrame) window.cancelAnimationFrame(resizeFrame)
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden">
    <div v-if="booting" class="flex h-full w-full items-center justify-center p-6">
      <div
        class="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0f1422]/85 px-4 py-3 text-white shadow-2xl backdrop-blur-xl"
        data-desktop-hit
        data-hit-padding="24"
      >
        <BrandMark :size="34" class="animate-pulse" />
        <div>
          <p class="text-[12.5px] font-medium">正在准备桌面…</p>
          <p class="mt-0.5 text-[10.5px] text-slate-400">加载本机布局</p>
        </div>
      </div>
    </div>

    <div v-else-if="bootError" class="flex h-full w-full items-center justify-center p-6">
      <div class="w-full max-w-sm rounded-3xl border border-white/15 bg-[#0f1422]/95 p-6 text-white shadow-2xl">
        <BrandMark :size="38" />
        <h1 class="mt-4 font-display text-[18px] font-semibold">桌面启动失败</h1>
        <p class="mt-2 text-[12px] leading-5 text-slate-400">{{ bootError }}</p>
        <button
          class="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-[12.5px] font-medium text-white transition hover:bg-brand-400"
          type="button"
          @click="reloadApp"
        >
          <RotateCcw :size="14" />
          重新加载
        </button>
      </div>
    </div>

    <template v-else>
      <div class="absolute" :style="contentStyle">
        <CategoryCard
          v-for="category in visibleCategories"
          :key="category.id"
          :category="category"
        />

        <SystemCard />

        <div
          v-if="desk.categories.length === 0"
          class="absolute inset-0 flex items-center justify-center p-6"
          data-desktop-hit
          data-hit-padding="28"
        >
          <div class="w-full max-w-[380px] rounded-[26px] border border-white/45 bg-white/70 p-7 text-center text-slate-900 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#0f1422]/85 dark:text-white">
            <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500 ring-1 ring-inset ring-brand-500/15 dark:text-brand-300">
              <LayoutGrid :size="22" />
            </span>
            <h1 class="mt-4 font-display text-[19px] font-semibold tracking-[-0.02em]">从第一个分类开始</h1>
            <p class="mx-auto mt-2 max-w-[280px] text-[12px] leading-6 text-slate-500 dark:text-slate-400">
              新建一个分类，把深处藏着的文件和常用网址收进你的透明桌面。
            </p>
            <button
              class="btn-primary mx-auto mt-5"
              type="button"
              @click="openCategoryEditor(null)"
            >
              <Plus :size="15" />
              新建分类
            </button>
          </div>
        </div>
      </div>
    </template>

    <AlignmentGuides />
    <DragDropOverlay />
    <SettingsDialog />
    <CategoryEditor />
    <ItemEditor />
    <CreatorDialog />
    <BookmarkImporter />
    <PrivacyUnlockDialog />
    <OnboardingOverlay />
    <ConfirmDialog />
    <ToastStack />
  </div>
</template>
