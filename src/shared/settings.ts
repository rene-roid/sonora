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
} from './types'

/** Pure settings merging shared by main's electron-store and the mobile bridge's Preferences. */

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

/** Saved settings from disk, with defaults filled in and stored junk dropped. */
export function mergeSettings(saved: Partial<Settings> | undefined | null): Settings {
  const s = saved ?? {}
  return {
    ...defaultSettings,
    ...s,
    widgets: { ...defaultSettings.widgets, ...(s.widgets ?? {}) },
    widget: sanitizeWidget(s.widget),
    mini: sanitizeMini(s.mini),
    toast: sanitizeToast(s.toast),
    windowBounds: { ...(s.windowBounds ?? {}) },
    // Entries written before the shelf stored an origin have no key and cannot be played.
    recents: (s.recents ?? []).filter((r) => r?.key),
    savedMixes: (s.savedMixes ?? []).filter((m) => m?.id && m.tracks?.length)
  }
}

/** Apply a patch to live settings; nested option groups merge instead of replacing. */
export function patchSettings(before: Settings, patch: SettingsPatch): Settings {
  return {
    ...before,
    ...patch,
    widgets: { ...before.widgets, ...(patch.widgets ?? {}) },
    widget: sanitizeWidget({ ...before.widget, ...(patch.widget ?? {}) }),
    mini: sanitizeMini({ ...before.mini, ...(patch.mini ?? {}) }),
    toast: sanitizeToast({ ...before.toast, ...(patch.toast ?? {}) }),
    windowBounds: { ...before.windowBounds, ...(patch.windowBounds ?? {}) }
  }
}
