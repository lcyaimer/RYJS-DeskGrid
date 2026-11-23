<script setup lang="ts">
import { computed } from 'vue'
import {
  AppWindow,
  Archive,
  Code2,
  Download,
  File,
  FileText,
  Film,
  Folder,
  Globe2,
  Home,
  Image,
  Monitor,
  Music,
  PanelTop,
  Presentation,
  Table2,
} from 'lucide-vue-next'
import type { ItemIconKey } from '../types'

const props = withDefaults(
  defineProps<{
    icon: ItemIconKey
    size?: number
    strokeWidth?: number
  }>(),
  {
    size: 24,
    strokeWidth: 1.7,
  },
)

const icons = {
  computer: Monitor,
  desktop: PanelTop,
  downloads: Download,
  documents: FileText,
  pictures: Image,
  music: Music,
  videos: Film,
  home: Home,
  folder: Folder,
  file: File,
  app: AppWindow,
  image: Image,
  video: Film,
  audio: Music,
  pdf: FileText,
  archive: Archive,
  code: Code2,
  spreadsheet: Table2,
  presentation: Presentation,
  link: Globe2,
}

const glyph = computed(() => icons[props.icon] ?? FileText)
</script>

<template>
  <component :is="glyph" :size="size" :stroke-width="strokeWidth" />
</template>
