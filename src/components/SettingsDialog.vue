<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import {
  AppWindow,
  Check,
  ChevronRight,
  Cloud,
  CloudDownload,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileJson,
  Github,
  Info,
  KeyRound,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Moon,
  Music2,
  Palette,
  Power,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Upload,
  Users,
} from 'lucide-vue-next'
import BaseModal from './BaseModal.vue'
import AccentSwatches from './AccentSwatches.vue'
import type { AccentKey, SettingsTab } from '../types'
import type { FeedbackGroup } from '../constants'
import {
  ACCENTS,
  APP_NAME,
  APP_VERSION,
  DOWNLOAD_CHANNELS,
  FEEDBACK_GROUPS,
  GITHUB_URL,
  ISSUES_URL,
  MIN_CATEGORY_OPACITY,
  RELEASES_URL,
} from '../constants'
import {
  buildExportSnapshot,
  desk,
  hasPrivateCategories,
  importSnapshot,
  lockPrivateCategories,
  resetAllData,
  setPasswordHash,
  updateSettings,
  verifyStoredPassword,
} from '../stores/desk'
import {
  closeSettings,
  openOnboarding,
  openPrivacyUnlock,
  overlayState,
} from '../lib/overlays'
import { askConfirm, errorMessage, toast } from '../lib/feedback'
import { createPasswordHash, passwordMeetsMinimum } from '../lib/password'
import {
  closeSettingsWindow,
  isTauriRuntime,
  openTarget,
  pickPath,
  readTextFile,
  requestOnboarding,
  setAutostartEnabled,
} from '../lib/platform'
import { copyText, downloadJson } from '../lib/utils'

const props = defineProps<{
  /** Render inside the standalone settings window instead of the desktop modal. */
  standalone?: boolean
}>()

interface TabDefinition {
  id: SettingsTab
  label: string
  icon: Component
}

const tabs: TabDefinition[] = [
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'security', label: '安全', icon: ShieldCheck },
  { id: 'data', label: '数据', icon: Database },
  { id: 'about', label: '关于', icon: Info },
]

const desktopRuntime = isTauriRuntime()
const autostartEnabled = computed(() => desk.settings.autostart)
const autostartBusy = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const passwordBusy = ref(false)
const dataBusy = ref(false)
const dataError = ref('')

const hasPassword = computed(() => Boolean(desk.settings.passwordHash))
const itemCount = computed(() =>
  desk.categories.reduce((total, category) => total + category.items.length, 0),
)
const activeLabel = computed(() => tabs.find((tab) => tab.id === overlayState.settingsTab)?.label ?? '设置')
const isDark = computed(() => desk.settings.theme === 'dark')
const privateCategoryCount = computed(
  () => desk.categories.filter((category) => category.privacy).length,
)
const privacyLocked = computed(
  () => desk.settings.privacyLocked && hasPrivateCategories(),
)
const globalAccent = computed(() => ACCENTS[desk.settings.globalAccent])
const globalOpacityPercent = computed(() =>
  Math.round(desk.settings.globalCardOpacity * 100),
)
const globalOpacityStyle = computed(() => ({
  '--range-color': globalAccent.value.color,
  '--range-value': `${globalOpacityPercent.value}%`,
}))

const globalAccentModel = computed<AccentKey>({
  get: () => desk.settings.globalAccent,
  set: (value) => updateSettings({ globalAccent: value }),
})

function setGlobalOpacity(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  updateSettings({ globalCardOpacity: value / 100 })
}

async function toggleAutostart(): Promise<void> {
  if (!desktopRuntime || autostartBusy.value) return
  const previous = desk.settings.autostart
  const next = !previous
  updateSettings({ autostart: next })
  autostartBusy.value = true
  try {
    const actual = await setAutostartEnabled(next)
    if (actual !== next) updateSettings({ autostart: actual })
    toast.success(actual ? '已开启开机自启' : '已关闭开机自启')
  } catch (error) {
    updateSettings({ autostart: previous })
    toast.error(errorMessage(error))
  } finally {
    autostartBusy.value = false
  }
}

watch(
  () => overlayState.settingsOpen,
  (open) => {
    if (!open) return
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordError.value = ''
    dataError.value = ''
    passwordBusy.value = false
    dataBusy.value = false
  },
)

function switchTab(tab: SettingsTab): void {
  overlayState.settingsTab = tab
  passwordError.value = ''
  dataError.value = ''
}

async function closePanel(): Promise<void> {
  if (props.standalone) {
    await closeSettingsWindow()
    return
  }
  closeSettings()
}

function clearPasswordFields(): void {
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

async function savePassword(): Promise<void> {
  if (passwordBusy.value) return
  passwordError.value = ''
  if (hasPassword.value) {
    if (!currentPassword.value) {
      passwordError.value = '请输入当前密码'
      return
    }
    const valid = await verifyStoredPassword(currentPassword.value)
    if (!valid) {
      passwordError.value = '当前密码不正确'
      return
    }
  }
  if (!passwordMeetsMinimum(newPassword.value)) {
    passwordError.value = '新密码至少需要 4 个字符'
    return
  }
  if (newPassword.value.length > 128) {
    passwordError.value = '新密码不能超过 128 个字符'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的新密码不一致'
    return
  }
  passwordBusy.value = true
  try {
    const wasSet = hasPassword.value
    const hash = await createPasswordHash(newPassword.value)
    setPasswordHash(hash)
    clearPasswordFields()
    toast.success(wasSet ? '密码已更新' : '隐私锁密码已设置')
  } catch (error) {
    passwordError.value = errorMessage(error)
  } finally {
    passwordBusy.value = false
  }
}

async function removePassword(): Promise<void> {
  if (!hasPassword.value || passwordBusy.value) return
  passwordError.value = ''
  if (!currentPassword.value) {
    passwordError.value = '请先在上方输入当前密码'
    return
  }
  passwordBusy.value = true
  try {
    if (!(await verifyStoredPassword(currentPassword.value))) {
      passwordError.value = '当前密码不正确'
      return
    }
    const confirmed = await askConfirm({
      title: '移除隐私锁密码？',
      message: '移除后，隐私分类会立即恢复显示，隐私锁功能暂停。再次隐藏前需要重新设置密码。分类和图标不会受到影响。',
      confirmText: '移除密码',
      tone: 'danger',
    })
    if (!confirmed) return
    setPasswordHash(null)
    clearPasswordFields()
    toast.success('密码已移除')
  } finally {
    passwordBusy.value = false
  }
}

async function togglePrivacyLock(): Promise<void> {
  if (privacyLocked.value) {
    openPrivacyUnlock()
    return
  }
  if (!hasPassword.value) {
    overlayState.settingsTab = 'security'
    passwordError.value = '请先设置隐私锁密码'
    return
  }
  if (privateCategoryCount.value === 0) {
    toast.info('还没有开启隐私的分类，请在分类设置中开启')
    return
  }
  const confirmed = await askConfirm({
    title: '锁定隐私分类？',
    message: `${privateCategoryCount.value} 个开启隐私的分类会暂时从桌面隐藏。右键托盘选择「隐私锁…」，或点击这里的「解锁」输入密码即可恢复。`,
    confirmText: '锁定',
    tone: 'normal',
  })
  if (!confirmed) return
  if (lockPrivateCategories()) {
    toast.success('隐私分类已隐藏')
  }
}

function exportConfig(): void {
  try {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadJson(`ryjs-deskgrid-backup-${stamp}.json`, buildExportSnapshot())
    toast.success('配置备份已导出')
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

async function importConfig(): Promise<void> {
  if (dataBusy.value) return
  dataError.value = ''
  try {
    const path = await pickPath('file', {
      title: '选择 DeskGrid 配置备份',
      filters: [{ name: 'DeskGrid 配置', extensions: ['json'] }],
    })
    if (!path) return
    dataBusy.value = true
    const text = await readTextFile(path)
    const parsed: unknown = JSON.parse(text)
    const result = importSnapshot(parsed)
    if (!props.standalone) closeSettings()
    toast.success(`已导入 ${result.categories} 个分类、${result.items} 个图标`)
  } catch (error) {
    dataError.value = errorMessage(error)
  } finally {
    dataBusy.value = false
  }
}

async function resetEverything(): Promise<void> {
  const confirmed = await askConfirm({
    title: '重置所有数据？',
    message:
      '所有分类、图标入口、外观设置和隐私锁密码都会被移除，并重新显示新手引导。本机上的文件、文件夹和浏览器书签不会被删除。',
    confirmText: '重置所有数据',
    tone: 'danger',
  })
  if (!confirmed) return
  try {
    await resetAllData()
    toast.success('已恢复到初始状态')
    if (props.standalone) {
      await requestOnboarding()
      await closeSettingsWindow()
      return
    }
    closeSettings()
    openOnboarding()
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

async function replayGuide(): Promise<void> {
  if (props.standalone) {
    await requestOnboarding()
    await closeSettingsWindow()
    return
  }
  closeSettings()
  openOnboarding()
}

async function openExternal(url: string): Promise<void> {
  try {
    await openTarget(url)
  } catch (error) {
    toast.error(errorMessage(error))
  }
}

async function copyCode(code: string): Promise<void> {
  const ok = await copyText(code)
  if (ok) toast.success(`提取码 ${code} 已复制`)
  else toast.error('复制失败')
}

function channelIcon(kind: 'github' | 'quark' | 'baidu') {
  if (kind === 'github') return Github
  if (kind === 'quark') return Cloud
  return CloudDownload
}

function feedbackIcon(platform: FeedbackGroup['platform']) {
  return platform === 'douyin' ? Music2 : Users
}

async function copyFeedbackId(group: FeedbackGroup): Promise<void> {
  const ok = await copyText(group.id)
  if (ok) toast.success(`${group.label} ${group.id} 已复制`)
  else toast.error('复制失败')
}
</script>

<template>
  <BaseModal
    :open="standalone || overlayState.settingsOpen"
    title="设置"
    description="所有设置保存在本机，修改后即时生效。"
    size="xl"
    flush
    :standalone="standalone"
    :hide-close="standalone"
    :panel-class="standalone ? '' : 'h-[min(720px,calc(100vh-36px))]'"
    @close="closePanel"
  >
    <div class="flex h-full min-h-[480px] flex-col sm:flex-row">
      <aside class="flex w-full shrink-0 flex-col border-b border-slate-200/70 bg-slate-50/60 dark:border-white/[0.07] dark:bg-white/[0.018] sm:w-[196px] sm:border-b-0 sm:border-r">
        <div class="flex gap-1 overflow-x-auto p-2 no-scrollbar sm:flex-col sm:p-3">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition sm:w-full"
            :class="
              overlayState.settingsTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/[0.04] dark:bg-white/[0.085] dark:text-white dark:ring-white/[0.04]'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-slate-200'
            "
            :aria-current="overlayState.settingsTab === tab.id ? 'page' : undefined"
            @click="switchTab(tab.id)"
          >
            <component :is="tab.icon" :size="15" />
            {{ tab.label }}
            <ChevronRight
              v-if="overlayState.settingsTab === tab.id"
              :size="13"
              class="ml-auto hidden text-slate-400 sm:block"
            />
          </button>
        </div>
        <div class="mt-auto hidden px-4 pb-4 sm:block">
          <div class="rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.025]">
            <div class="flex items-center gap-2">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span class="text-[10px] font-medium text-slate-500 dark:text-slate-400">本地优先</span>
            </div>
            <p class="mt-1.5 text-[9.5px] leading-4 text-slate-400 dark:text-slate-500">
              {{ APP_NAME }} v{{ APP_VERSION }}
            </p>
          </div>
        </div>
      </aside>

      <section class="desk-scroll min-h-0 flex-1 overflow-y-auto">
        <div class="px-5 py-5 sm:px-7 sm:py-6">
          <div class="mb-5 flex items-center gap-2">
            <h3 class="font-display text-[16px] font-semibold">{{ activeLabel }}</h3>
            <span class="h-px flex-1 bg-slate-200/80 dark:bg-white/[0.07]" />
          </div>

          <template v-if="overlayState.settingsTab === 'appearance'">
            <div class="space-y-6">
              <div>
                <p class="text-[12.5px] font-medium">主题</p>
                <p class="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  分类卡片和弹窗会跟随所选主题。
                </p>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    class="group/theme relative rounded-2xl border p-1.5 text-left transition"
                    :class="
                      !isDark
                        ? 'border-brand-400 ring-2 ring-brand-500/20'
                        : 'border-slate-200/80 hover:border-slate-300 dark:border-white/[0.08] dark:hover:border-white/20'
                    "
                    @click="updateSettings({ theme: 'light' })"
                  >
                    <div class="relative h-[92px] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#eef2f8,#dde6f2)] p-2.5">
                      <div class="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(124,92,255,0.18),transparent_50%)]" />
                      <div class="relative w-[86px] rounded-xl border border-white/80 bg-white/80 p-2 shadow-sm">
                        <span class="block h-1.5 w-9 rounded-full bg-slate-400/60" />
                        <div class="mt-2 grid grid-cols-3 gap-1">
                          <span class="aspect-square rounded-[5px] bg-brand-400/70" />
                          <span class="aspect-square rounded-[5px] bg-amber-400/70" />
                          <span class="aspect-square rounded-[5px] bg-cyan-400/70" />
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center justify-between px-1.5 pb-0.5 pt-2">
                      <span class="flex items-center gap-1.5 text-[11.5px] font-medium">
                        <Sun :size="13" class="text-amber-500" /> 浅色
                      </span>
                      <Check v-if="!isDark" :size="14" class="text-brand-500" />
                    </div>
                  </button>
                  <button
                    type="button"
                    class="group/theme relative rounded-2xl border p-1.5 text-left transition"
                    :class="
                      isDark
                        ? 'border-brand-400 ring-2 ring-brand-500/20'
                        : 'border-slate-200/80 hover:border-slate-300 dark:border-white/[0.08] dark:hover:border-white/20'
                    "
                    @click="updateSettings({ theme: 'dark' })"
                  >
                    <div class="relative h-[92px] overflow-hidden rounded-xl bg-[linear-gradient(135deg,#151b2b,#0a0e18)] p-2.5">
                      <div class="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(124,92,255,0.35),transparent_50%)]" />
                      <div class="relative w-[86px] rounded-xl border border-white/10 bg-white/[0.065] p-2 shadow-lg">
                        <span class="block h-1.5 w-9 rounded-full bg-white/30" />
                        <div class="mt-2 grid grid-cols-3 gap-1">
                          <span class="aspect-square rounded-[5px] bg-brand-400/80" />
                          <span class="aspect-square rounded-[5px] bg-amber-400/80" />
                          <span class="aspect-square rounded-[5px] bg-cyan-400/80" />
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center justify-between px-1.5 pb-0.5 pt-2">
                      <span class="flex items-center gap-1.5 text-[11.5px] font-medium">
                        <Moon :size="13" class="text-brand-400" /> 深色
                      </span>
                      <Check v-if="isDark" :size="14" class="text-brand-500" />
                    </div>
                  </button>
                </div>
              </div>

              <div class="rounded-2xl border border-slate-200/80 bg-white/55 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                <div class="flex items-start gap-3">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 dark:text-brand-300">
                    <AppWindow :size="15" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12.5px] font-medium">图标风格</p>
                    <p class="mt-1 text-[11px] leading-5 text-slate-400 dark:text-slate-500">
                      软件快捷方式与网页书签的图标显示方式。原生图标更容易一眼认出，统一文字则让卡片更整齐。
                    </p>
                  </div>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    class="rounded-xl border p-2.5 text-left transition"
                    :class="
                      desk.settings.iconStyle === 'native'
                        ? 'border-brand-400/70 bg-brand-500/[0.055] ring-2 ring-brand-500/15'
                        : 'border-slate-200/80 hover:border-slate-300 dark:border-white/[0.08] dark:hover:border-white/20'
                    "
                    @click="updateSettings({ iconStyle: 'native' })"
                  >
                    <span class="flex items-center gap-2">
                      <span class="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-violet-500 to-brand-600 text-white shadow-sm">
                        <AppWindow :size="16" />
                      </span>
                      <span class="flex h-8 w-8 items-center justify-center rounded-[9px] bg-white shadow-sm ring-1 ring-black/5">
                        <span class="font-display text-[13px] font-bold text-cyan-600">B</span>
                      </span>
                      <span class="ml-auto">
                        <Check v-if="desk.settings.iconStyle === 'native'" :size="14" class="text-brand-500" />
                      </span>
                    </span>
                    <span class="mt-2 block text-[11.5px] font-medium">原生图标</span>
                    <span class="mt-0.5 block text-[9.5px] leading-4 text-slate-400 dark:text-slate-500">
                      读取软件真实图标与网站 favicon
                    </span>
                  </button>
                  <button
                    type="button"
                    class="rounded-xl border p-2.5 text-left transition"
                    :class="
                      desk.settings.iconStyle === 'letter'
                        ? 'border-brand-400/70 bg-brand-500/[0.055] ring-2 ring-brand-500/15'
                        : 'border-slate-200/80 hover:border-slate-300 dark:border-white/[0.08] dark:hover:border-white/20'
                    "
                    @click="updateSettings({ iconStyle: 'letter' })"
                  >
                    <span class="flex items-center gap-2">
                      <span class="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-violet-500 to-brand-600 font-display text-[14px] font-semibold text-white shadow-sm">
                        微
                      </span>
                      <span class="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-cyan-500 to-blue-600 font-display text-[14px] font-semibold text-white shadow-sm">
                        B
                      </span>
                      <span class="ml-auto">
                        <Type :size="14" :class="desk.settings.iconStyle === 'letter' ? 'text-brand-500' : 'text-slate-300 dark:text-slate-600'" />
                      </span>
                    </span>
                    <span class="mt-2 block text-[11.5px] font-medium">统一文字</span>
                    <span class="mt-0.5 block text-[9.5px] leading-4 text-slate-400 dark:text-slate-500">
                      使用名称首字，风格整齐统一
                    </span>
                  </button>
                </div>
              </div>

              <div class="rounded-2xl border border-slate-200/80 bg-white/55 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                <div class="flex items-start gap-3">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 dark:text-brand-300">
                    <Palette :size="15" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12.5px] font-medium">统一分类外观</p>
                    <p class="mt-1 text-[11px] leading-5 text-slate-400 dark:text-slate-500">
                      开启后，所有分类、右上角「系统」卡和图标配色统一使用下面的透明度与强调色，优先于单独设置。关闭后恢复各分类、系统卡和图标自己的设置。
                    </p>
                  </div>
                  <button
                    type="button"
                    class="relative mt-1 h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
                    :class="desk.settings.uniformCards ? 'bg-brand-500' : 'bg-slate-300 dark:bg-white/15'"
                    role="switch"
                    :aria-checked="desk.settings.uniformCards"
                    aria-label="统一分类外观"
                    @click="updateSettings({ uniformCards: !desk.settings.uniformCards })"
                  >
                    <span
                      class="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                      :class="desk.settings.uniformCards ? 'left-[19px]' : 'left-[3px]'"
                    />
                  </button>
                </div>

                <div v-if="desk.settings.uniformCards" class="mt-4 space-y-4 border-t border-slate-200/70 pt-4 dark:border-white/[0.06]">
                  <div>
                    <div class="mb-2 flex items-center justify-between text-[11px]">
                      <span class="font-medium text-slate-500 dark:text-slate-400">分类与系统卡背景不透明度</span>
                      <span class="font-mono text-[10.5px] text-slate-400">{{ globalOpacityPercent }}%</span>
                    </div>
                    <input
                      class="range"
                      type="range"
                      :min="Math.round(MIN_CATEGORY_OPACITY * 100)"
                      max="100"
                      step="1"
                      :value="globalOpacityPercent"
                      :style="globalOpacityStyle"
                      aria-label="分类与系统卡背景不透明度"
                      @input="setGlobalOpacity"
                    />
                  </div>
                  <div>
                    <span class="field-label">全局分类强调色</span>
                    <AccentSwatches v-model="globalAccentModel" />
                  </div>
                </div>
              </div>

              <div class="space-y-2">
                <div class="flex items-center gap-3 rounded-xl border border-slate-200/70 px-3.5 py-3 dark:border-white/[0.07]">
                  <Power :size="15" class="shrink-0 text-slate-400" />
                  <div class="min-w-0 flex-1">
                    <p class="text-[12px] font-medium">开机自启</p>
                    <p class="mt-0.5 text-[10.5px] leading-4 text-slate-400">
                      {{
                        desktopRuntime
                          ? '默认开启。登录 Windows 后自动启动 DeskGrid，桌面分类会直接就位。'
                          : '仅桌面客户端可用。'
                      }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-45"
                    :class="autostartEnabled ? 'bg-brand-500' : 'bg-slate-300 dark:bg-white/15'"
                    role="switch"
                    :aria-checked="autostartEnabled"
                    aria-label="开机自启"
                    :disabled="!desktopRuntime || autostartBusy"
                    @click="toggleAutostart"
                  >
                    <span
                      class="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
                      :class="autostartEnabled ? 'left-[19px]' : 'left-[3px]'"
                    />
                  </button>
                </div>
                <div class="flex items-center gap-3 rounded-xl border border-slate-200/70 px-3.5 py-3 dark:border-white/[0.07]">
                  <Sparkles :size="15" class="shrink-0 text-slate-400" />
                  <div class="min-w-0 flex-1">
                    <p class="text-[12px] font-medium">新手引导</p>
                    <p class="mt-0.5 text-[10.5px] text-slate-400">重新查看五步快速上手说明。</p>
                  </div>
                  <button class="btn-secondary px-2.5 py-1.5 text-[11px]" type="button" @click="replayGuide">
                    重新播放
                  </button>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="overlayState.settingsTab === 'security'">
            <div class="space-y-5">
              <div
                class="rounded-2xl border p-4"
                :class="
                  privacyLocked
                    ? 'border-brand-500/25 bg-brand-500/[0.06]'
                    : hasPassword
                      ? 'border-emerald-500/20 bg-emerald-500/[0.055]'
                      : 'border-slate-200/80 bg-white/55 dark:border-white/[0.08] dark:bg-white/[0.025]'
                "
              >
                <div class="flex items-start gap-3">
                  <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    :class="
                      privacyLocked
                        ? 'bg-brand-500/12 text-brand-600 dark:text-brand-300'
                        : hasPassword
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                          : 'bg-slate-900/[0.05] text-slate-400 dark:bg-white/[0.06]'
                    "
                  >
                    <LockKeyhole :size="17" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12.5px] font-medium">
                      {{
                        privacyLocked
                          ? '隐私分类已锁定'
                          : hasPassword
                            ? '隐私密码已设置'
                            : '隐私锁未设置'
                      }}
                    </p>
                    <p class="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      {{
                        privacyLocked
                          ? `${privateCategoryCount} 个隐私分类当前已隐藏。可通过托盘菜单「隐私锁…」或这里输入密码恢复。`
                          : hasPassword
                            ? `已开启隐私的分类：${privateCategoryCount} 个。在分类设置中开启隐私后，即可通过「系统」卡上的锁按钮或托盘菜单隐藏。`
                            : '先设置密码，再在分类设置中开启「隐私分类」；之后可以随时隐藏这些分类。'
                      }}
                    </p>
                  </div>
                  <button
                    class="btn shrink-0 px-3 py-1.5 text-[11px]"
                    :class="
                      privacyLocked
                        ? 'bg-brand-500 text-white hover:bg-brand-400'
                        : 'border border-slate-200/80 bg-white/65 text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/[0.1]'
                    "
                    type="button"
                    :disabled="!hasPassword || privateCategoryCount === 0"
                    @click="togglePrivacyLock"
                  >
                    <LockKeyhole :size="13" />
                    {{ privacyLocked ? '解锁隐私分类' : '锁定隐私分类' }}
                  </button>
                </div>
              </div>

              <div class="rounded-2xl border border-slate-200/80 p-4 dark:border-white/[0.08]">
                <div class="mb-4 flex items-center gap-2">
                  <KeyRound :size="15" class="text-slate-400" />
                  <h4 class="text-[12.5px] font-medium">
                    {{ hasPassword ? '修改隐私锁密码' : '设置隐私锁密码' }}
                  </h4>
                </div>
                <div class="space-y-3">
                  <div v-if="hasPassword">
                    <label class="field-label" for="current-password">当前密码</label>
                    <input
                      id="current-password"
                      v-model="currentPassword"
                      class="field"
                      type="password"
                      autocomplete="current-password"
                      placeholder="输入当前密码"
                      maxlength="128"
                      @input="passwordError = ''"
                    />
                  </div>
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label class="field-label" for="new-password">
                        {{ hasPassword ? '新密码' : '密码' }}
                      </label>
                      <input
                        id="new-password"
                        v-model="newPassword"
                        class="field"
                        type="password"
                        autocomplete="new-password"
                        placeholder="至少 4 个字符"
                        maxlength="128"
                        @input="passwordError = ''"
                      />
                    </div>
                    <div>
                      <label class="field-label" for="confirm-password">确认密码</label>
                      <input
                        id="confirm-password"
                        v-model="confirmPassword"
                        class="field"
                        type="password"
                        autocomplete="new-password"
                        placeholder="再次输入"
                        maxlength="128"
                        @input="passwordError = ''"
                      />
                    </div>
                  </div>
                  <p v-if="passwordError" class="text-[11.5px] text-rose-600 dark:text-rose-300">
                    {{ passwordError }}
                  </p>
                  <div class="flex flex-wrap items-center gap-2 pt-1">
                    <button class="btn-primary" type="button" :disabled="passwordBusy" @click="savePassword">
                      <LoaderCircle v-if="passwordBusy" :size="14" class="animate-spin" />
                      {{ hasPassword ? '更新密码' : '设置密码' }}
                    </button>
                    <button
                      v-if="hasPassword"
                      class="btn-danger ml-auto"
                      type="button"
                      :disabled="passwordBusy"
                      @click="removePassword"
                    >
                      移除密码
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex gap-2.5 rounded-xl bg-slate-900/[0.03] px-3.5 py-3 dark:bg-white/[0.025]">
                <ShieldCheck :size="15" class="mt-0.5 shrink-0 text-slate-400" />
                <p class="text-[10.5px] leading-5 text-slate-400 dark:text-slate-500">
                  密码使用 PBKDF2-SHA256 加盐哈希保存在本机，不会上传。隐私锁只隐藏分类入口，不会加密硬盘文件。忘记密码时可在「数据」页重置全部数据；重置会移除布局和密码。
                </p>
              </div>
            </div>
          </template>

          <template v-else-if="overlayState.settingsTab === 'data'">
            <div class="space-y-5">
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-2xl border border-slate-200/80 bg-white/55 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <p class="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">分类</p>
                  <p class="mt-1 font-display text-[22px] font-semibold">{{ desk.categories.length }}</p>
                </div>
                <div class="rounded-2xl border border-slate-200/80 bg-white/55 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.025]">
                  <p class="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400">图标入口</p>
                  <p class="mt-1 font-display text-[22px] font-semibold">{{ itemCount }}</p>
                </div>
              </div>

              <div class="rounded-2xl border border-slate-200/80 p-4 dark:border-white/[0.08]">
                <div class="flex items-start gap-3">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900/[0.05] text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                    <Download :size="15" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12.5px] font-medium">导出配置备份</p>
                    <p class="mt-1 text-[11px] leading-5 text-slate-400 dark:text-slate-500">
                      将分类、图标位置和全局/单独外观设置导出为 JSON 文件。为了安全，不包含密码和隐私锁定状态。
                    </p>
                  </div>
                  <button class="btn-secondary shrink-0" type="button" @click="exportConfig">
                    <FileJson :size="14" />
                    导出
                  </button>
                </div>
              </div>

              <div class="rounded-2xl border border-slate-200/80 p-4 dark:border-white/[0.08]">
                <div class="flex items-start gap-3">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900/[0.05] text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                    <Upload :size="15" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12.5px] font-medium">导入配置备份</p>
                    <p class="mt-1 text-[11px] leading-5 text-slate-400 dark:text-slate-500">
                      从之前导出的 JSON 文件恢复桌面布局。当前密码会保留，密码不会随文件导入。
                    </p>
                  </div>
                  <button class="btn-secondary shrink-0" type="button" :disabled="dataBusy" @click="importConfig">
                    <LoaderCircle v-if="dataBusy" :size="14" class="animate-spin" />
                    <Upload v-else :size="14" />
                    导入
                  </button>
                </div>
              </div>

              <div class="rounded-2xl border border-rose-500/15 bg-rose-500/[0.045] p-4">
                <div class="flex items-start gap-3">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500 dark:text-rose-300">
                    <Trash2 :size="15" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12.5px] font-medium">重置所有数据</p>
                    <p class="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      移除所有分类、图标、设置和密码，并重新显示新手引导。不会删除本机文件。
                    </p>
                  </div>
                  <button class="btn-danger shrink-0" type="button" @click="resetEverything">重置</button>
                </div>
              </div>

              <p v-if="dataError" class="text-[11.5px] text-rose-600 dark:text-rose-300">{{ dataError }}</p>

              <p class="text-[10.5px] leading-5 text-slate-400 dark:text-slate-500">
                配置仅保存在当前 Windows 用户的本地存储中。更换设备时，可先导出再导入。
              </p>
            </div>
          </template>

          <template v-else>
            <div class="space-y-5">
              <div class="flex items-center gap-3">
                <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-950/20">
                  <Layers :size="22" />
                </span>
                <div>
                  <h4 class="font-display text-[16px] font-semibold">{{ APP_NAME }}</h4>
                  <p class="mt-0.5 text-[11px] text-slate-400">
                    v{{ APP_VERSION }} · 开源桌面收纳工具
                  </p>
                </div>
                <span class="ml-auto rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-1 text-[9.5px] font-medium text-emerald-600 dark:text-emerald-300">
                  MIT License
                </span>
              </div>

              <p class="text-[11.5px] leading-6 text-slate-500 dark:text-slate-400">
                一个不打扰、不臃肿的桌面收纳层。把深层文件、常用软件和网页书签放在顺手的位置，只在你需要时出现。
              </p>

              <div class="grid grid-cols-2 gap-2">
                <button class="btn-secondary justify-start" type="button" @click="openExternal(GITHUB_URL)">
                  <Github :size="14" />
                  GitHub 仓库
                </button>
                <button class="btn-secondary justify-start" type="button" @click="openExternal(ISSUES_URL)">
                  <ExternalLink :size="14" />
                  反馈问题
                </button>
              </div>

              <div class="rounded-2xl border border-slate-200/80 bg-white/55 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
                <div class="flex items-start gap-3">
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 dark:text-brand-300">
                    <Users :size="15" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12.5px] font-medium">加入交流群</p>
                    <p class="mt-1 text-[11px] leading-5 text-slate-400 dark:text-slate-500">
                      遇到问题或想交流使用体验，可在对应 App 中搜索群号加入，也欢迎到 GitHub 提交 Issue。
                    </p>
                  </div>
                </div>
                <div class="mt-3 space-y-2">
                  <div
                    v-for="group in FEEDBACK_GROUPS"
                    :key="group.platform"
                    class="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/55 px-3.5 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.025]"
                  >
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900/[0.05] text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                      <component :is="feedbackIcon(group.platform)" :size="15" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="text-[11.5px] font-medium">{{ group.label }}</p>
                      <p class="mt-0.5 font-mono text-[10.5px] text-slate-400">{{ group.id }}</p>
                    </div>
                    <button
                      class="btn-secondary shrink-0 px-2.5 py-1.5 text-[10.5px]"
                      type="button"
                      :aria-label="`复制${group.label}群号`"
                      @click="copyFeedbackId(group)"
                    >
                      <Copy :size="12" />
                      复制群号
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div class="mb-2.5 flex items-end justify-between">
                  <div>
                    <p class="text-[12.5px] font-medium">下载安装包</p>
                    <p class="mt-0.5 text-[10.5px] text-slate-400">GitHub 为主渠道，网盘适合网络受限时使用。</p>
                  </div>
                  <button
                    class="text-[10.5px] text-brand-500 transition hover:text-brand-400 dark:text-brand-300"
                    type="button"
                    @click="openExternal(RELEASES_URL)"
                  >
                    查看最新版本
                  </button>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="channel in DOWNLOAD_CHANNELS"
                    :key="channel.kind"
                    class="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/55 px-3.5 py-3 transition hover:border-brand-400/40 hover:bg-white/80 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:bg-white/[0.045]"
                  >
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900/[0.05] text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
                      <component :is="channelIcon(channel.kind)" :size="16" />
                    </span>
                    <button class="min-w-0 flex-1 text-left" type="button" @click="openExternal(channel.url)">
                      <span class="block text-[12px] font-medium">{{ channel.name }}</span>
                      <span class="mt-0.5 block truncate text-[10px] text-slate-400">{{ channel.description }}</span>
                    </button>
                    <button
                      v-if="channel.code"
                      class="flex items-center gap-1 rounded-md border border-slate-200/80 px-1.5 py-1 font-mono text-[9.5px] text-slate-400 transition hover:border-slate-300 hover:text-slate-600 dark:border-white/10 dark:hover:text-slate-200"
                      type="button"
                      :title="`复制提取码 ${channel.code}`"
                      @click="copyCode(channel.code)"
                    >
                      {{ channel.code }}
                      <Copy :size="10" />
                    </button>
                    <button
                      class="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-900/[0.05] hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                      type="button"
                      :aria-label="`打开 ${channel.name}`"
                      @click="openExternal(channel.url)"
                    >
                      <ExternalLink :size="13" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1.5">
                <span class="rounded-md bg-slate-900/[0.04] px-2 py-1 text-[9.5px] text-slate-400 dark:bg-white/[0.05]">Tauri 2</span>
                <span class="rounded-md bg-slate-900/[0.04] px-2 py-1 text-[9.5px] text-slate-400 dark:bg-white/[0.05]">Vue 3</span>
                <span class="rounded-md bg-slate-900/[0.04] px-2 py-1 text-[9.5px] text-slate-400 dark:bg-white/[0.05]">Tailwind CSS</span>
                <span class="ml-auto text-[9.5px] text-slate-400">数据只属于你 · 不上传云端</span>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>
  </BaseModal>
</template>
