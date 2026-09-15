import Store from 'electron-store'
import {
  WIDGET_ANCHORS,
  defaultSettings,
  defaultWidgetOptions,
  type Settings,
  type SettingsPatch,
  type WidgetOptions
} from '@shared/types'

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
    widget: sanitizeWidget(saved.widget),
    windowBounds: { ...(saved.windowBounds ?? {}) },
    // Entries written before the shelf stored an origin have no key and cannot be played.
    recents: (saved.recents ?? []).filter((r) => r?.key)
  }
}

const WIDGET_ANCHOR_SET = new Set<string>(WIDGET_ANCHORS.map((a) => a.value))

/** Fill in options added after the stored settings were written, and clamp the opacity. */
function sanitizeWidget(saved: Partial<WidgetOptions> | undefined): WidgetOptions {
  const o = { ...defaultWidgetOptions, ...(saved ?? {}) }
  const known = WIDGET_ANCHOR_SET.has(o.anchor)
  return {
    ...o,
    anchor: known ? o.anchor : defaultWidgetOptions.anchor,
    opacity: Number.isFinite(o.opacity) ? Math.min(1, Math.max(0.35, o.opacity)) : 1
  }
}

type Listener = (settings: Settings) => void
const listeners = new Set<Listener>()

export function onSettingsChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function updateSettings(patch: SettingsPatch): Settings {
  const next: Settings = {
    ...getSettings(),
    ...patch,
    widgets: { ...getSettings().widgets, ...(patch.widgets ?? {}) },
    widget: sanitizeWidget({ ...getSettings().widget, ...(patch.widget ?? {}) }),
    windowBounds: { ...getSettings().windowBounds, ...(patch.windowBounds ?? {}) }
  }
  store.set('settings', next)
  for (const fn of listeners) fn(next)
  return next
}
