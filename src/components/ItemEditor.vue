<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Globe2, Link2, LockKeyhole } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import AccentSwatches from './AccentSwatches.vue'
import ItemGlyph from './ItemGlyph.vue'
import type { AccentKey, DeskItem, ItemKind } from '../types'
import { ACCENTS, ITEM_TYPE_META } from '../constants'
import { addItem, desk, updateItem } from '../stores/desk'
import { closeItemEditor, overlayState } from '../lib/overlays'
import { toast } from '../lib/feedback'
import { inferItemIcon } from '../lib/itemIcons'
import { hostnameOf, initialOf, normalizeWebUrl, shortPath, tileBackground } from '../lib/utils'

const name = ref('')
const target = ref('')
const note = ref('')
const accent = ref<AccentKey>('cyan')
const error = ref('')

const category = computed(
  () => desk.categories.find((entry) => entry.id === overlayState.itemEditorCategoryId) ?? null,
)
const editingItem = computed<DeskItem | null>(() => {
  if (!category.value || !overlayState.editingItemId) return null
  return category.value.items.find((entry) => entry.id === overlayState.editingItemId) ?? null
})
const isEditing = computed(() => editingItem.value !== null)
const itemKind = computed<ItemKind>(() => editingItem.value?.kind ?? 'link')
const isLink = computed(() => itemKind.value === 'link')
const meta = computed(() => ITEM_TYPE_META[itemKind.value])
const uniformAppearance = computed(() => desk.settings.uniformCards)
const effectiveAccent = computed<AccentKey>(() =>
  uniformAppearance.value ? desk.settings.globalAccent : accent.value,
)
const accentMeta = computed(() => ACCENTS[effectiveAccent.value])
const title = computed(() => (isEditing.value ? '编辑图标' : '添加网址'))
const description = computed(() =>
  isEditing.value
    ? uniformAppearance.value
      ? '修改显示名称和备注；图标配色跟随全局分类强调色。'
      : '修改显示名称、配色和备注，不会移动本机文件。'
    : '粘贴链接，回车即可保存。链接会以桌面图标的形式出现在分类中。',
)

const previewIcon = computed(() =>
  inferItemIcon({
    kind: itemKind.value,
    target: target.value,
    name: name.value,
    icon: editingItem.value?.icon,
  }),
)
const showInitial = computed(
  () =>
    (isLink.value && !editingItem.value?.icon) ||
    (itemKind.value === 'app' && desk.settings.iconStyle === 'letter'),
)
const hostHint = computed(() => {
  const value = target.value.trim()
  if (!value) return '输入链接后预览站点'
  try {
    return hostnameOf(normalizeWebUrl(value))
  } catch {
    return value
  }
})

watch(
  [() => overlayState.itemEditorOpen, () => overlayState.editingItemId, () => overlayState.itemEditorCategoryId],
  ([open]) => {
    if (!open) return
    error.value = ''
    if (editingItem.value) {
      name.value = editingItem.value.name
      target.value = editingItem.value.target
      note.value = editingItem.value.note ?? ''
      accent.value = editingItem.value.accent
    } else {
      name.value = ''
      target.value = ''
      note.value = ''
      accent.value = 'cyan'
    }
  },
  { immediate: true },
)

function save(): void {
  const trimmedName = name.value.trim()
  if (!trimmedName) {
    error.value = '给这个图标取一个名字吧'
    return
  }
  if (trimmedName.length > 80) {
    error.value = '名称不能超过 80 个字符'
    return
  }
  if (!category.value) {
    error.value = '分类不存在，请重新打开'
    return
  }

  if (isLink.value) {
    let normalized: string
    try {
      normalized = normalizeWebUrl(target.value)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '网址格式不正确'
      return
    }
    if (editingItem.value) {
      updateItem(category.value.id, editingItem.value.id, {
        name: trimmedName,
        target: normalized,
        accent: accent.value,
        note: note.value,
      })
      toast.success('图标已更新')
    } else {
      addItem(category.value.id, {
        name: trimmedName,
        kind: 'link',
        target: normalized,
        accent: accent.value,
        note: note.value,
      })
      toast.success('网址已添加')
    }
  } else if (editingItem.value) {
    updateItem(category.value.id, editingItem.value.id, {
      name: trimmedName,
      accent: accent.value,
      note: note.value,
    })
    toast.success('图标已更新')
  }
  closeItemEditor()
}
</script>

<template>
  <BaseModal
    :open="overlayState.itemEditorOpen"
    :title="title"
    :description="description"
    size="md"
    @close="closeItemEditor"
  >
    <form class="space-y-5" @submit.prevent="save" @keydown.enter.prevent="save">
      <div class="flex items-center gap-3.5 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.035]">
        <span
          class="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/25 text-white"
          :style="{
            background: tileBackground(effectiveAccent),
            boxShadow: `0 8px 20px -10px rgb(${accentMeta.rgb} / 0.55)`,
          }"
        >
          <span v-if="showInitial" class="font-display text-[20px] font-semibold">
            {{ initialOf(name || 'W') }}
          </span>
          <ItemGlyph v-else :icon="previewIcon" :size="23" />
          <span
            v-if="isLink"
            class="absolute bottom-1 right-1 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-white/95 text-slate-700"
          >
            <Globe2 :size="9" :stroke-width="2.3" />
          </span>
        </span>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="type-chip" :class="meta.chipClass">
              <span class="h-1 w-1 rounded-full" :class="meta.dotClass" />
              {{ meta.label }}
            </span>
          </div>
          <p class="mt-1 truncate text-[13px] font-medium text-slate-700 dark:text-slate-200">
            {{ name.trim() || (isLink ? '新的网址书签' : '本机快捷方式') }}
          </p>
          <p class="mt-0.5 truncate text-[10.5px] text-slate-400 dark:text-slate-500">
            {{ isLink ? hostHint : shortPath(target, 52) }}
          </p>
        </div>
      </div>

      <div>
        <label class="field-label" for="item-name">显示名称</label>
        <input
          id="item-name"
          v-model="name"
          class="field"
          autofocus
          maxlength="80"
          :placeholder="isLink ? '例如：设计灵感站' : '图标显示名称'"
          autocomplete="off"
          @input="error = ''"
        />
      </div>

      <div v-if="isLink">
        <label class="field-label" for="item-url">链接地址</label>
        <div class="relative">
          <Link2
            :size="15"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id="item-url"
            v-model="target"
            class="field pl-9 font-mono text-[12.5px]"
            placeholder="https://example.com"
            autocomplete="off"
            spellcheck="false"
            @input="error = ''"
          />
        </div>
        <p class="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          支持 http / https；只输入域名时会自动补全 https://
        </p>
      </div>

      <div v-else>
        <span class="field-label">本机路径</span>
        <div class="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.035]">
          <LockKeyhole :size="14" class="shrink-0 text-slate-400" />
          <span class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-slate-500 dark:text-slate-400">
            {{ target }}
          </span>
        </div>
        <p class="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          为避免快捷方式失效，本机路径不可在此修改。
        </p>
      </div>

      <div>
        <span class="field-label">图标配色</span>
        <div :class="uniformAppearance ? 'pointer-events-none opacity-45' : ''">
          <AccentSwatches v-model="accent" />
        </div>
        <p
          v-if="uniformAppearance"
          class="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500"
        >
          已在设置中开启「统一分类外观」，图标配色会跟随全局分类强调色。
        </p>
      </div>

      <div>
        <label class="field-label" for="item-note">备注 <span class="font-normal text-slate-400">（可选）</span></label>
        <input
          id="item-note"
          v-model="note"
          class="field"
          maxlength="500"
          placeholder="补充一点提示，鼠标悬停时可用"
          autocomplete="off"
        />
      </div>

      <p v-if="error" class="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-300">
        {{ error }}
      </p>
    </form>

    <template #footer>
      <button class="btn-secondary" type="button" @click="closeItemEditor">取消</button>
      <button class="btn-primary" type="button" @click="save">
        {{ isEditing ? '保存修改' : '添加图标' }}
      </button>
    </template>
  </BaseModal>
</template>
