import { reactive } from 'vue'
import { WINDOW_EDGE } from './layout'

export const dragDropState = reactive<{
  active: boolean
  targetCategoryId: string | null
  fileCount: number
}>({
  active: false,
  targetCategoryId: null,
  fileCount: 0,
})

export function resetDragDrop(): void {
  dragDropState.active = false
  dragDropState.targetCategoryId = null
  dragDropState.fileCount = 0
}

/** Find the category card under a CSS-pixel viewport point. */
export function categoryIdAt(clientX: number, clientY: number): string | null {
  const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  const card = element?.closest<HTMLElement>('[data-category-id]')
  return card?.dataset.categoryId ?? null
}

/** Near-miss fallback for scaled/HiDPI coordinates. */
function categoryIdNear(clientX: number, clientY: number, tolerance = 56): string | null {
  const cards = document.querySelectorAll<HTMLElement>('[data-category-id]')
  let bestId: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const card of cards) {
    const rect = card.getBoundingClientRect()
    const dx = Math.max(rect.left - clientX, 0, clientX - rect.right)
    const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom)
    const distance = Math.hypot(dx, dy)
    if (distance <= tolerance && distance < bestDistance) {
      bestDistance = distance
      bestId = card.dataset.categoryId ?? null
    }
  }
  return bestId
}

/**
 * Tauri reports drag positions in physical pixels relative to the webview.
 * Windows 11 / per-monitor DPI can still make the coordinate space ambiguous,
 * so probe common interpretations before giving up.
 */
export function categoryIdForDrag(
  position: { x: number; y: number },
  dpr: number,
): string | null {
  const scale = dpr > 0 && Number.isFinite(dpr) ? dpr : 1
  const points = [
    { x: position.x / scale, y: position.y / scale },
    { x: position.x / scale + WINDOW_EDGE, y: position.y / scale + WINDOW_EDGE },
    { x: position.x / scale - WINDOW_EDGE, y: position.y / scale - WINDOW_EDGE },
    { x: position.x, y: position.y },
    { x: position.x + WINDOW_EDGE, y: position.y + WINDOW_EDGE },
    { x: position.x - WINDOW_EDGE, y: position.y - WINDOW_EDGE },
  ]

  const seen = new Set<string>()
  for (const point of points) {
    const key = `${Math.round(point.x)}:${Math.round(point.y)}`
    if (seen.has(key)) continue
    seen.add(key)
    const hit = categoryIdAt(point.x, point.y)
    if (hit) return hit
  }
  for (const point of points) {
    const hit = categoryIdNear(point.x, point.y)
    if (hit) return hit
  }
  return null
}
