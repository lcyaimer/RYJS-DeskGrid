import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  watch,
  type ComputedRef,
} from 'vue'
import type { WindowRect } from '../types'
import { confirmState } from './feedback'
import { hasOpenFloatingMenu } from './menuLayer'
import { overlayState } from './overlays'
import { isTauriRuntime, setWindowLayout } from './platform'

const HIT_SELECTOR = '[data-desktop-hit]'
const DIALOG_SELECTOR = '[data-dialog-surface]'
const OBSERVED_SELECTOR = `${HIT_SELECTOR}, ${DIALOG_SELECTOR}`

function normalizedPadding(element: HTMLElement): number {
  const raw = Number(element.dataset.hitPadding)
  return Number.isFinite(raw) && raw >= 0 ? raw : 24
}

function normalizedRadius(element: HTMLElement): number {
  const raw = Number(element.dataset.hitRadius)
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

function collectSelectorRects(selector: string): WindowRect[] {
  const dpr = window.devicePixelRatio || 1
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const rects: WindowRect[] = []

  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const bounds = element.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) continue

    const padding = normalizedPadding(element)
    const left = Math.max(0, bounds.left - padding)
    const top = Math.max(0, bounds.top - padding)
    const right = Math.min(viewportWidth, bounds.right + padding)
    const bottom = Math.min(viewportHeight, bounds.bottom + padding)
    if (right <= left || bottom <= top) continue

    const radius = normalizedRadius(element)
    rects.push({
      x: Math.round(left * dpr),
      y: Math.round(top * dpr),
      width: Math.round((right - left) * dpr),
      height: Math.round((bottom - top) * dpr),
      ...(radius > 0 ? { radius: Math.round(radius * dpr) } : {}),
    })
  }

  return rects
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export function useWindowLayer(extraOverlay: ComputedRef<boolean>): void {
  // Dialogs float above normal apps and leave the rest of the screen clickable.
  const dialogOpen = computed(
    () =>
      overlayState.settingsOpen ||
      overlayState.categoryEditorOpen ||
      overlayState.itemEditorOpen ||
      overlayState.creatorOpen ||
      overlayState.bookmarksOpen ||
      overlayState.privacyUnlockOpen ||
      confirmState.open,
  )
  // Onboarding, dropdown menus and the boot error intentionally use the whole
  // surface and block the desktop while open.
  const fullScreenOverlay = computed(
    () =>
      extraOverlay.value ||
      overlayState.onboardingOpen ||
      hasOpenFloatingMenu.value,
  )
  const overlayActive = computed(() => dialogOpen.value || fullScreenOverlay.value)

  let mutationObserver: MutationObserver | null = null
  let resizeObserver: ResizeObserver | null = null
  let scheduledFrame = 0
  let version = 0
  const observedTargets = new Set<Element>()

  function observeTargets(): void {
    if (!resizeObserver) return
    const nextTargets = new Set<Element>(document.querySelectorAll(OBSERVED_SELECTOR))
    for (const element of observedTargets) {
      if (!nextTargets.has(element)) {
        resizeObserver.unobserve(element)
        observedTargets.delete(element)
      }
    }
    for (const element of nextTargets) {
      if (!observedTargets.has(element)) {
        resizeObserver.observe(element)
        observedTargets.add(element)
      }
    }
  }

  async function applyLayout(): Promise<void> {
    if (!isTauriRuntime()) return
    const currentVersion = ++version

    if (fullScreenOverlay.value) {
      try {
        await setWindowLayout(true, [])
      } catch {
        // Window layout is a progressive enhancement.
      }
      return
    }

    await nextTick()
    await nextFrame()
    if (currentVersion !== version) return

    if (fullScreenOverlay.value) {
      try {
        await setWindowLayout(true, [])
      } catch {
        // Ignore.
      }
      return
    }

    observeTargets()
    const rects = collectSelectorRects(HIT_SELECTOR)
    if (dialogOpen.value) {
      rects.push(...collectSelectorRects(DIALOG_SELECTOR))
    }
    try {
      await setWindowLayout(dialogOpen.value, rects)
    } catch {
      // Ignore.
    }
  }

  function scheduleLayout(): void {
    if (!isTauriRuntime() || scheduledFrame) return
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = 0
      void applyLayout()
    })
  }

  watch(overlayActive, scheduleLayout, { flush: 'post' })
  watch(dialogOpen, scheduleLayout, { flush: 'post' })

  onMounted(() => {
    mutationObserver = new MutationObserver(() => {
      scheduleLayout()
    })
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })

    resizeObserver = new ResizeObserver(() => {
      scheduleLayout()
    })
    resizeObserver.observe(document.body)
    observeTargets()

    window.addEventListener('resize', scheduleLayout)
    scheduleLayout()
  })

  onBeforeUnmount(() => {
    mutationObserver?.disconnect()
    resizeObserver?.disconnect()
    window.removeEventListener('resize', scheduleLayout)
    if (scheduledFrame) cancelAnimationFrame(scheduledFrame)
  })
}
