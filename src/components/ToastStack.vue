<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from 'lucide-vue-next'
import { WINDOW_EDGE } from '../lib/layout'
import { dismissToast, toasts } from '../lib/feedback'

const icons = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
}

const tones = {
  success: 'text-emerald-300',
  error: 'text-rose-300',
  info: 'text-sky-300',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed left-1/2 top-5 z-[140] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col items-stretch gap-2"
      :style="{ top: `${20 + WINDOW_EDGE}px` }"
      aria-live="polite"
      aria-atomic="false"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="pointer-events-auto flex items-start gap-2.5 rounded-2xl border border-white/10 bg-[#101523]/95 px-3.5 py-3 text-[13px] text-slate-100 shadow-[0_18px_45px_-18px_rgba(0,0,0,0.8)] animate-toast-in backdrop-blur-xl"
        role="status"
        data-desktop-hit
        data-hit-padding="12"
      >
        <component :is="icons[item.kind]" :size="17" class="mt-px shrink-0" :class="tones[item.kind]" />
        <span class="min-w-0 flex-1 leading-5">{{ item.message }}</span>
        <button
          type="button"
          class="mt-0.5 rounded-md p-0.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
          aria-label="关闭提示"
          @click="dismissToast(item.id)"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
