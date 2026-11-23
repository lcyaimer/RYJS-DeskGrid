import { reactive } from 'vue'
import type { SettingsTab } from '../types'
import { isSettingsWindow, isTauriRuntime, openSettingsWindow } from './platform'

interface OverlayState {
  settingsOpen: boolean
  settingsTab: SettingsTab
  categoryEditorOpen: boolean
  editingCategoryId: string | null
  itemEditorOpen: boolean
  itemEditorCategoryId: string
  editingItemId: string | null
  creatorOpen: boolean
  creatorCategoryId: string
  bookmarksOpen: boolean
  bookmarksCategoryId: string
  onboardingOpen: boolean
  privacyUnlockOpen: boolean
}

export const overlayState = reactive<OverlayState>({
  settingsOpen: false,
  settingsTab: 'appearance',
  categoryEditorOpen: false,
  editingCategoryId: null,
  itemEditorOpen: false,
  itemEditorCategoryId: '',
  editingItemId: null,
  creatorOpen: false,
  creatorCategoryId: '',
  bookmarksOpen: false,
  bookmarksCategoryId: '',
  onboardingOpen: false,
  privacyUnlockOpen: false,
})

function closeEditors(): void {
  overlayState.categoryEditorOpen = false
  overlayState.itemEditorOpen = false
  overlayState.creatorOpen = false
  overlayState.bookmarksOpen = false
}

export function openSettings(tab: SettingsTab = 'appearance'): void {
  closeEditors()
  overlayState.onboardingOpen = false
  overlayState.privacyUnlockOpen = false
  overlayState.settingsTab = tab
  if (isTauriRuntime() && !isSettingsWindow()) {
    void openSettingsWindow(tab).catch(() => {
      // If the native window cannot be created, keep the in-app fallback usable.
      overlayState.settingsOpen = true
    })
    return
  }
  overlayState.settingsOpen = true
}

export function closeSettings(): void {
  overlayState.settingsOpen = false
}

export function openCategoryEditor(categoryId: string | null = null): void {
  overlayState.settingsOpen = false
  overlayState.onboardingOpen = false
  overlayState.itemEditorOpen = false
  overlayState.creatorOpen = false
  overlayState.bookmarksOpen = false
  overlayState.editingCategoryId = categoryId
  overlayState.categoryEditorOpen = true
}

export function closeCategoryEditor(): void {
  overlayState.categoryEditorOpen = false
  overlayState.editingCategoryId = null
}

export function openItemEditor(categoryId: string, itemId: string | null = null): void {
  overlayState.settingsOpen = false
  overlayState.onboardingOpen = false
  overlayState.categoryEditorOpen = false
  overlayState.creatorOpen = false
  overlayState.bookmarksOpen = false
  overlayState.itemEditorCategoryId = categoryId
  overlayState.editingItemId = itemId
  overlayState.itemEditorOpen = true
}

export function closeItemEditor(): void {
  overlayState.itemEditorOpen = false
  overlayState.editingItemId = null
}

export function openCreator(categoryId: string): void {
  overlayState.settingsOpen = false
  overlayState.onboardingOpen = false
  overlayState.categoryEditorOpen = false
  overlayState.itemEditorOpen = false
  overlayState.bookmarksOpen = false
  overlayState.creatorCategoryId = categoryId
  overlayState.creatorOpen = true
}

export function closeCreator(): void {
  overlayState.creatorOpen = false
}

export function openBookmarkImporter(categoryId: string): void {
  overlayState.settingsOpen = false
  overlayState.onboardingOpen = false
  overlayState.categoryEditorOpen = false
  overlayState.itemEditorOpen = false
  overlayState.creatorOpen = false
  overlayState.bookmarksCategoryId = categoryId
  overlayState.bookmarksOpen = true
}

export function closeBookmarkImporter(): void {
  overlayState.bookmarksOpen = false
}

export function openOnboarding(): void {
  overlayState.settingsOpen = false
  overlayState.privacyUnlockOpen = false
  closeEditors()
  overlayState.onboardingOpen = true
}

export function closeOnboarding(): void {
  overlayState.onboardingOpen = false
}

export function openPrivacyUnlock(): void {
  overlayState.privacyUnlockOpen = true
}

export function closePrivacyUnlock(): void {
  overlayState.privacyUnlockOpen = false
}

export function closeAllOverlays(): void {
  closeSettings()
  closeCategoryEditor()
  closeItemEditor()
  closeCreator()
  closeBookmarkImporter()
  closeOnboarding()
  closePrivacyUnlock()
}
