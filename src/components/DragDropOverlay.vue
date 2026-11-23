<script setup lang="ts">
import { computed } from 'vue'
import { FilePlus2 } from 'lucide-vue-next'
import { desk } from '../stores/desk'
import { dragDropState } from '../lib/dragDrop'
import { WINDOW_EDGE } from '../lib/layout'

const target = computed(() =>
  desk.categories.find((category) => category.id === dragDropState.targetCategoryId) ?? null,
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="dragDropState.active"
      class="pointer-events-none fixed left-1/2 z-[80] -translate-x-1/2 animate-pop-in"
      :style="{ top: `${16 + WINDOW_EDGE}px` }"
      aria-hidden="true"
    >
      <div
        class="flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[12px] shadow-2xl backdrop-blur-xl transition-colors"
        data-desktop-hit
        data-hit-padding="10"
        :class="
          target
            ? 'border-brand-400/40 bg-[#171b2c]/95 text-white'
            : 'border-white/15 bg-[#101523]/92 text-slate-200'
        "
      >
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          :class="target ? 'bg-brand-500 text-white' : 'bg-white/10 text-slate-300'"
        >
          <FilePlus2 :size="15" />
        </span>
        <span v-if="target" class="font-medium">
          松开添加到「{{ target.name }}」
          <span v-if="dragDropState.fileCount > 1" class="ml-1 text-slate-400">
            · {{ dragDropState.fileCount }} 项
          </span>
        </span>
        <span v-else class="font-medium">
          把文件、文件夹或快捷方式拖到分类卡片上
        </span>
      </div>
    </div>
  </Teleport>
</template>
