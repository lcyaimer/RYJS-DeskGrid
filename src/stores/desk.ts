import { nextTick, reactive, ref, watch } from 'vue'
import {
  ACCENTS,
  CATEGORY_WIDTH,
  DEFAULT_CATEGORY_OPACITY,
  DEFAULT_GLOBAL_ACCENT,
  DEFAULT_SYSTEM_CARD_OPACITY,
  ITEM_ICON_KEYS,
  ITEM_TYPE_META,
  MAX_CATEGORY_OPACITY,
  MIN_CATEGORY_OPACITY,
  MIN_SYSTEM_CARD_OPACITY,
  STORAGE_KEY,
} from '../constants'
import type {
  AccentKey,
  BookmarkLink,
  DeskCategory,
  DeskItem,
  DeskSettings,
  DroppedPathInfo,
  IconStyle,
  ItemIconKey,
  ItemKind,
  NewItemInput,
  PersistedState,
  SystemPaths,
  ThemeMode,
} from '../types'
import { errorMessage, toast } from '../lib/feedback'
import { contentHeight, contentWidth } from '../lib/layout'
import { getSystemPaths, openTarget } from '../lib/platform'
import { verifyPassword } from '../lib/password'
import { defaultAccentForIcon, inferItemIcon } from '../lib/itemIcons'
import { broadcastState, listenStateChanges } from '../lib/stateSync'
import {
  accentOf,
  basename,
  clamp,
  inferPathKind,
  isRecord,
  joinPath,
  uid,
} from '../lib/utils'

function defaultSystemCardPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 20, y: 20 }
  const width = Math.max(260, Math.min(CATEGORY_WIDTH, contentWidth() - 24))
  return {
    x: Math.max(12, contentWidth() - width - 20),
    y: 20,
  }
}

function defaultSettings(): DeskSettings {
  const systemCard = defaultSystemCardPosition()
  return {
    theme: 'dark',
    iconStyle: 'native',
    autostart: true,
    onboardingDone: false,
    passwordHash: null,
    privacyLocked: false,
    lastCreateDir: '',
    uniformCards: false,
    globalCardOpacity: DEFAULT_CATEGORY_OPACITY,
    globalAccent: DEFAULT_GLOBAL_ACCENT,
    topBarOpacity: DEFAULT_SYSTEM_CARD_OPACITY,
    systemCardX: systemCard.x,
    systemCardY: systemCard.y,
  }
}

export const desk = reactive<PersistedState>({
  version: 1,
  categories: [],
  settings: defaultSettings(),
})

export const isReady = ref(false)

let readyPromise: Promise<void> | null = null
let persistenceStarted = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let suppressPersistence = false
let stateSyncStarted = false
/** True only in the full-screen desktop window, whose viewport defines the layout. */
let desktopViewport = true

export interface InitDeskOptions {
  /** Create starter categories when there is no saved state. */
  seed?: boolean
  /** Clamp positions to this window's viewport (desktop window only). */
  clampToViewport?: boolean
  /** Mirror changes between the desktop and settings windows. */
  sync?: boolean
}

const VALID_KINDS: ItemKind[] = ['app', 'folder', 'file', 'link']
const LINK_ACCENTS: AccentKey[] = ['cyan', 'blue', 'violet', 'emerald', 'amber', 'rose']

function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === 'string' && value in ACCENTS
}

function isItemIconKey(value: unknown): value is ItemIconKey {
  return typeof value === 'string' && ITEM_ICON_KEYS.includes(value as ItemIconKey)
}

function normalizeItem(raw: unknown): DeskItem | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const target = typeof raw.target === 'string' ? raw.target.trim() : ''
  if (!name || !target) return null
  if (typeof raw.kind !== 'string' || !VALID_KINDS.includes(raw.kind as ItemKind)) return null
  const kind = raw.kind as ItemKind
  const icon = isItemIconKey(raw.icon) ? raw.icon : undefined
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('item'),
    name: name.slice(0, 180),
    kind,
    target,
    accent: isAccentKey(raw.accent)
      ? raw.accent
      : icon
        ? defaultAccentForIcon(icon)
        : ITEM_TYPE_META[kind].defaultAccent,
    icon,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : undefined,
  }
}

function normalizeCategory(raw: unknown): DeskCategory | null {
  if (!isRecord(raw)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const items = Array.isArray(raw.items)
    ? raw.items.map(normalizeItem).filter((item): item is DeskItem => item !== null)
    : []
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('cat'),
    name: name.slice(0, 80),
    x: typeof raw.x === 'number' && Number.isFinite(raw.x) ? raw.x : 48,
    y: typeof raw.y === 'number' && Number.isFinite(raw.y) ? raw.y : 104,
    opacity:
      typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)
        ? clamp(raw.opacity, MIN_CATEGORY_OPACITY, MAX_CATEGORY_OPACITY)
        : DEFAULT_CATEGORY_OPACITY,
    accent: isAccentKey(raw.accent) ? raw.accent : 'violet',
    collapsed: Boolean(raw.collapsed),
    privacy: raw.privacy === true,
    items,
  }
}

function normalizeSettings(raw: unknown): DeskSettings {
  const base = defaultSettings()
  if (!isRecord(raw)) return base
  const theme: ThemeMode = raw.theme === 'light' ? 'light' : 'dark'
  const iconStyle: IconStyle = raw.iconStyle === 'letter' ? 'letter' : 'native'
  const passwordHash =
    typeof raw.passwordHash === 'string' && raw.passwordHash ? raw.passwordHash : null
  const systemDefault = defaultSystemCardPosition()
  return {
    theme,
    iconStyle,
    autostart: raw.autostart !== false,
    onboardingDone: raw.onboardingDone === true,
    passwordHash,
    privacyLocked: passwordHash !== null && raw.privacyLocked === true,
    lastCreateDir: typeof raw.lastCreateDir === 'string' ? raw.lastCreateDir : '',
    uniformCards: raw.uniformCards === true,
    globalCardOpacity:
      typeof raw.globalCardOpacity === 'number' && Number.isFinite(raw.globalCardOpacity)
        ? clamp(raw.globalCardOpacity, MIN_CATEGORY_OPACITY, MAX_CATEGORY_OPACITY)
        : DEFAULT_CATEGORY_OPACITY,
    globalAccent: isAccentKey(raw.globalAccent) ? raw.globalAccent : DEFAULT_GLOBAL_ACCENT,
    topBarOpacity:
      typeof raw.topBarOpacity === 'number' && Number.isFinite(raw.topBarOpacity)
        ? clamp(raw.topBarOpacity, MIN_SYSTEM_CARD_OPACITY, 1)
        : DEFAULT_SYSTEM_CARD_OPACITY,
    // Upper bounds are applied by clampAllCategoryPositions() on the desktop
    // window. The settings window must preserve positions even though its own
    // viewport is much smaller.
    systemCardX:
      typeof raw.systemCardX === 'number' && Number.isFinite(raw.systemCardX)
        ? Math.max(12, Math.round(raw.systemCardX))
        : systemDefault.x,
    systemCardY:
      typeof raw.systemCardY === 'number' && Number.isFinite(raw.systemCardY)
        ? Math.max(12, Math.round(raw.systemCardY))
        : systemDefault.y,
  }
}

function uniqueCategoryIds(categories: DeskCategory[]): DeskCategory[] {
  const seen = new Set<string>()
  for (const category of categories) {
    if (seen.has(category.id)) category.id = uid('cat')
    seen.add(category.id)
    const itemIds = new Set<string>()
    for (const item of category.items) {
      if (itemIds.has(item.id)) item.id = uid('item')
      itemIds.add(item.id)
    }
  }
  return categories
}

function normalizePersisted(raw: unknown): PersistedState | null {
  if (!isRecord(raw)) return null
  if (raw.version !== undefined && raw.version !== 1) return null
  if (!Array.isArray(raw.categories)) return null
  const categories = uniqueCategoryIds(
    raw.categories
      .map(normalizeCategory)
      .filter((category): category is DeskCategory => category !== null),
  )
  const settings = normalizeSettings(raw.settings)
  return { version: 1, categories, settings }
}

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizePersisted(JSON.parse(raw))
  } catch {
    return null
  }
}

export function persistNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const snapshot = JSON.stringify(desk)
  try {
    localStorage.setItem(STORAGE_KEY, snapshot)
  } catch {
    // Storage may be unavailable in restricted environments. Keep the app usable.
  }
  try {
    broadcastState(JSON.parse(snapshot) as unknown)
  } catch {
    // Broadcast is best-effort.
  }
}

function schedulePersist(): void {
  if (suppressPersistence) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (!suppressPersistence) persistNow()
  }, 220)
}

function applyAppearance(): void {
  const root = document.documentElement
  root.classList.toggle('dark', desk.settings.theme === 'dark')
  root.classList.toggle('theme-light', desk.settings.theme === 'light')
}

export function categoryWidthForViewport(): number {
  return Math.max(260, Math.min(CATEGORY_WIDTH, contentWidth() - 24))
}

export function clampCategoryPosition(x: number, y: number): { x: number; y: number } {
  const width = categoryWidthForViewport()
  const maxX = Math.max(12, contentWidth() - width - 12)
  const maxY = Math.max(12, contentHeight() - 92)
  return {
    x: clamp(Math.round(x), 12, maxX),
    y: clamp(Math.round(y), 12, maxY),
  }
}

export function clampAllCategoryPositions(): void {
  for (const category of desk.categories) {
    const position = clampCategoryPosition(category.x, category.y)
    category.x = position.x
    category.y = position.y
  }
  const systemPosition = clampCategoryPosition(
    desk.settings.systemCardX,
    desk.settings.systemCardY,
  )
  desk.settings.systemCardX = systemPosition.x
  desk.settings.systemCardY = systemPosition.y
}

function roughCollision(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const width = categoryWidthForViewport()
  return Math.abs(a.x - b.x) < width + 16 && Math.abs(a.y - b.y) < 280
}

function findFreeSpot(): { x: number; y: number } {
  const width = categoryWidthForViewport()
  const padding = Math.max(16, Math.min(48, Math.round(contentWidth() * 0.04)))
  const gap = 16
  const top = 92
  const bottomPadding = 96
  const systemCard = { x: desk.settings.systemCardX, y: desk.settings.systemCardY }
  for (let y = top; y < Math.max(top + 1, contentHeight() - bottomPadding); y += 316) {
    for (let x = padding; x + width <= contentWidth() - padding; x += width + gap) {
      if (
        !desk.categories.some((category) => roughCollision({ x, y }, category)) &&
        !roughCollision({ x, y }, systemCard)
      ) {
        return clampCategoryPosition(x, y)
      }
    }
  }
  const offset = (desk.categories.length % 6) * 28
  return clampCategoryPosition(padding + offset, top + offset)
}

function pathItem(path: string, isDir: boolean, isApp = false): DeskItem {
  const rawName = basename(path) || path
  const kind: ItemKind = isDir ? 'folder' : isApp ? 'app' : inferPathKind(path)
  const displayName =
    kind === 'app'
      ? rawName.replace(/\.(lnk|exe|bat|cmd|com|appref-ms|msi)$/i, '') || rawName
      : rawName
  const icon = inferItemIcon({ kind, target: path, name: displayName })
  return {
    id: uid('item'),
    name: displayName,
    kind,
    target: path,
    accent: defaultAccentForIcon(icon),
    icon,
  }
}

function makeStarterCategories(paths: SystemPaths | null): DeskCategory[] {
  const width = categoryWidthForViewport()
  const pad = Math.max(24, Math.round(contentWidth() * 0.04))
  const firstX = clamp(pad, 16, Math.max(16, contentWidth() - width - 16))
  const rawSecondX = firstX + width + 20
  const stacked = rawSecondX + width > contentWidth() - 16
  const secondX = stacked
    ? firstX
    : clamp(rawSecondX, 16, Math.max(16, contentWidth() - width - 16))
  const secondY = stacked ? 446 : 100

  const dailyItems: DeskItem[] = [
    {
      id: uid('item'),
      name: '此电脑',
      kind: 'folder',
      target: 'shell:MyComputerFolder',
      accent: 'blue',
      icon: 'computer',
    },
  ]
  if (paths?.documents) {
    dailyItems.push({
      id: uid('item'),
      name: '文档',
      kind: 'folder',
      target: paths.documents,
      accent: 'amber',
      icon: 'documents',
    })
  }
  if (paths?.downloads) {
    dailyItems.push({
      id: uid('item'),
      name: '下载',
      kind: 'folder',
      target: paths.downloads,
      accent: 'emerald',
      icon: 'downloads',
    })
  }
  if (paths?.desktop) {
    dailyItems.push({
      id: uid('item'),
      name: '桌面',
      kind: 'folder',
      target: paths.desktop,
      accent: 'violet',
      icon: 'desktop',
    })
  }

  const categories: DeskCategory[] = [
    {
      id: uid('cat'),
      name: '日常入口',
      x: firstX,
      y: 100,
      opacity: DEFAULT_CATEGORY_OPACITY,
      accent: 'amber',
      collapsed: false,
      privacy: false,
      items: dailyItems,
    },
    {
      id: uid('cat'),
      name: '交流反馈',
      x: secondX,
      y: secondY,
      opacity: DEFAULT_CATEGORY_OPACITY,
      accent: 'rose',
      collapsed: false,
      privacy: false,
      items: [
        {
          id: uid('item'),
          name: '抖音主页',
          kind: 'link',
          target:
            'https://www.douyin.com/user/MS4wLjABAAAA_1xV9P0pwFA49xPTpA8sPg8QzHmGnlu5fffeTwVqXYCZMd79irX_3cX2bprIIg84',
          accent: 'rose',
          note: '我的抖音视频主页',
        },
        {
          id: uid('item'),
          name: 'B站主页',
          kind: 'link',
          target: 'https://space.bilibili.com/3747571122047809',
          accent: 'blue',
          note: '我的 B 站主页',
        },
      ],
    },
  ]
  return categories
}

const LEGACY_CHAT_CATEGORY_NAME = '开发收藏'
const CHAT_CATEGORY_NAME = '交流反馈'
const LEGACY_CHAT_LINK_MARKERS = [
  'douyin.com/user/MS4wLjABAAAA_1xV9P0pwFA49xPTpA8sPg8QzHmGnlu5fffeTwVqXYCZMd79irX_3cX2bprIIg84',
  'space.bilibili.com/3747571122047809',
]

/** Rename only the starter category that still carries the original author links. */
function migrateLegacyChatCategory(categories: DeskCategory[]): void {
  for (const category of categories) {
    if (category.name !== LEGACY_CHAT_CATEGORY_NAME) continue
    const isLegacyChat = category.items.some(
      (item) =>
        item.kind === 'link' &&
        LEGACY_CHAT_LINK_MARKERS.some((marker) => item.target.includes(marker)),
    )
    if (isLegacyChat) category.name = CHAT_CATEGORY_NAME
  }
}

function applyRemoteState(raw: unknown): void {
  const normalized = normalizePersisted(raw)
  if (!normalized) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  suppressPersistence = true
  desk.categories.splice(0, desk.categories.length, ...normalized.categories)
  Object.assign(desk.settings, normalized.settings)
  reconcilePrivacyLock()
  if (desktopViewport) clampAllCategoryPositions()
  applyAppearance()
  void nextTick(() => {
    suppressPersistence = false
  })
}

export function initDesk(options: InitDeskOptions = {}): Promise<void> {
  if (readyPromise) return readyPromise
  const seed = options.seed !== false
  const clampToViewport = options.clampToViewport !== false
  const sync = options.sync !== false
  desktopViewport = clampToViewport
  readyPromise = (async () => {
    const saved = loadPersisted()
    if (saved) {
      desk.categories.splice(0, desk.categories.length, ...saved.categories)
      Object.assign(desk.settings, saved.settings)
      migrateLegacyChatCategory(desk.categories)
    } else if (seed) {
      let paths: SystemPaths | null = null
      try {
        paths = await getSystemPaths()
      } catch {
        paths = null
      }
      desk.categories.splice(0, desk.categories.length, ...makeStarterCategories(paths))
    }

    if (clampToViewport) clampAllCategoryPositions()
    applyAppearance()
    reconcilePrivacyLock()
    if (!persistenceStarted) {
      persistenceStarted = true
      watch(
        desk,
        () => {
          if (!suppressPersistence) schedulePersist()
        },
        { deep: true },
      )
      watch(() => desk.settings.theme, applyAppearance)
    }
    if (sync && !stateSyncStarted) {
      stateSyncStarted = true
      void listenStateChanges(applyRemoteState)
    }
    isReady.value = true
    if (seed) persistNow()
  })()
  return readyPromise
}

export function updateSettings(patch: Partial<DeskSettings>): void {
  Object.assign(desk.settings, patch)
  if (!desk.settings.passwordHash) desk.settings.privacyLocked = false
}

export function setPasswordHash(passwordHash: string | null): void {
  desk.settings.passwordHash = passwordHash
  if (!passwordHash) desk.settings.privacyLocked = false
}

export async function verifyStoredPassword(password: string): Promise<boolean> {
  if (!desk.settings.passwordHash) return false
  return verifyPassword(password, desk.settings.passwordHash)
}

export function hasPrivateCategories(): boolean {
  return desk.categories.some((category) => category.privacy)
}

export function lockPrivateCategories(): boolean {
  if (!desk.settings.passwordHash || !hasPrivateCategories()) return false
  desk.settings.privacyLocked = true
  persistNow()
  return true
}

export function unlockPrivateCategories(): void {
  desk.settings.privacyLocked = false
  persistNow()
}

function reconcilePrivacyLock(): void {
  if (!desk.settings.passwordHash || !hasPrivateCategories()) {
    desk.settings.privacyLocked = false
  }
}

export function effectiveCategoryOpacity(category: DeskCategory): number {
  return desk.settings.uniformCards ? desk.settings.globalCardOpacity : category.opacity
}

export function effectiveCategoryAccent(category: DeskCategory): AccentKey {
  return desk.settings.uniformCards ? desk.settings.globalAccent : category.accent
}

/** The system card follows the unified appearance opacity when it is enabled. */
export function effectiveSystemCardOpacity(): number {
  const value = desk.settings.uniformCards
    ? desk.settings.globalCardOpacity
    : desk.settings.topBarOpacity
  return clamp(value, 0, 1)
}

export function addCategory(input: {
  name: string
  accent: AccentKey
  opacity?: number
  privacy?: boolean
}): string {
  const spot = findFreeSpot()
  const category: DeskCategory = {
    id: uid('cat'),
    name: input.name.trim() || '未命名分类',
    x: spot.x,
    y: spot.y,
    opacity: clamp(
      input.opacity ?? DEFAULT_CATEGORY_OPACITY,
      MIN_CATEGORY_OPACITY,
      MAX_CATEGORY_OPACITY,
    ),
    accent: accentOf(input.accent),
    collapsed: false,
    privacy: input.privacy === true,
    items: [],
  }
  desk.categories.push(category)
  return category.id
}

export function updateCategory(
  categoryId: string,
  patch: Partial<
    Pick<DeskCategory, 'name' | 'accent' | 'opacity' | 'collapsed' | 'privacy' | 'x' | 'y'>
  >,
): void {
  const category = desk.categories.find((entry) => entry.id === categoryId)
  if (!category) return
  if (patch.name !== undefined) category.name = patch.name.trim() || category.name
  if (patch.accent !== undefined) category.accent = accentOf(patch.accent)
  if (patch.opacity !== undefined) {
    category.opacity = clamp(patch.opacity, MIN_CATEGORY_OPACITY, MAX_CATEGORY_OPACITY)
  }
  if (patch.collapsed !== undefined) category.collapsed = patch.collapsed
  if (patch.privacy !== undefined) category.privacy = patch.privacy
  if (patch.x !== undefined || patch.y !== undefined) {
    const position = clampCategoryPosition(patch.x ?? category.x, patch.y ?? category.y)
    category.x = position.x
    category.y = position.y
  }
  reconcilePrivacyLock()
}

export function moveCategory(categoryId: string, x: number, y: number): void {
  updateCategory(categoryId, { x, y })
}

export function focusCategory(categoryId: string): void {
  const index = desk.categories.findIndex((entry) => entry.id === categoryId)
  if (index < 0 || index === desk.categories.length - 1) return
  const [category] = desk.categories.splice(index, 1)
  desk.categories.push(category)
}

export function deleteCategory(categoryId: string): void {
  const index = desk.categories.findIndex((entry) => entry.id === categoryId)
  if (index >= 0) desk.categories.splice(index, 1)
  reconcilePrivacyLock()
}

export function addItem(categoryId: string, input: NewItemInput): string | null {
  const category = desk.categories.find((entry) => entry.id === categoryId)
  if (!category) return null
  const icon = input.icon
  const inferred = inferItemIcon({
    kind: input.kind,
    target: input.target,
    name: input.name,
  })
  const item: DeskItem = {
    id: uid('item'),
    name: input.name.trim() || '未命名',
    kind: input.kind,
    target: input.target.trim(),
    accent: accentOf(input.accent ?? defaultAccentForIcon(icon ?? inferred)),
    icon,
    note: input.note?.trim() || undefined,
  }
  if (!item.target) return null
  category.items.push(item)
  return item.id
}

export function updateItem(
  categoryId: string,
  itemId: string,
  patch: Partial<Pick<DeskItem, 'name' | 'target' | 'accent' | 'note' | 'kind' | 'icon'>>,
): void {
  const category = desk.categories.find((entry) => entry.id === categoryId)
  const item = category?.items.find((entry) => entry.id === itemId)
  if (!item) return
  if (patch.name !== undefined) item.name = patch.name.trim() || item.name
  if (patch.target !== undefined) item.target = patch.target.trim() || item.target
  if (patch.accent !== undefined) item.accent = accentOf(patch.accent)
  if (patch.note !== undefined) item.note = patch.note.trim() || undefined
  if (patch.kind !== undefined) item.kind = patch.kind
  if (patch.icon !== undefined) item.icon = patch.icon
}

export function deleteItem(categoryId: string, itemId: string): void {
  const category = desk.categories.find((entry) => entry.id === categoryId)
  if (!category) return
  const index = category.items.findIndex((entry) => entry.id === itemId)
  if (index >= 0) category.items.splice(index, 1)
}

export function addLocalPaths(categoryId: string, paths: string[]): number {
  const category = desk.categories.find((entry) => entry.id === categoryId)
  if (!category) return 0
  let added = 0
  for (const path of paths) {
    if (!path.trim()) continue
    category.items.push(pathItem(path, false))
    added += 1
  }
  return added
}

export function addFolderPath(categoryId: string, path: string): boolean {
  const category = desk.categories.find((entry) => entry.id === categoryId)
  if (!category || !path.trim()) return false
  category.items.push(pathItem(path, true))
  return true
}

/** Add files, folders, apps and .url shortcuts dropped from Windows Explorer. */
export function addDroppedItems(
  categoryId: string,
  entries: DroppedPathInfo[],
): { added: number; skipped: number } {
  const category = desk.categories.find((entry) => entry.id === categoryId)
  if (!category) return { added: 0, skipped: entries.length }
  const existing = new Set(category.items.map((item) => item.target))
  let added = 0
  let skipped = 0

  for (const entry of entries) {
    if (entry.url && /^https?:\/\//i.test(entry.url)) {
      if (existing.has(entry.url)) {
        skipped += 1
        continue
      }
      existing.add(entry.url)
      const name = entry.name.replace(/\.url$/i, '').trim() || entry.url
      category.items.push({
        id: uid('item'),
        name,
        kind: 'link',
        target: entry.url,
        accent: bookmarkAccent(entry.url),
        note: '拖拽添加',
      })
      added += 1
      continue
    }
    if (!entry.path.trim()) {
      skipped += 1
      continue
    }
    if (existing.has(entry.path)) {
      skipped += 1
      continue
    }
    existing.add(entry.path)
    category.items.push(pathItem(entry.path, entry.isDir, entry.isApp))
    added += 1
  }

  return { added, skipped }
}

function bookmarkAccent(url: string): AccentKey {
  let hash = 0
  for (let i = 0; i < url.length; i += 1) hash = (hash * 31 + url.charCodeAt(i)) >>> 0
  return LINK_ACCENTS[hash % LINK_ACCENTS.length]
}

export function addBookmarks(categoryId: string, links: BookmarkLink[]): number {
  const category = desk.categories.find((entry) => entry.id === categoryId)
  if (!category) return 0
  const existingUrls = new Set(
    category.items.filter((entry) => entry.kind === 'link').map((entry) => entry.target),
  )
  let added = 0
  for (const link of links) {
    if (!/^https?:\/\//i.test(link.url) || !link.title.trim()) continue
    if (existingUrls.has(link.url)) continue
    existingUrls.add(link.url)
    category.items.push({
      id: uid('item'),
      name: link.title.trim().slice(0, 160),
      kind: 'link',
      target: link.url,
      accent: bookmarkAccent(link.url),
      note: link.folder || undefined,
    })
    added += 1
  }
  return added
}

export function addLinkItem(
  categoryId: string,
  name: string,
  url: string,
  accent: AccentKey,
  note?: string,
): string | null {
  return addItem(categoryId, { name, kind: 'link', target: url, accent, note })
}

export async function launchItem(item: DeskItem): Promise<void> {
  try {
    await openTarget(item.target)
  } catch (error) {
    toast.error(`无法打开「${item.name}」：${errorMessage(error)}`)
  }
}

export function createFilePath(parent: string, name: string): string {
  return joinPath(parent, name)
}

export function completeOnboarding(): void {
  desk.settings.onboardingDone = true
}

export interface ExportSnapshot {
  app: string
  exportedAt: string
  version: 1
  categories: DeskCategory[]
  settings: Omit<DeskSettings, 'passwordHash' | 'privacyLocked'>
}

export function buildExportSnapshot(): ExportSnapshot {
  return {
    app: 'RYJS DeskGrid',
    exportedAt: new Date().toISOString(),
    version: 1,
    categories: JSON.parse(JSON.stringify(desk.categories)) as DeskCategory[],
    settings: {
      theme: desk.settings.theme,
      iconStyle: desk.settings.iconStyle,
      autostart: desk.settings.autostart,
      onboardingDone: desk.settings.onboardingDone,
      lastCreateDir: desk.settings.lastCreateDir,
      uniformCards: desk.settings.uniformCards,
      globalCardOpacity: desk.settings.globalCardOpacity,
      globalAccent: desk.settings.globalAccent,
      topBarOpacity: desk.settings.topBarOpacity,
      systemCardX: desk.settings.systemCardX,
      systemCardY: desk.settings.systemCardY,
    },
  }
}

export function importSnapshot(raw: unknown): { categories: number; items: number } {
  const normalized = normalizePersisted(raw)
  if (!normalized) throw new Error('配置文件格式不正确或版本不受支持')
  if (normalized.categories.length === 0) throw new Error('配置文件中没有可导入的分类')
  const previousPasswordHash = desk.settings.passwordHash
  desk.categories.splice(0, desk.categories.length, ...normalized.categories)
  Object.assign(desk.settings, normalized.settings, {
    passwordHash: previousPasswordHash,
    privacyLocked: false,
  })
  if (desktopViewport) clampAllCategoryPositions()
  applyAppearance()
  persistNow()
  return {
    categories: normalized.categories.length,
    items: normalized.categories.reduce((total, category) => total + category.items.length, 0),
  }
}

export async function resetAllData(): Promise<void> {
  let paths: SystemPaths | null = null
  try {
    paths = await getSystemPaths()
  } catch {
    paths = null
  }
  desk.categories.splice(0, desk.categories.length, ...makeStarterCategories(paths))
  Object.assign(desk.settings, defaultSettings())
  if (desktopViewport) clampAllCategoryPositions()
  applyAppearance()
  persistNow()
}
