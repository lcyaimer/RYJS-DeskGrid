import { isSettingsWindow, isTauriRuntime } from './platform'

/**
 * Transparent margin around the primary display, in CSS pixels. Keeping the
 * WebView's own edges off-screen prevents its compositor fringe from showing
 * through cards that sit near the screen edge. Keep in sync with the Rust
 * window bounds in `src-tauri/src/lib.rs`. The settings window is a normal
 * window and must not be inset.
 */
export const WINDOW_EDGE = isTauriRuntime() && !isSettingsWindow() ? 64 : 0

export function contentWidth(): number {
  return Math.max(1, window.innerWidth - WINDOW_EDGE * 2)
}

export function contentHeight(): number {
  return Math.max(1, window.innerHeight - WINDOW_EDGE * 2)
}
