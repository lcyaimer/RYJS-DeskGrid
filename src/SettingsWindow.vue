<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import SettingsDialog from './components/SettingsDialog.vue'
import PrivacyUnlockDialog from './components/PrivacyUnlockDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import ToastStack from './components/ToastStack.vue'
import BrandMark from './components/BrandMark.vue'
import { initDesk, isReady, persistNow } from './stores/desk'
import { overlayState } from './lib/overlays'
import {
  listenSettingsTab,
  takeSettingsEntryTab,
} from './lib/platform'
import { errorMessage } from './lib/feedback'

const booting = ref(true)
const bootError = ref('')
let unlistenTab: (() => void) | null = null

function flushPersistence(): void {
  if (isReady.value) persistNow()
}

function reloadWindow(): void {
  window.location.reload()
}

onMounted(async () => {
  window.addEventListener('beforeunload', flushPersistence)
  try {
    unlistenTab = await listenSettingsTab((tab) => {
      overlayState.settingsTab = tab
    })
    await initDesk({ seed: false, clampToViewport: false })
    const requested = await takeSettingsEntryTab()
    if (requested) overlayState.settingsTab = requested
    overlayState.settingsOpen = true
    booting.value = false
  } catch (error) {
    bootError.value = errorMessage(error)
    booting.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', flushPersistence)
  unlistenTab?.()
})
</script>

<template>
  <div class="h-full w-full bg-[#f4f5f9] text-slate-900 dark:bg-[#0b0f1a] dark:text-white">
    <div v-if="booting" class="flex h-full w-full items-center justify-center">
      <div class="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-xl dark:border-white/10 dark:bg-[#141827]">
        <BrandMark :size="34" class="animate-pulse" />
        <div>
          <p class="text-[12.5px] font-medium">正在加载设置…</p>
          <p class="mt-0.5 text-[10.5px] text-slate-400">与桌面窗口同步本机布局</p>
        </div>
      </div>
    </div>

    <div v-else-if="bootError" class="flex h-full w-full items-center justify-center p-6">
      <div class="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#141827]">
        <BrandMark :size="38" />
        <h1 class="mt-4 font-display text-[18px] font-semibold">设置加载失败</h1>
        <p class="mt-2 text-[12px] leading-5 text-slate-500 dark:text-slate-400">{{ bootError }}</p>
        <button
          class="btn-primary mt-5 w-full"
          type="button"
          @click="reloadWindow"
        >
          <RotateCcw :size="14" />
          重新加载
        </button>
      </div>
    </div>

    <SettingsDialog v-else standalone />
    <PrivacyUnlockDialog />
    <ConfirmDialog />
    <ToastStack />
  </div>
</template>
