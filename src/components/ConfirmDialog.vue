<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { confirmState, settleConfirm } from '../lib/feedback'
</script>

<template>
  <BaseModal
    :open="confirmState.open"
    :title="confirmState.title"
    size="sm"
    :z-index="130"
    @close="settleConfirm(false)"
  >
    <div class="flex gap-3.5">
      <div
        class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        :class="
          confirmState.tone === 'danger'
            ? 'bg-rose-500/10 text-rose-500 dark:text-rose-300'
            : 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
        "
      >
        <AlertTriangle :size="18" />
      </div>
      <p class="pt-1 text-[13.5px] leading-6 text-slate-600 dark:text-slate-300">
        {{ confirmState.message }}
      </p>
    </div>
    <template #footer>
      <button class="btn-secondary" type="button" @click="settleConfirm(false)">
        {{ confirmState.cancelText }}
      </button>
      <button
        class="btn"
        :class="
          confirmState.tone === 'danger'
            ? 'bg-rose-500 text-white hover:bg-rose-400'
            : 'bg-brand-500 text-white hover:bg-brand-400'
        "
        type="button"
        @click="settleConfirm(true)"
      >
        {{ confirmState.confirmText }}
      </button>
    </template>
  </BaseModal>
</template>
