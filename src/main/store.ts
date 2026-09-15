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

/**
 * The live settings, held in memory.
 *
 * Every read off `store` is a synchronous read of the whole config file and every write is a
 * synchronous rewrite of it, and the file carries the resume queue, so it is not small. The
 * callers are hot -- the cursor watch behind the overlays asks ten times a second per window,
 * and a volume drag writes on every mouse move -- so the file is read once and the disk is
 * written on a debounce behind it. Nothing outside this process touches the file: the
 * single-instance lock sees to that.
 */
let cached: Settings | undefined

function readSettings(): Settings {
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

export function getSettings(): Settings {
  return (cached ??= readSettings())
}

/**
 * How long a change may sit in memory before it reaches the disk. Well under the ten-second
 * resume checkpoint, so a crash loses no more than it already would.
 */
const WRITE_DEBOUNCE_MS = 400

let writeTimer: NodeJS.Timeout | undefined

/** Write the settings out now. Called on the debounce, and on the way out so nothing is lost. */
export function flushSettings(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = undefined
  }
  if (cached) store.set('settings', cached)
}

function scheduleWrite(): void {
  if (writeTimer) return
  writeTimer = setTimeout(() => {
    writeTimer = undefined
    if (cached) store.set('settings', cached)
  }, WRITE_DEBOUNCE_MS)
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
  const before = getSettings()
  const next: Settings = {
    ...before,
    ...patch,
    widgets: { ...before.widgets, ...(patch.widgets ?? {}) },
    widget: sanitizeWidget({ ...before.widget, ...(patch.widget ?? {}) }),
    mini: sanitizeMini({ ...before.mini, ...(patch.mini ?? {}) }),
    toast: sanitizeToast({ ...before.toast, ...(patch.toast ?? {}) }),
    windowBounds: { ...before.windowBounds, ...(patch.windowBounds ?? {}) }
  }
  cached = next
  scheduleWrite()
  for (const fn of listeners) fn(next)
  return next
}
