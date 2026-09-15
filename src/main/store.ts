import Store from 'electron-store'
import {
  WIDGET_ANCHORS,
  WIDGET_BACKGROUNDS,
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
const WIDGET_BACKGROUND_SET = new Set<string>(WIDGET_BACKGROUNDS.map((b) => b.value))

const clamp = (n: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback

/** Fill in options added after the stored settings were written, and clamp the opacities. */
function sanitizeWidget(saved: Partial<WidgetOptions> | undefined): WidgetOptions {
  const o = { ...defaultWidgetOptions, ...(saved ?? {}) }
  return {
    ...o,
    anchor: WIDGET_ANCHOR_SET.has(o.anchor) ? o.anchor : defaultWidgetOptions.anchor,
    background: WIDGET_BACKGROUND_SET.has(o.background) ? o.background : defaultWidgetOptions.background,
    opacity: clamp(o.opacity, 0.35, 1, 1),
    // Hover dimming may go far lower than the resting floor; that is the whole point of it.
    hoverOpacity: clamp(o.hoverOpacity, 0.05, 1, defaultWidgetOptions.hoverOpacity)
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
