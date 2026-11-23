import { reactive, ref } from 'vue'
import { uid } from './utils'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  kind: ToastKind
}

export const toasts = ref<ToastItem[]>([])

function push(message: string, kind: ToastKind): void {
  const id = uid('toast')
  toasts.value.push({ id, message, kind })
  if (toasts.value.length > 4) toasts.value.shift()
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }, kind === 'error' ? 4600 : 3000)
}

export const toast = {
  success: (message: string) => push(message, 'success'),
  error: (message: string) => push(message, 'error'),
  info: (message: string) => push(message, 'info'),
}

export function dismissToast(id: string): void {
  toasts.value = toasts.value.filter((item) => item.id !== id)
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'normal'
}

interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  tone: 'danger' | 'normal'
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  tone: 'normal',
})

let confirmResolver: ((value: boolean) => void) | null = null

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (confirmResolver) {
    confirmResolver(false)
    confirmResolver = null
  }
  confirmState.open = true
  confirmState.title = options.title
  confirmState.message = options.message
  confirmState.confirmText = options.confirmText ?? '确认'
  confirmState.cancelText = options.cancelText ?? '取消'
  confirmState.tone = options.tone ?? 'normal'
  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve
  })
}

export function settleConfirm(value: boolean): void {
  confirmState.open = false
  const resolver = confirmResolver
  confirmResolver = null
  resolver?.(value)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '操作失败，请稍后重试'
}
