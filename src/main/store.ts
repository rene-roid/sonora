import Store from 'electron-store'
import { defaultSettings, type Settings, type SettingsPatch } from '@shared/types'
import { mergeSettings, patchSettings } from '@shared/settings'

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

export function getSettings(): Settings {
  return (cached ??= mergeSettings(store.get('settings')))
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

type Listener = (settings: Settings) => void
const listeners = new Set<Listener>()

export function onSettingsChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function updateSettings(patch: SettingsPatch): Settings {
  const next = patchSettings(getSettings(), patch)
  cached = next
  scheduleWrite()
  for (const fn of listeners) fn(next)
  return next
}
