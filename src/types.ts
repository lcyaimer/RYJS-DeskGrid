export type ItemKind = 'app' | 'folder' | 'file' | 'link'

export type ItemIconKey =
  | 'computer'
  | 'desktop'
  | 'downloads'
  | 'documents'
  | 'pictures'
  | 'music'
  | 'videos'
  | 'home'
  | 'folder'
  | 'file'
  | 'app'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'archive'
  | 'code'
  | 'spreadsheet'
  | 'presentation'
  | 'link'

export type ThemeMode = 'dark' | 'light'

/** How app shortcuts and website bookmarks render their tile glyph. */
export type IconStyle = 'native' | 'letter'

export type AccentKey =
  | 'violet'
  | 'cyan'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'blue'
  | 'orange'
  | 'slate'

export interface DeskItem {
  id: string
  name: string
  kind: ItemKind
  /** Absolute local path, an allow-listed shell: target, or a http(s) URL for link. */
  target: string
  accent: AccentKey
  icon?: ItemIconKey
  note?: string
}

export interface DeskCategory {
  id: string
  name: string
  /** Absolute position in CSS pixels within the full-screen desktop canvas. */
  x: number
  y: number
  /** Surface opacity, 0 – 1. */
  opacity: number
  accent: AccentKey
  collapsed: boolean
  /** Private categories disappear while the privacy lock is active. */
  privacy: boolean
  items: DeskItem[]
}

export interface DeskSettings {
  theme: ThemeMode
  /** Native app/site icons by default; `letter` renders a unified text initial. */
  iconStyle: IconStyle
  /** Launch automatically after Windows sign-in. On by default. */
  autostart: boolean
  onboardingDone: boolean
  /** PBKDF2 hash. The password itself is never stored. */
  passwordHash: string | null
  /** Whether privacy-enabled categories are currently concealed. */
  privacyLocked: boolean
  lastCreateDir: string
  /** Global overrides take precedence over individual category appearance. */
  uniformCards: boolean
  globalCardOpacity: number
  globalAccent: AccentKey
  /** Background opacity of the system card. Kept under the legacy key name. */
  topBarOpacity: number
  /** Position of the floating system card. */
  systemCardX: number
  systemCardY: number
}

export interface PersistedState {
  version: 1
  categories: DeskCategory[]
  settings: DeskSettings
}

export interface SystemPaths {
  home: string
  desktop: string
  documents: string
  downloads: string
}

export interface BookmarkLink {
  title: string
  url: string
  folder: string
}

export interface BookmarkSource {
  browser: string
  profile: string
  path: string
  count: number
}

export interface DroppedPathInfo {
  path: string
  name: string
  isDir: boolean
  isApp: boolean
  /** Populated for Internet Shortcut (.url) files. */
  url?: string
}

export interface NewItemInput {
  name: string
  kind: ItemKind
  target: string
  accent?: AccentKey
  icon?: ItemIconKey
  note?: string
}

export interface WindowRect {
  x: number
  y: number
  width: number
  height: number
  radius?: number
}

export type SettingsTab = 'appearance' | 'security' | 'data' | 'about'

export interface MenuAnchor {
  left: number
  top: number
  right: number
  bottom: number
}
