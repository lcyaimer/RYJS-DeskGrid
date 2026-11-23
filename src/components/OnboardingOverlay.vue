<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  AppWindow,
  Check,
  Folder,
  Grip,
  Link2,
  LockKeyhole,
  MousePointer2,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-vue-next'
import BrandMark from './BrandMark.vue'
import { closeOnboarding, overlayState } from '../lib/overlays'
import { completeOnboarding } from '../stores/desk'
import { toast } from '../lib/feedback'

const steps = [
  {
    eyebrow: 'WELCOME',
    title: '把常用的一切，放在眼前',
    description:
      'RYJS DeskGrid 是一层轻盈透明的桌面收纳空间。常用文件、软件和网页不再散落各处，想找的时候抬眼就能看到。',
    hint: '你的桌面布局和内容只保存在本机。',
  },
  {
    eyebrow: 'LAYOUT',
    title: '分类随心摆放',
    description:
      '按住分类标题栏即可拖动位置，松手后自动记住。每个分类都能单独调整背景透明度、折叠或更换强调色，也可以在设置中统一覆盖外观。',
    hint: '空白区域的鼠标操作会穿透到桌面，窗口始终位于其他应用下方。',
  },
  {
    eyebrow: 'SHORTCUTS',
    title: '文件、软件、网址，一键直达',
    description:
      '添加任意深度的本机文件、软件或文件夹，点击图标直接打开。也可以粘贴网址或导入浏览器书签。',
    hint: '新建文件或文件夹时，可以自定义保存路径。',
  },
  {
    eyebrow: 'TRAY',
    title: '藏在托盘里，需要时再出现',
    description:
      '应用窗口不会占用任务栏。关闭窗口后仍驻留在系统托盘；右键托盘图标可以显示/隐藏窗口、打开设置、使用隐私锁或退出。',
    hint: '托盘菜单「隐私锁…」是隐藏分类的解锁入口。',
  },
  {
    eyebrow: 'PRIVACY',
    title: '只隐藏你指定的分类',
    description:
      '在新建或编辑分类时开启「隐私分类」，设置密码后即可从「系统」卡上的锁按钮或托盘菜单隐藏这些分类。桌面不会被锁屏占满，需要查看时通过托盘「隐私锁…」输入密码恢复。',
    hint: '准备好了，开始整理你的桌面吧。',
    last: true,
  },
]

const step = ref(0)
const current = computed(() => steps[step.value])
const progress = computed(() => Math.round(((step.value + 1) / steps.length) * 100))
const cardRef = ref<HTMLElement | null>(null)

function finish(): void {
  completeOnboarding()
  closeOnboarding()
  toast.success('欢迎使用 RYJS DeskGrid')
}

function next(): void {
  if (step.value >= steps.length - 1) finish()
  else step.value += 1
}

function previous(): void {
  if (step.value > 0) step.value -= 1
}

function skip(): void {
  completeOnboarding()
  closeOnboarding()
}

function handleKeydown(event: KeyboardEvent): void {
  if (!overlayState.onboardingOpen) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    next()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    previous()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    skip()
  } else if (event.key === 'Tab') {
    const focusable = Array.from(cardRef.value?.querySelectorAll<HTMLElement>('button') ?? []).filter(
      (element) => element.offsetParent !== null,
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => overlayState.onboardingOpen,
  async (open) => {
    if (open) {
      step.value = 0
      await nextTick()
      cardRef.value?.focus({ preventScroll: true })
    }
  },
  { immediate: true },
)

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="overlayState.onboardingOpen"
      class="modal-backdrop fixed inset-0 z-[110] flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-label="新手引导"
    >
      <div
        ref="cardRef"
        class="relative grid w-full max-w-[860px] overflow-hidden rounded-[30px] border border-white/10 bg-[#101522] text-white shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)] animate-rise-in sm:grid-cols-[292px_1fr]"
        style="outline: none"
        tabindex="-1"
      >
        <button
          type="button"
          class="absolute right-5 top-5 z-10 rounded-lg px-2.5 py-1 text-[11px] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          @click="skip"
        >
          跳过引导
        </button>

        <div class="relative hidden min-h-[470px] overflow-hidden border-r border-white/[0.07] p-7 sm:flex sm:flex-col">
          <div class="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl" />
          <div class="pointer-events-none absolute -bottom-28 -right-24 h-64 w-64 rounded-full bg-cyan-400/[0.09] blur-3xl" />
          <div
            class="pointer-events-none absolute inset-0 opacity-[0.16]"
            style="
              background-image: radial-gradient(rgba(255, 255, 255, 0.65) 0.6px, transparent 0.6px);
              background-size: 18px 18px;
            "
          />
          <div class="relative z-10 flex h-full flex-col">
            <div class="flex items-center gap-2.5">
              <BrandMark :size="32" />
              <span class="font-display text-[13px] font-semibold tracking-[-0.01em]">RYJS DeskGrid</span>
              <span class="rounded-full border border-white/10 px-1.5 py-0.5 text-[8.5px] text-slate-500">GUIDE</span>
            </div>

            <div class="flex flex-1 items-center justify-center">
              <div :key="step" class="w-full animate-rise-in">
                <div v-if="step === 0" class="flex flex-col items-center">
                  <BrandMark :size="62" glow />
                  <div class="mt-6 grid w-[194px] grid-cols-2 gap-2.5">
                    <div class="flex h-[82px] flex-col justify-end rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                      <Folder :size="17" class="text-amber-300" />
                      <span class="mt-2 text-[10px] text-slate-300">工作资料</span>
                    </div>
                    <div class="flex h-[82px] flex-col justify-end rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                      <AppWindow :size="17" class="text-violet-300" />
                      <span class="mt-2 text-[10px] text-slate-300">常用软件</span>
                    </div>
                    <div class="flex h-[82px] flex-col justify-end rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                      <Link2 :size="17" class="text-cyan-300" />
                      <span class="mt-2 text-[10px] text-slate-300">书签网址</span>
                    </div>
                    <div class="flex h-[82px] flex-col justify-end rounded-2xl border border-white/10 bg-white/[0.06] p-3">
                      <Sparkles :size="17" class="text-emerald-300" />
                      <span class="mt-2 text-[10px] text-slate-300">灵感收藏</span>
                    </div>
                  </div>
                </div>

                <div v-else-if="step === 1" class="flex flex-col items-center">
                  <div class="relative w-[212px] rounded-2xl border border-white/10 bg-white/[0.065] p-3 shadow-2xl">
                    <div class="flex items-center gap-2">
                      <span class="h-5 w-5 rounded-md bg-brand-400/20 ring-1 ring-inset ring-brand-400/30" />
                      <span class="h-2 w-16 rounded-full bg-white/25" />
                      <span class="ml-auto h-4 w-4 rounded-md bg-white/[0.08]" />
                    </div>
                    <div class="mt-3 grid grid-cols-4 gap-2">
                      <span v-for="i in 4" :key="i" class="aspect-square rounded-lg bg-white/[0.09]" />
                    </div>
                    <div class="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-2 py-1.5">
                      <Grip :size="11" class="text-slate-500" />
                      <span class="text-[8px] text-slate-500">拖动标题栏移动</span>
                    </div>
                  </div>
                  <MousePointer2 :size="23" class="-mt-1 ml-28 rotate-[-15deg] text-white drop-shadow-lg" />
                  <div class="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[9.5px] text-slate-400">
                    <span class="h-1.5 w-8 overflow-hidden rounded-full bg-white/10">
                      <span class="block h-full w-2/3 rounded-full bg-brand-400" />
                    </span>
                    透明度 68%
                  </div>
                </div>

                <div v-else-if="step === 2" class="flex flex-col items-center">
                  <div class="grid w-[210px] grid-cols-3 gap-2.5">
                    <div class="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                      <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500">
                        <Folder :size="20" />
                      </span>
                      <span class="mt-2 text-[9px] text-slate-400">文件夹</span>
                    </div>
                    <div class="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                      <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-brand-600">
                        <AppWindow :size="20" />
                      </span>
                      <span class="mt-2 text-[9px] text-slate-400">软件</span>
                    </div>
                    <div class="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                      <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-sky-600">
                        <Link2 :size="20" />
                      </span>
                      <span class="mt-2 text-[9px] text-slate-400">网址</span>
                    </div>
                  </div>
                  <div class="mt-4 flex w-[210px] items-center gap-2 rounded-xl border border-brand-400/20 bg-brand-500/[0.08] px-3 py-2.5">
                    <span class="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
                      <Check :size="12" :stroke-width="2.4" />
                    </span>
                    <div>
                      <p class="text-[9.5px] font-medium text-slate-200">点击即可打开</p>
                      <p class="text-[8px] text-slate-500">文件不会被移动或复制</p>
                    </div>
                  </div>
                </div>

                <div v-else-if="step === 3" class="flex flex-col items-center">
                  <div class="w-[226px] overflow-hidden rounded-2xl border border-white/10 bg-[#151b2b] shadow-2xl">
                    <div class="flex items-center gap-1.5 border-b border-white/[0.07] px-3 py-2.5">
                      <span class="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.09]">
                        <BrandMark :size="16" />
                      </span>
                      <span class="text-[8.5px] text-slate-400">RYJS DeskGrid</span>
                      <span class="ml-auto h-2 w-2 rounded-full bg-emerald-400" />
                    </div>
                    <div class="space-y-1 p-2">
                      <div class="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2 py-2 text-[9px] text-slate-200">
                        <Settings :size="11" class="text-slate-400" /> 设置…
                      </div>
                      <div class="flex items-center gap-2 rounded-lg px-2 py-2 text-[9px] text-slate-400">
                        <LockKeyhole :size="11" /> 隐私锁…
                      </div>
                      <div class="h-px bg-white/[0.07]" />
                      <div class="flex items-center gap-2 rounded-lg px-2 py-2 text-[9px] text-slate-500">
                        <span class="text-[8px]">⎋</span> 退出 DeskGrid
                      </div>
                    </div>
                  </div>
                  <div class="mt-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[9px] text-slate-400">
                    <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    常驻系统托盘
                  </div>
                </div>

                <div v-else class="flex flex-col items-center">
                  <div class="relative flex h-[136px] w-[136px] items-center justify-center rounded-[38px] border border-white/10 bg-white/[0.055]">
                    <div class="absolute inset-4 rounded-[28px] bg-brand-500/15 blur-xl" />
                    <LockKeyhole :size="48" :stroke-width="1.3" class="relative text-brand-200" />
                    <span class="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400 text-[#07130e] shadow-lg">
                      <ShieldCheck :size="16" :stroke-width="2.3" />
                    </span>
                  </div>
                  <div class="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[9.5px] text-slate-400">
                    PBKDF2 · 本机加盐哈希
                  </div>
                </div>
              </div>
            </div>

            <div class="relative z-10">
              <div class="mb-2 flex items-center justify-between text-[9px] text-slate-500">
                <span>{{ current.eyebrow }}</span>
                <span class="font-mono">{{ String(step + 1).padStart(2, '0') }} / {{ String(steps.length).padStart(2, '0') }}</span>
              </div>
              <div class="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-300 transition-[width] duration-300"
                  :style="{ width: `${progress}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="relative flex min-h-[470px] flex-col p-7 pt-12 sm:p-9 sm:pt-12">
          <div class="flex flex-1 flex-col justify-center">
            <p class="mb-3 font-mono text-[10px] tracking-[0.16em] text-brand-300/80">
              {{ current.eyebrow }} · {{ String(step + 1).padStart(2, '0') }}
            </p>
            <h2 class="max-w-[400px] font-display text-[28px] font-semibold leading-[1.24] tracking-[-0.035em] sm:text-[31px]">
              {{ current.title }}
            </h2>
            <p class="mt-4 max-w-[420px] text-[13px] leading-7 text-slate-400">
              {{ current.description }}
            </p>
            <p class="mt-5 flex items-center gap-2 text-[11px] text-slate-500">
              <span class="h-1 w-1 rounded-full bg-brand-400/80" />
              {{ current.hint }}
            </p>
          </div>

          <div class="mt-8 flex items-center gap-2.5">
            <button
              v-if="step > 0"
              class="btn border border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/[0.08]"
              type="button"
              @click="previous"
            >
              <ArrowLeft :size="15" />
              上一步
            </button>
            <button
              class="btn ml-auto min-w-[126px] bg-brand-500 text-white shadow-lg shadow-brand-950/30 hover:bg-brand-400"
              type="button"
              @click="next"
            >
              {{ current.last ? '开始使用' : '下一步' }}
              <Check v-if="current.last" :size="15" />
              <ArrowRight v-else :size="15" />
            </button>
          </div>
          <div class="mt-5 flex gap-1.5 sm:hidden">
            <span
              v-for="(_, index) in steps"
              :key="index"
              class="h-1 rounded-full transition-all"
              :class="index === step ? 'w-5 bg-brand-400' : 'w-1.5 bg-white/15'"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
