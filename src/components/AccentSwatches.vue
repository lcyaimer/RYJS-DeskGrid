<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { ACCENTS, ACCENT_KEYS } from '../constants'
import type { AccentKey } from '../types'

defineProps<{
  modelValue: AccentKey
}>()

const emit = defineEmits<{
  'update:modelValue': [value: AccentKey]
}>()
</script>

<template>
  <div class="flex flex-wrap gap-2" role="group" aria-label="强调色">
    <button
      v-for="key in ACCENT_KEYS"
      :key="key"
      type="button"
      class="relative flex h-8 w-8 items-center justify-center rounded-[10px] border transition duration-150 hover:scale-105"
      :class="
        modelValue === key
          ? 'border-transparent ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#141827]'
          : 'border-white/30 dark:border-white/10'
      "
      :style="{
        backgroundColor: ACCENTS[key].soft,
        color: ACCENTS[key].color,
        '--tw-ring-color': ACCENTS[key].color,
      }"
      :aria-label="ACCENTS[key].label"
      :aria-pressed="modelValue === key"
      :title="ACCENTS[key].label"
      @click="emit('update:modelValue', key)"
    >
      <span class="h-3 w-3 rounded-full" :style="{ backgroundColor: ACCENTS[key].color }" />
      <Check
        v-if="modelValue === key"
        :size="11"
        class="absolute inset-0 m-auto text-white drop-shadow"
        :stroke-width="3"
      />
    </button>
  </div>
</template>
