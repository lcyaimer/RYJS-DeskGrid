import { emit, listen } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { isTauriRuntime } from './platform'

const STATE_EVENT = 'deskgrid://state-changed'

interface StatePayload {
  source: string
  state: string
}

let currentLabel: string | null = null

function windowLabel(): string {
  if (currentLabel) return currentLabel
  try {
    currentLabel = getCurrentWebviewWindow().label
  } catch {
    currentLabel = 'unknown'
  }
  return currentLabel
}

/** Share the authoritative persisted state with every DeskGrid window. */
export function broadcastState(state: unknown): void {
  if (!isTauriRuntime()) return
  try {
    const payload: StatePayload = {
      source: windowLabel(),
      state: JSON.stringify(state),
    }
    void emit(STATE_EVENT, payload)
  } catch {
    // State sync is an enhancement; local persistence still works without it.
  }
}

export async function listenStateChanges(
  apply: (state: unknown) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined
  return listen<StatePayload>(STATE_EVENT, (event) => {
    if (!event.payload || event.payload.source === windowLabel()) return
    try {
      apply(JSON.parse(event.payload.state) as unknown)
    } catch {
      // Ignore malformed broadcasts and keep the current window usable.
    }
  })
}
