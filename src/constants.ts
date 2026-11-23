import type { AccentKey, ItemIconKey, ItemKind } from './types'

export const APP_NAME = 'RYJS DeskGrid'
export const APP_VERSION = '0.2.6'
export const STORAGE_KEY = 'ryjs-deskgrid.state.v1'

export const GITHUB_URL = 'https://github.com/lcyaimer/RYJS-DeskGrid'
export const RELEASES_URL = `${GITHUB_URL}/releases`
export const ISSUES_URL = `${GITHUB_URL}/issues`

export interface DownloadChannel {
  name: string
  description: string
  url: string
  code?: string
  kind: 'github' | 'quark' | 'baidu'
}

export const DOWNLOAD_CHANNELS: DownloadChannel[] = [
  {
    name: 'GitHub Releases',
    description: '推荐渠道 · 始终提供最新版本',
    url: RELEASES_URL,
    kind: 'github',
  },
  {
    name: '夸克网盘',
    description: '国内加速下载',
    url: 'https://pan.quark.cn/s/ce32a112e8ad?pwd=hRZG',
    code: 'hRZG',
    kind: 'quark',
  },
  {
    name: '百度网盘',
    description: '备用下载渠道',
    url: 'https://pan.baidu.com/s/1sgmYdf4-mJlKALi9UkUXbw?pwd=4ai5',
    code: '4ai5',
    kind: 'baidu',
  },
]

export interface FeedbackGroup {
  platform: 'douyin' | 'qq'
  label: string
  id: string
}

export const FEEDBACK_GROUPS: FeedbackGroup[] = [
  {
    platform: 'douyin',
    label: '抖音群聊',
    id: '781386634796',
  },
  {
    platform: 'qq',
    label: 'QQ 群',
    id: '531908754',
  },
]

export interface AccentOption {
  label: string
  color: string
  rgb: string
  soft: string
}

export const ACCENTS: Record<AccentKey, AccentOption> = {
  violet: {
    label: '星紫',
    color: '#8b5cf6',
    rgb: '139 92 246',
    soft: 'rgba(139, 92, 246, 0.14)',
  },
  cyan: {
    label: '青屿',
    color: '#06b6d4',
    rgb: '6 182 212',
    soft: 'rgba(6, 182, 212, 0.14)',
  },
  emerald: {
    label: '薄荷',
    color: '#10b981',
    rgb: '16 185 129',
    soft: 'rgba(16, 185, 129, 0.14)',
  },
  amber: {
    label: '琥珀',
    color: '#f59e0b',
    rgb: '245 158 11',
    soft: 'rgba(245, 158, 11, 0.15)',
  },
  rose: {
    label: '珊瑚',
    color: '#f43f5e',
    rgb: '244 63 94',
    soft: 'rgba(244, 63, 94, 0.14)',
  },
  blue: {
    label: '海蓝',
    color: '#3b82f6',
    rgb: '59 130 246',
    soft: 'rgba(59, 130, 246, 0.14)',
  },
  orange: {
    label: '暖橙',
    color: '#f97316',
    rgb: '249 115 22',
    soft: 'rgba(249, 115, 22, 0.14)',
  },
  slate: {
    label: '石墨',
    color: '#64748b',
    rgb: '100 116 139',
    soft: 'rgba(100, 116, 139, 0.15)',
  },
}

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[]

export interface ItemTypeMeta {
  label: string
  description: string
  defaultAccent: AccentKey
  chipClass: string
  dotClass: string
}

export const ITEM_TYPE_META: Record<ItemKind, ItemTypeMeta> = {
  app: {
    label: '软件',
    description: '本机应用程序',
    defaultAccent: 'violet',
    chipClass:
      'bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300',
    dotClass: 'bg-violet-500',
  },
  link: {
    label: '网址',
    description: '网页书签',
    defaultAccent: 'cyan',
    chipClass:
      'bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300',
    dotClass: 'bg-cyan-500',
  },
  folder: {
    label: '文件夹',
    description: '本机目录',
    defaultAccent: 'amber',
    chipClass:
      'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
    dotClass: 'bg-amber-500',
  },
  file: {
    label: '文件',
    description: '本机文件',
    defaultAccent: 'blue',
    chipClass:
      'bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300',
    dotClass: 'bg-blue-500',
  },
}

/** Category icon is derived from its name so that no extra persisted field is needed. */
export const DEFAULT_CATEGORY_OPACITY = 0.78
export const MIN_CATEGORY_OPACITY = 0
export const MAX_CATEGORY_OPACITY = 1
export const CATEGORY_WIDTH = 356
export const DEFAULT_SYSTEM_CARD_OPACITY = 0.72
export const MIN_SYSTEM_CARD_OPACITY = 0.15
export const DEFAULT_GLOBAL_ACCENT: AccentKey = 'violet'

export const ITEM_ICON_KEYS: ItemIconKey[] = [
  'computer',
  'desktop',
  'downloads',
  'documents',
  'pictures',
  'music',
  'videos',
  'home',
  'folder',
  'file',
  'app',
  'image',
  'video',
  'audio',
  'pdf',
  'archive',
  'code',
  'spreadsheet',
  'presentation',
  'link',
]
