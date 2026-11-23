<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, LockKeyhole, Sparkles } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { ACCENTS, ACCENT_KEYS, DEFAULT_CATEGORY_OPACITY } from '../constants'
import type { AccentKey } from '../types'
import { addCategory, desk, updateCategory } from '../stores/desk'
import { closeCategoryEditor, openSettings, overlayState } from '../lib/overlays'
import { toast } from '../lib/feedback'

const name = ref('')
const accent = ref<AccentKey>('violet')
const opacity = ref(DEFAULT_CATEGORY_OPACITY)
const privacy = ref(false)
const error = ref('')

const editingCategory = computed(
  () => desk.categories.find((category) => category.id === overlayState.editingCategoryId) ?? null,
)
const isEditing = computed(() => editingCategory.value !== null)
const title = computed(() => (isEditing.value ? '编辑分类' : '新建分类'))
const accentMeta = computed(() => ACCENTS[accent.value])
const percent = computed(() => Math.round(opacity.value * 100))
const hasPassword = computed(() => Boolean(desk.settings.passwordHash))
const uniformCards = computed(() => desk.settings.uniformCards)
const rangeStyle = computed(() => ({
  '--range-color': accentMeta.value.color,
  '--range-value': `${percent.value}%`,
}))

watch(
  [() => overlayState.categoryEditorOpen, () => overlayState.editingCategoryId],
  ([open]) => {
    if (!open) return
    error.value = ''
    if (editingCategory.value) {
      name.value = editingCategory.value.name
      accent.value = editingCategory.value.accent
      opacity.value = editingCategory.value.opacity
      privacy.value = editingCategory.value.privacy
    } else {
      name.value = ''
      accent.value = 'violet'
      opacity.value = DEFAULT_CATEGORY_OPACITY
      privacy.value = false
    }
  },
  { immediate: true },
)

function save(): void {
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = '给分类取一个名字吧'
    return
  }
  if (trimmed.length > 40) {
    error.value = '分类名称不能超过 40 个字符'
    return
  }
  error.value = ''
  if (editingCategory.value) {
    updateCategory(editingCategory.value.id, {
      name: trimmed,
      accent: accent.value,
      opacity: opacity.value,
      privacy: privacy.value,
    })
    toast.success('分类已更新')
  } else {
    addCategory({
      name: trimmed,
      accent: accent.value,
      opacity: opacity.value,
      privacy: privacy.value,
    })
    toast.success('分类已创建')
  }
  const needsPassword = privacy.value && !hasPassword.value
  closeCategoryEditor()
  if (needsPassword) {
    toast.info('请先设置密码，之后才能锁定隐私分类')
    openSettings('security')
  }
}
</script>

<template>
  <BaseModal
    :open="overlayState.categoryEditorOpen"
    :title="title"
    description="分类可以自由拖动、折叠，并单独调整透明度与隐私。"
    size="md"
    @close="closeCategoryEditor"
  >
    <form class="space-y-5" @submit.prevent="save">
      <div>
        <label class="field-label" for="category-name">分类名称</label>
        <div class="relative">
          <span
            class="pointer-events-none absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg"
            :style="{ backgroundColor: accentMeta.soft, color: accentMeta.color }"
          >
            <Sparkles :size="13" />
          </span>
          <input
            id="category-name"
            v-model="name"
            class="field pl-11"
            autofocus
            maxlength="40"
            placeholder="例如：工作台、常用工具、收藏"
            autocomplete="off"
            @input="error = ''"
          />
        </div>
        <p v-if="error" class="mt-1.5 text-[11.5px] text-rose-500 dark:text-rose-300">{{ error }}</p>
      </div>

      <div>
        <span class="field-label">强调色</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="key in ACCENT_KEYS"
            :key="key"
            type="button"
            class="group/swatch relative flex h-9 w-9 items-center justify-center rounded-xl border transition duration-150 hover:scale-105"
            :class="
              accent === key
                ? 'border-transparent ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#141827]'
                : 'border-white/30 dark:border-white/10'
            "
            :style="{
              backgroundColor: ACCENTS[key].soft,
              color: ACCENTS[key].color,
              '--tw-ring-color': ACCENTS[key].color,
            }"
            :aria-label="ACCENTS[key].label"
            :title="ACCENTS[key].label"
            @click="accent = key"
          >
            <span class="h-3.5 w-3.5 rounded-full" :style="{ backgroundColor: ACCENTS[key].color }" />
            <Check
              v-if="accent === key"
              :size="12"
              class="absolute inset-0 m-auto text-white drop-shadow"
              :stroke-width="3"
            />
          </button>
        </div>
        <p v-if="uniformCards" class="mt-1.5 text-[10.5px] text-slate-400 dark:text-slate-500">
          全局「统一分类外观」正在覆盖强调色，此处选择会保留。
        </p>
      </div>

      <div class="rounded-2xl border border-slate-200/80 p-4 dark:border-white/[0.08]">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 dark:text-brand-300">
            <LockKeyhole :size="15" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[12.5px] font-medium">隐私分类</p>
            <p class="mt-1 text-[11px] leading-5 text-slate-400 dark:text-slate-500">
              开启后，这个分类中的内容会随「隐私锁」一起隐藏。通过托盘菜单「隐私锁…」或「系统」卡上的锁按钮解锁。
            </p>
            <p
              v-if="privacy && !hasPassword"
              class="mt-1.5 text-[10.5px] text-amber-600 dark:text-amber-300"
            >
              尚未设置密码，保存后会引导你设置。
            </p>
          </div>
          <button
            type="button"
            class="relative mt-1 h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
            :class="privacy ? 'bg-brand-500' : 'bg-slate-300 dark:bg-white/15'"
            role="switch"
            :aria-checked="privacy"
            aria-label="隐私分类"
            @click="privacy = !privacy"
          >
            <span
              class="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
              :class="privacy ? 'left-[19px]' : 'left-[3px]'"
            />
          </button>
        </div>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <span class="field-label mb-0">卡片背景不透明度</span>
          <span class="font-mono text-[11px] text-slate-400">{{ percent }}%</span>
        </div>
        <input
          v-model.number="opacity"
          class="range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :style="rangeStyle"
          aria-label="卡片背景不透明度"
        />
        <p v-if="uniformCards" class="mt-1.5 text-[10.5px] text-slate-400 dark:text-slate-500">
          全局「统一分类外观」已开启，此处保存的值会保留，但暂时不生效。
        </p>
        <div
          class="mt-3 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-100/60 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.035]"
        >
          <div class="flex items-center gap-2">
            <span
              class="flex h-6 w-6 items-center justify-center rounded-md"
              :style="{ backgroundColor: accentMeta.soft, color: accentMeta.color }"
            >
              <Sparkles :size="12" />
            </span>
            <span class="truncate text-[12px] font-medium">{{ name.trim() || '分类预览' }}</span>
            <span class="ml-auto text-[10px] text-slate-400">预览</span>
          </div>
        </div>
      </div>
    </form>

    <template #footer>
      <button class="btn-secondary" type="button" @click="closeCategoryEditor">取消</button>
      <button class="btn-primary" type="button" @click="save">
        {{ isEditing ? '保存修改' : '创建分类' }}
      </button>
    </template>
  </BaseModal>
</template>
