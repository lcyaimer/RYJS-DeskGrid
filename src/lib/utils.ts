import { ACCENTS } from '../constants'
import type { AccentKey, ItemKind, ThemeMode } from '../types'

export function uid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function basename(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return index >= 0 ? trimmed.slice(index + 1) : trimmed
}

export function joinPath(parent: string, name: string): string {
  const cleanParent = parent.trim().replace(/[\\/]+$/, '')
  const separator = cleanParent.includes('\\') || /^[a-zA-Z]:$/.test(cleanParent) ? '\\' : '/'
  return `${cleanParent}${separator}${name.trim()}`
}

const APP_EXTENSIONS = new Set([
  'exe',
  'lnk',
  'appref-ms',
  'bat',
  'cmd',
  'com',
  'msi',
  'ps1',
  'jar',
])

export function inferPathKind(path: string, forceFolder = false): ItemKind {
  if (forceFolder) return 'folder'
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  const extension = dot > -1 ? name.slice(dot + 1).toLowerCase() : ''
  return APP_EXTENSIONS.has(extension) ? 'app' : 'file'
}

export function validateEntryName(name: string): string | null {
  const value = name.trim()
  if (!value) return '请输入名称'
  if (value === '.' || value === '..') return '名称不能是 . 或 ..'
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(value)) {
    return '名称不能包含 < > : " / \\ | ? * 等字符'
  }
  if (value.length > 180) return '名称过长'
  if (value.endsWith('.') || value.endsWith(' ')) return '名称不能以空格或点结尾'
  return null
}

export function normalizeWebUrl(input: string): string {
  let candidate = input.trim()
  if (!candidate) throw new Error('请输入网址')
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`
  }
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('网址格式不正确')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http / https 网址')
  }
  return url.toString()
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function initialOf(name: string, fallback = '#'): string {
  const trimmed = name.trim()
  if (!trimmed) return fallback
  return Array.from(trimmed)[0]?.toUpperCase() ?? fallback
}

export function accentOf(key: AccentKey | undefined): AccentKey {
  return key && key in ACCENTS ? key : 'violet'
}

export function accentColor(key: AccentKey | undefined): string {
  return ACCENTS[accentOf(key)].color
}

export function categoryBackground(theme: ThemeMode, opacity: number): string {
  const alpha = clamp(opacity, 0, 1).toFixed(3)
  return theme === 'dark'
    ? `rgba(15, 19, 32, ${alpha})`
    : `rgba(255, 255, 255, ${alpha})`
}

export function tileBackground(accent: AccentKey | undefined): string {
  const color = accentColor(accent)
  return `radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.42), transparent 46%), linear-gradient(148deg, ${color}, ${color})`
}

export function shortPath(path: string, max = 42): string {
  if (path.length <= max) return path
  const head = path.slice(0, 16)
  const tail = path.slice(-(max - 19))
  return `${head}…${tail}`
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      textarea.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
