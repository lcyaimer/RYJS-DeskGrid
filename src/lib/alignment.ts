import { reactive } from 'vue'

export const SNAP_DISTANCE = 7
export const CARD_GAP = 16

export interface SnapRect {
  left: number
  top: number
  width: number
  height: number
}

export interface SnapResult {
  left: number
  top: number
  /** Viewport x of the vertical guide, if the card snapped horizontally. */
  vertical: number | null
  /** Viewport y of the horizontal guide, if the card snapped vertically. */
  horizontal: number | null
}

export const alignmentState = reactive<{
  vertical: number | null
  horizontal: number | null
}>({
  vertical: null,
  horizontal: null,
})

export function clearAlignment(): void {
  alignmentState.vertical = null
  alignmentState.horizontal = null
}

/** Snapshot every other card so drag math stays cheap and stable. */
export function collectSnapRects(exclude: HTMLElement | null): SnapRect[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-snap-card]'))
    .filter((element) => element !== exclude)
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
    })
    .filter((rect) => rect.width > 0 && rect.height > 0)
}

function bestCandidate(
  proposed: number,
  candidates: Array<{ value: number; guide: number }>,
): { value: number; guide: number } | null {
  let best: { value: number; guide: number; distance: number } | null = null
  for (const candidate of candidates) {
    const distance = Math.abs(proposed - candidate.value)
    if (distance > SNAP_DISTANCE) continue
    if (!best || distance < best.distance) {
      best = { ...candidate, distance }
    }
  }
  return best ? { value: best.value, guide: best.guide } : null
}

/**
 * Work in viewport coordinates: edges, centres and 16 px gutters of every
 * other card become snap lines. The caller converts back to card coordinates.
 */
export function snapRect(
  proposed: SnapRect,
  others: SnapRect[],
): SnapResult {
  const xCandidates: Array<{ value: number; guide: number }> = []
  const yCandidates: Array<{ value: number; guide: number }> = []

  for (const other of others) {
    const centerX = other.left + other.width / 2
    const centerY = other.top + other.height / 2
    xCandidates.push(
      { value: other.left, guide: other.left },
      { value: centerX - proposed.width / 2, guide: centerX },
      { value: other.left + other.width - proposed.width, guide: other.left + other.width },
      { value: other.left + other.width + CARD_GAP, guide: other.left + other.width },
      { value: other.left - CARD_GAP - proposed.width, guide: other.left },
    )
    yCandidates.push(
      { value: other.top, guide: other.top },
      { value: centerY - proposed.height / 2, guide: centerY },
      { value: other.top + other.height - proposed.height, guide: other.top + other.height },
      { value: other.top + other.height + CARD_GAP, guide: other.top + other.height },
      { value: other.top - CARD_GAP - proposed.height, guide: other.top },
    )
  }

  const x = bestCandidate(proposed.left, xCandidates)
  const y = bestCandidate(proposed.top, yCandidates)

  return {
    left: x ? x.value : proposed.left,
    top: y ? y.value : proposed.top,
    vertical: x ? x.guide : null,
    horizontal: y ? y.guide : null,
  }
}
