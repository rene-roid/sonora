import { describe, expect, test } from 'bun:test'
import { mergeSettings, patchSettings } from '../src/shared/settings'
import { defaultSettings, type Settings } from '../src/shared/types'

describe('mergeSettings', () => {
  test('fills defaults for missing keys and empty input', () => {
    expect(mergeSettings(undefined)).toEqual(defaultSettings)
    expect(mergeSettings({ volume: 0.2 })).toMatchObject({ volume: 0.2, repeat: defaultSettings.repeat })
  })

  test('drops unknown enum values and clamps opacities', () => {
    const s = mergeSettings({
      widget: { ...defaultSettings.widget, anchor: 'nowhere' as never, background: 'neon' as never, opacity: 9 },
      toast: { ...defaultSettings.toast, opacity: Number.NaN }
    })
    expect(s.widget.anchor).toBe(defaultSettings.widget.anchor)
    expect(s.widget.background).toBe(defaultSettings.widget.background)
    expect(s.widget.opacity).toBe(1)
    expect(s.toast.opacity).toBe(defaultSettings.toast.opacity)
  })

  test('drops recents without a key and saved mixes without tracks', () => {
    const s = mergeSettings({
      recents: [{ key: 'k' } as never, {} as never],
      savedMixes: [{ id: 'm', tracks: [] } as never]
    })
    expect(s.recents).toHaveLength(1)
    expect(s.savedMixes).toHaveLength(0)
  })
})

describe('patchSettings', () => {
  test('merges nested groups instead of replacing them', () => {
    const before: Settings = { ...defaultSettings, widgets: { mini: true, taskbar: true, toast: false } }
    const next = patchSettings(before, { widgets: { toast: true } })
    expect(next.widgets).toEqual({ mini: true, taskbar: true, toast: true })
    expect(next.widget).toEqual(before.widget)
  })
})
