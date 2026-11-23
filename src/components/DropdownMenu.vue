<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import type { MenuAnchor } from '../types'
import { WINDOW_EDGE } from '../lib/layout'
import { setFloatingMenuOpen } from '../lib/menuLayer'

const props = withDefaults(
  defineProps<{
    open: boolean
    anchor?: MenuAnchor | null
    point?: { x: number; y: number } | null
    align?: 'start' | 'end'
    width?: number
    minWidth?: number
    zIndex?: number
  }>(),
  {
    anchor: null,
    point: null,
    align: 'end',
    width: 0,
    minWidth: 200,
    zIndex: 70,
  },
)

const emit = defineEmits<{
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const position = reactive({ left: 0, top: 0 })
const layerId = useId()
let layerRegistered = false

async function updatePosition(): Promise<void> {
  await nextTick()
  const menu = menuRef.value
  if (!menu) return
  const margin = 8
  const minX = WINDOW_EDGE + margin
  const minY = WINDOW_EDGE + margin
  const maxX = window.innerWidth - WINDOW_EDGE - margin
  const maxY = window.innerHeight - WINDOW_EDGE - margin
  const menuWidth = menu.offsetWidth
  const menuHeight = menu.offsetHeight
  const anchor = props.anchor

  if (props.point) {
    let left = props.point.x
    let top = props.point.y
    if (left + menuWidth > maxX) left = maxX - menuWidth
    if (top + menuHeight > maxY) top = props.point.y - menuHeight
    position.left = Math.max(minX, left)
    position.top = Math.max(minY, top)
    return
  }

  if (!anchor) {
    position.left = Math.max(minX, (window.innerWidth - menuWidth) / 2)
    position.top = Math.max(minY, (window.innerHeight - menuHeight) / 2)
    return
  }

  let left = props.align === 'end' ? anchor.right - menuWidth : anchor.left
  let top = anchor.bottom + 6
  if (left < minX) left = minX
  if (left + menuWidth > maxX) left = maxX - menuWidth
  if (top + menuHeight > maxY) top = anchor.top - menuHeight - 6
  position.left = Math.max(minX, left)
  position.top = Math.max(minY, top)
}

let listening = false

function addWindowListeners(): void {
  if (listening) return
  listening = true
  window.addEventListener('resize', updatePosition)
}

function removeWindowListeners(): void {
  if (!listening) return
  listening = false
  window.removeEventListener('resize', updatePosition)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}

watch(
  [() => props.open, () => props.anchor, () => props.point],
  ([open]) => {
    if (open) {
      addWindowListeners()
      void updatePosition()
      window.setTimeout(() => menuRef.value?.focus({ preventScroll: true }), 20)
    } else {
      removeWindowListeners()
    }
  },
  { immediate: true, deep: true },
)

watch(
  () => props.open,
  (open) => {
    if (open && !layerRegistered) {
      layerRegistered = true
      setFloatingMenuOpen(layerId, true)
    } else if (!open && layerRegistered) {
      layerRegistered = false
      setFloatingMenuOpen(layerId, false)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  removeWindowListeners()
  if (layerRegistered) {
    layerRegistered = false
    setFloatingMenuOpen(layerId, false)
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 cursor-default"
      :style="{ zIndex }"
      @pointerdown.prevent="$emit('close')"
      @contextmenu.prevent
    />
    <div
      v-if="open"
      ref="menuRef"
      class="glass-menu fixed rounded-2xl p-1.5 text-slate-800 outline-none animate-pop-in dark:text-slate-100"
      :style="{
        left: `${position.left}px`,
        top: `${position.top}px`,
        zIndex: zIndex + 1,
        width: width ? `${width}px` : undefined,
        minWidth: `${minWidth}px`,
      }"
      role="menu"
      tabindex="-1"
      @keydown="handleKeydown"
      @contextmenu.prevent
    >
      <slot />
    </div>
  </Teleport>
</template>
