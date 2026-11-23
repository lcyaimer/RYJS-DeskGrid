<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
    glow?: boolean
  }>(),
  { size: 38, glow: false },
)
</script>

<template>
  <div
    class="relative shrink-0 overflow-hidden rounded-[28%] bg-[#0b0f1c] ring-1 ring-white/15"
    :class="glow ? 'shadow-[0_0_38px_-8px_rgba(124,92,255,0.7)]' : 'shadow-lg shadow-slate-950/30'"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_75%_12%,rgba(34,211,238,0.5),transparent_48%),radial-gradient(circle_at_18%_82%,rgba(124,92,255,0.75),transparent_55%)]" />
    <div class="absolute inset-[19%] grid grid-cols-2 gap-[13%]">
      <span class="rounded-[26%] bg-white/95" />
      <span class="rounded-[26%] bg-white/30" />
      <span class="rounded-[26%] bg-white/20" />
      <span class="rounded-[26%] bg-cyan-300/90" />
    </div>
    <div class="absolute inset-x-[20%] top-0 h-px bg-white/60" />
  </div>
</template>
