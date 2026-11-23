import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open as openNativeDialog } from '@tauri-apps/plugin-dialog'
import type {
  BookmarkLink,
  BookmarkSource,
  DroppedPathInfo,
  SettingsTab,
  SystemPaths,
  WindowRect,
} from '../types'

export interface DialogFilter {
  name: string
  extensions: string[]
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** The standalone settings window renders a normal, viewport-sized page. */
export function isSettingsWindow(): boolean {
  if (typeof window === 'undefined') return false
  return /(^|\/)settings\.html$/i.test(window.location.pathname)
}

function requireDesktop(): void {
  if (!isTauriRuntime()) {
    throw new Error('此功能需要在 RYJS DeskGrid 桌面客户端中使用')
  }
}

export async function getSystemPaths(): Promise<SystemPaths> {
  if (!isTauriRuntime()) {
    return {
      home: 'C:\\Users\\Public',
      desktop: 'C:\\Users\\Public\\Desktop',
      documents: 'C:\\Users\\Public\\Documents',
      downloads: 'C:\\Users\\Public\\Downloads',
    }
  }
  return invoke<SystemPaths>('system_paths')
}

export async function openTarget(target: string): Promise<void> {
  if (!target.trim()) throw new Error('目标路径为空')
  if (!isTauriRuntime()) {
    if (/^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer')
      return
    }
    throw new Error('浏览器预览环境无法打开本机路径')
  }
  await invoke('open_target', { target })
}

export async function pickPath(
  mode: 'file' | 'folder',
  options: { title?: string; defaultPath?: string; filters?: DialogFilter[] } = {},
): Promise<string | null> {
  requireDesktop()
  const selected = await openNativeDialog({
    directory: mode === 'folder',
    multiple: false,
    title: options.title ?? (mode === 'folder' ? '选择文件夹' : '选择文件'),
    defaultPath: options.defaultPath,
    filters: mode === 'file' ? options.filters : undefined,
  })
  return typeof selected === 'string' ? selected : null
}

export async function createFolderAt(path: string): Promise<void> {
  requireDesktop()
  await invoke('create_folder', { path })
}

export async function createFileAt(path: string, content: string): Promise<void> {
  requireDesktop()
  await invoke('create_file', { path, content })
}

export async function readTextFile(path: string): Promise<string> {
  requireDesktop()
  return invoke<string>('read_text_file', { path })
}

export async function listBookmarkSources(): Promise<BookmarkSource[]> {
  if (!isTauriRuntime()) return []
  return invoke<BookmarkSource[]>('list_bookmark_sources')
}

export async function readBrowserBookmarks(path: string): Promise<BookmarkLink[]> {
  requireDesktop()
  return invoke<BookmarkLink[]>('read_browser_bookmarks', { path })
}

export async function setWindowLayout(overlay: boolean, rects: WindowRect[]): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke('set_window_layout', { overlay, rects })
}

const SETTINGS_TABS: SettingsTab[] = ['appearance', 'security', 'data', 'about']

function normalizeTab(value: unknown): SettingsTab | null {
  return typeof value === 'string' && SETTINGS_TABS.includes(value as SettingsTab)
    ? (value as SettingsTab)
    : null
}

/** Open (or focus) the standalone settings window. */
export async function openSettingsWindow(tab: SettingsTab): Promise<void> {
  requireDesktop()
  await invoke('open_settings_window', { tab })
}

/** One-shot tab requested while the settings window was being created. */
export async function takeSettingsEntryTab(): Promise<SettingsTab | null> {
  if (!isTauriRuntime()) return null
  return normalizeTab(await invoke<string | null>('take_settings_entry_tab'))
}

export async function listenSettingsTab(
  handler: (tab: SettingsTab) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined
  return listen<string>('deskgrid://settings-tab', (event) => {
    const tab = normalizeTab(event.payload)
    if (tab) handler(tab)
  })
}

export async function closeSettingsWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke('close_settings_window')
}

/** Ask the desktop window to replay onboarding (called from settings). */
export async function requestOnboarding(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke('request_onboarding')
}

export async function listenOnboardingRequests(
  handler: () => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined
  return listen('deskgrid://onboarding', () => handler())
}

export async function inspectDroppedPaths(paths: string[]): Promise<DroppedPathInfo[]> {
  if (!isTauriRuntime() || paths.length === 0) return []
  return invoke<DroppedPathInfo[]>('inspect_paths', { paths })
}

export async function appIconDataUrl(path: string): Promise<string | null> {
  if (!isTauriRuntime() || !path.trim()) return null
  return invoke<string | null>('app_icon_data_url', { path })
}

export async function getAutostartEnabled(): Promise<boolean> {
  if (!isTauriRuntime()) return false
  return invoke<boolean>('get_autostart_enabled')
}

export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  requireDesktop()
  return invoke<boolean>('set_autostart_enabled', { enabled })
}

export type TrayAction = 'open-settings' | 'privacy-lock'

export async function listenTrayEvents(handler: (action: TrayAction) => void): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined
  const unlistenSettings = await listen('deskgrid://open-settings', () => handler('open-settings'))
  const unlistenPrivacy = await listen('deskgrid://privacy-lock', () => handler('privacy-lock'))
  return () => {
    unlistenSettings()
    unlistenPrivacy()
  }
}
