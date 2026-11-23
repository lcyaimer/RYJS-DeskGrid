<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    description?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    zIndex?: number
    closeOnBackdrop?: boolean
    flush?: boolean
    panelClass?: string
    /** Fill a standalone native window instead of floating over the desktop. */
    standalone?: boolean
    hideClose?: boolean
  }>(),
  {
    title: '',
    description: '',
    size: 'md',
    zIndex: 90,
    closeOnBackdrop: false,
    flush: false,
    panelClass: '',
    standalone: false,
    hideClose: false,
  },
)

const emit = defineEmits<{
  close: []
}>()

const panelEl = ref<HTMLElement | null>(null)
const titleId = useId()
let previouslyFocused: HTMLElement | null = null

const widthClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'max-w-md'
    case 'lg':
      return 'max-w-3xl'
    case 'xl':
      return 'max-w-5xl'
    default:
      return 'max-w-xl'
  }
})

function close(): void {
  emit('close')
}

function handleBackdrop(): void {
  if (props.closeOnBackdrop) close()
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

async function focusPanel(): Promise<void> {
  await nextTick()
  const panel = panelEl.value
  if (!panel) return
  const preferred = panel.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled])')
  ;(preferred ?? panel).focus({ preventScroll: true })
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const panel = panelEl.value
  if (!panel) return
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null,
  )
  if (focusable.length === 0) {
    event.preventDefault()
    panel.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
      void focusPanel()
    } else if (previouslyFocused) {
      previouslyFocused.focus({ preventScroll: true })
      previouslyFocused = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  previouslyFocused?.focus({ preventScroll: true })
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-backdrop fixed inset-0 flex items-center justify-center"
      :class="standalone ? 'p-0' : 'p-4 sm:p-6'"
      :style="{ zIndex }"
      role="presentation"
      @pointerdown.self="handleBackdrop"
      @keydown="handleKeydown"
    >
      <section
        ref="panelEl"
        class="modal-card animate-rise-in"
        :class="[
          standalone ? '' : widthClass,
          panelClass,
          standalone
            ? 'h-full w-full max-h-none max-w-none rounded-none border-0 shadow-none'
            : '',
        ]"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        tabindex="-1"
        data-dialog-surface
        data-hit-padding="0"
        data-hit-radius="24"
        @pointerdown.stop
      >
        <header v-if="title || $slots.header" class="modal-header">
          <slot name="header">
            <div class="min-w-0">
              <h2 :id="titleId" class="font-display text-[19px] font-semibold tracking-[-0.01em]">
                {{ title }}
              </h2>
              <p v-if="description" class="mt-1 text-[12.5px] leading-5 text-slate-500 dark:text-slate-400">
                {{ description }}
              </p>
            </div>
          </slot>
          <button
            v-if="!hideClose"
            class="icon-btn -mr-1 -mt-1"
            type="button"
            aria-label="关闭"
            @click="close"
          >
            <X :size="17" />
          </button>
        </header>

        <div
          class="modal-body desk-scroll"
          :class="[flush ? 'p-0' : '', standalone ? 'overflow-hidden' : '']"
        >
          <slot />
        </div>

        <footer v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>
