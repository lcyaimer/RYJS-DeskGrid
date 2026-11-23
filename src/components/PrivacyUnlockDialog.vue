<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole } from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import { closePrivacyUnlock, overlayState } from '../lib/overlays'
import { desk, unlockPrivateCategories, verifyStoredPassword } from '../stores/desk'
import { toast } from '../lib/feedback'

const password = ref('')
const visible = ref(false)
const busy = ref(false)
const error = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

const hiddenCategories = computed(() =>
  desk.settings.privacyLocked ? desk.categories.filter((category) => category.privacy) : [],
)

watch(
  () => overlayState.privacyUnlockOpen,
  async (open) => {
    if (!open) return
    password.value = ''
    visible.value = false
    error.value = ''
    busy.value = false
    await nextTick()
    inputEl.value?.focus()
  },
)

async function unlock(): Promise<void> {
  if (busy.value) return
  if (!desk.settings.passwordHash) {
    error.value = '当前没有设置隐私锁密码'
    return
  }
  if (!password.value) {
    error.value = '请输入密码'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const valid = await verifyStoredPassword(password.value)
    if (!valid) {
      error.value = '密码不正确，请重试'
      password.value = ''
      await nextTick()
      inputEl.value?.focus()
      return
    }
    unlockPrivateCategories()
    closePrivacyUnlock()
    toast.success('隐私分类已解锁')
  } catch {
    error.value = '解锁失败，请稍后重试'
  } finally {
    busy.value = false
  }
}

function close(): void {
  if (busy.value) return
  closePrivacyUnlock()
}
</script>

<template>
  <BaseModal
    :open="overlayState.privacyUnlockOpen"
    title="隐私锁"
    :description="`输入密码以显示 ${hiddenCategories.length} 个已隐藏的分类。`"
    size="sm"
    :z-index="120"
    @close="close"
  >
    <form class="space-y-4" @submit.prevent="unlock">
      <div class="flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 dark:text-brand-300">
          <LockKeyhole :size="18" :stroke-width="1.8" />
        </span>
        <div class="min-w-0">
          <p class="text-[12.5px] font-medium">隐私分类已隐藏</p>
          <p class="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">
            也可以随时通过托盘菜单「隐私锁…」打开此窗口
          </p>
        </div>
      </div>

      <div>
        <label class="field-label" for="privacy-password">解锁密码</label>
        <div class="relative">
          <KeyRound
            :size="15"
            class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id="privacy-password"
            ref="inputEl"
            v-model="password"
            class="field pl-10 pr-11"
            :type="visible ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="请输入密码"
            maxlength="128"
            :class="error ? 'border-rose-500/50' : ''"
            @input="error = ''"
          />
          <button
            type="button"
            class="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-900/[0.05] hover:text-slate-700 dark:hover:bg-white/[0.07] dark:hover:text-slate-200"
            :aria-label="visible ? '隐藏密码' : '显示密码'"
            @click="visible = !visible"
          >
            <EyeOff v-if="visible" :size="15" />
            <Eye v-else :size="15" />
          </button>
        </div>
        <p v-if="error" class="mt-2 text-[11.5px] text-rose-600 dark:text-rose-300">{{ error }}</p>
      </div>

      <p class="text-[10px] leading-5 text-slate-400 dark:text-slate-500">
        忘记密码时，可在「设置 → 数据」中重置全部数据。重置会删除分类布局与密码，但不会删除本机文件。
      </p>
    </form>

    <template #footer>
      <button class="btn-secondary" type="button" :disabled="busy" @click="close">取消</button>
      <button class="btn-primary min-w-[104px]" type="button" :disabled="busy" @click="unlock">
        <LoaderCircle v-if="busy" :size="14" class="animate-spin" />
        <LockKeyhole v-else :size="14" />
        {{ busy ? '验证中…' : '解锁' }}
      </button>
    </template>
  </BaseModal>
</template>
