import Store from 'electron-store'
import { defaultSettings, type Settings } from '@shared/types'

interface Schema {
  settings: Settings
  /** base64 of safeStorage-encrypted JSON session, or plain JSON when encryption is unavailable */
  credentials?: { encrypted: boolean; data: string }
}

export const store = new Store<Schema>({
  name: 'sonora',
  defaults: { settings: defaultSettings }
})

export function getSettings(): Settings {
  const saved = store.get('settings') ?? {}
  return {
    ...defaultSettings,
    ...saved,
    widgets: { ...defaultSettings.widgets, ...(saved.widgets ?? {}) },
    windowBounds: { ...(saved.windowBounds ?? {}) },
    // Entries written before the shelf stored an origin have no key and cannot be played.
    recents: (saved.recents ?? []).filter((r) => r?.key)
  }
}

type Listener = (settings: Settings) => void
const listeners = new Set<Listener>()

export function onSettingsChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next: Settings = {
    ...getSettings(),
    ...patch,
    widgets: { ...getSettings().widgets, ...(patch.widgets ?? {}) },
    windowBounds: { ...getSettings().windowBounds, ...(patch.windowBounds ?? {}) }
  }
  store.set('settings', next)
  for (const fn of listeners) fn(next)
  return next
}
