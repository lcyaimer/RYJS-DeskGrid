<script setup lang="ts">
import { computed } from 'vue'
import { alignmentState } from '../lib/alignment'

const active = computed(
  () => alignmentState.vertical !== null || alignmentState.horizontal !== null,
)
</script>

<template>
  <div
    class="pointer-events-none absolute inset-0 z-[48] overflow-hidden"
    :data-desktop-hit="active ? '' : undefined"
    data-hit-padding="0"
    aria-hidden="true"
  >
    <div
      v-if="alignmentState.vertical !== null"
      class="absolute bottom-0 top-0 w-px bg-brand-400/75 shadow-[0_0_9px_rgba(146,120,255,0.8)]"
      :style="{ left: `${alignmentState.vertical}px` }"
    />
    <div
      v-if="alignmentState.horizontal !== null"
      class="absolute left-0 right-0 h-px bg-brand-400/75 shadow-[0_0_9px_rgba(146,120,255,0.8)]"
      :style="{ top: `${alignmentState.horizontal}px` }"
    />
  </div>
</template>
