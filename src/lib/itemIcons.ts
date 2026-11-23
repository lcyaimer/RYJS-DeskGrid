import type { AccentKey, DeskItem, ItemIconKey } from '../types'
import { basename } from './utils'

type ItemIconSource = Pick<DeskItem, 'kind' | 'target' | 'name' | 'icon'>

const SHELL_ICONS: Record<string, ItemIconKey> = {
  'shell:MyComputerFolder': 'computer',
  'shell:Downloads': 'downloads',
  'shell:Documents': 'documents',
  'shell:Desktop': 'desktop',
  'shell:Pictures': 'pictures',
  'shell:Music': 'music',
  'shell:Videos': 'videos',
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv', 'm4v'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'])
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'])
const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'vue',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'json',
  'py',
  'rs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'cs',
  'php',
  'sh',
  'yaml',
  'yml',
  'toml',
])
const SPREADSHEET_EXTENSIONS = new Set(['xls', 'xlsx', 'csv', 'numbers'])
const PRESENTATION_EXTENSIONS = new Set(['ppt', 'pptx', 'key'])
const DOCUMENT_EXTENSIONS = new Set(['doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages'])

const FOLDER_NAME_RULES: Array<[RegExp, ItemIconKey]> = [
  [/^(downloads?|下载)$/i, 'downloads'],
  [/^(my\s*documents?|documents?|文档)$/i, 'documents'],
  [/^(desktop|桌面)$/i, 'desktop'],
  [/^(pictures|photos|图片|照片)$/i, 'pictures'],
  [/^(music|音乐)$/i, 'music'],
  [/^(videos|movies|视频|影片)$/i, 'videos'],
  [/^(home|主目录|个人文件夹)$/i, 'home'],
]

function extensionOf(pathOrName: string): string {
  const name = basename(pathOrName)
  const dot = name.lastIndexOf('.')
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : ''
}

function inferFolderIcon(item: ItemIconSource): ItemIconKey {
  const shell = SHELL_ICONS[item.target]
  if (shell) return shell

  const candidates = [item.name, basename(item.target)].filter(Boolean)
  for (const candidate of candidates) {
    for (const [pattern, icon] of FOLDER_NAME_RULES) {
      if (pattern.test(candidate.trim())) return icon
    }
  }
  return 'folder'
}

function inferFileIcon(target: string): ItemIconKey {
  const extension = extensionOf(target)
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (extension === 'pdf') return 'pdf'
  if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive'
  if (CODE_EXTENSIONS.has(extension)) return 'code'
  if (SPREADSHEET_EXTENSIONS.has(extension)) return 'spreadsheet'
  if (PRESENTATION_EXTENSIONS.has(extension)) return 'presentation'
  if (DOCUMENT_EXTENSIONS.has(extension)) return 'file'
  return 'file'
}

export function inferItemIcon(item: ItemIconSource): ItemIconKey {
  if (item.icon) return item.icon
  if (item.kind === 'link') return 'link'
  if (item.kind === 'app') return 'app'
  if (item.kind === 'folder') return inferFolderIcon(item)
  return inferFileIcon(item.target)
}

const ICON_ACCENTS: Record<ItemIconKey, AccentKey> = {
  computer: 'blue',
  desktop: 'violet',
  downloads: 'emerald',
  documents: 'amber',
  pictures: 'rose',
  music: 'rose',
  videos: 'orange',
  home: 'cyan',
  folder: 'amber',
  file: 'blue',
  app: 'violet',
  image: 'rose',
  video: 'orange',
  audio: 'rose',
  pdf: 'rose',
  archive: 'orange',
  code: 'cyan',
  spreadsheet: 'emerald',
  presentation: 'orange',
  link: 'cyan',
}

export function defaultAccentForIcon(icon: ItemIconKey): AccentKey {
  return ICON_ACCENTS[icon] ?? 'violet'
}

export function defaultAccentForPath(path: string, isDir: boolean, isApp: boolean): AccentKey {
  const icon = isApp ? 'app' : isDir ? inferFolderIcon({ kind: 'folder', target: path, name: '' }) : inferFileIcon(path)
  return defaultAccentForIcon(icon)
}
