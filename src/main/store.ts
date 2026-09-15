import Store from 'electron-store'
import {
  OVERLAY_ANCHORS,
  OVERLAY_BACKGROUNDS,
  defaultMiniOptions,
  defaultSettings,
  defaultToastOptions,
  defaultWidgetOptions,
  type MiniOptions,
  type OverlayChrome,
  type Settings,
  type SettingsPatch,
  type ToastOptions,
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
    mini: sanitizeMini(saved.mini),
    toast: sanitizeToast(saved.toast),
    windowBounds: { ...(saved.windowBounds ?? {}) },
    // Entries written before the shelf stored an origin have no key and cannot be played.
    recents: (saved.recents ?? []).filter((r) => r?.key)
  }
}

const ANCHOR_SET = new Set<string>(OVERLAY_ANCHORS.map((a) => a.value))
const BACKGROUND_SET = new Set<string>(OVERLAY_BACKGROUNDS.map((b) => b.value))

const clamp = (n: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback

/**
 * The look shared by every overlay: fill in options added after the stored settings were
 * written, drop unknown enum values and clamp the opacities. Hover dimming may go far lower
 * than the resting floor; that is the whole point of it.
 */
function sanitizeChrome<T extends OverlayChrome>(saved: Partial<T> | undefined, defaults: T): T {
  const o = { ...defaults, ...(saved ?? {}) }
  return {
    ...o,
    background: BACKGROUND_SET.has(o.background) ? o.background : defaults.background,
    opacity: clamp(o.opacity, 0.35, 1, defaults.opacity),
    hoverOpacity: clamp(o.hoverOpacity, 0.05, 1, defaults.hoverOpacity)
  }
}

function sanitizeWidget(saved: Partial<WidgetOptions> | undefined): WidgetOptions {
  const o = sanitizeChrome(saved, defaultWidgetOptions)
  return { ...o, anchor: ANCHOR_SET.has(o.anchor) ? o.anchor : defaultWidgetOptions.anchor }
}

function sanitizeMini(saved: Partial<MiniOptions> | undefined): MiniOptions {
  return sanitizeChrome(saved, defaultMiniOptions)
}

function sanitizeToast(saved: Partial<ToastOptions> | undefined): ToastOptions {
  const o = { ...defaultToastOptions, ...(saved ?? {}) }
  return {
    anchor: ANCHOR_SET.has(o.anchor) ? o.anchor : defaultToastOptions.anchor,
    background: BACKGROUND_SET.has(o.background) ? o.background : defaultToastOptions.background,
    opacity: clamp(o.opacity, 0.35, 1, defaultToastOptions.opacity)
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
    mini: sanitizeMini({ ...getSettings().mini, ...(patch.mini ?? {}) }),
    toast: sanitizeToast({ ...getSettings().toast, ...(patch.toast ?? {}) }),
    windowBounds: { ...getSettings().windowBounds, ...(patch.windowBounds ?? {}) }
  }
  store.set('settings', next)
  for (const fn of listeners) fn(next)
  return next
}
