import { Preferences } from '@capacitor/preferences'
import type { SonoraApi } from '../preload/index'
import {
  initialPlayerState,
  sanitizeResume,
  type PlayerCommandName,
  type PlayerCommands,
  type PlayerEventName,
  type PlayerEvents,
  type PlayerState,
  type Session,
  type Settings,
  type SettingsPatch
} from '@shared/types'
import { applyPlayerEvent, resumeKey } from '@shared/playerState'
import { mergeSettings, patchSettings } from '@shared/settings'
import { loginSession, reselectServer, sameAccount, withServerList, withServers } from '@shared/auth'
import { SubsonicClient, normalizeServerUrl, probeServers } from '@shared/subsonic/client'
import { AudioEngine } from '@renderer/host/engine'
import { keepAlive } from './keepAlive'

declare const __APP_VERSION__: string

/**
 * The Capacitor build's `window.sonora`. There is no main process and no hidden host window:
 * the audio engine runs in this page, state is mirrored locally and persistence is Preferences.
 * Overlays, caches and window chrome are desktop-only and become no-ops.
 */

type Unsubscribe = () => void
const noop = (): void => undefined
const never = (): Unsubscribe => noop

// ---- persistence -------------------------------------------------------------

const SESSION_KEY = 'session'
const SETTINGS_KEY = 'settings'

async function readJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key })
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

// ---- player -------------------------------------------------------------------

const playerState: PlayerState = { ...initialPlayerState }
const listeners = new Map<PlayerEventName, Set<(payload: never) => void>>()

function on<K extends PlayerEventName>(event: K, cb: (payload: PlayerEvents[K]) => void): Unsubscribe {
  let set = listeners.get(event)
  if (!set) listeners.set(event, (set = new Set()))
  set.add(cb as (payload: never) => void)
  return () => set.delete(cb as (payload: never) => void)
}

export async function installMobileBridge(): Promise<void> {
  // ---- settings: in memory, written to Preferences on a debounce ----------------
  // Disk caches are desktop-only; zero budgets keep Cover off `sonora-art://` and the engine off fetchCached.
  let settings: Settings = { ...mergeSettings(await readJson<Partial<Settings>>(SETTINGS_KEY)), cacheMaxGb: 0, artCacheMaxMb: 0 }
  const settingsListeners = new Set<(s: Settings) => void>()
  let writeTimer: number | undefined
  const flushSettings = (): void => {
    if (writeTimer) window.clearTimeout(writeTimer)
    writeTimer = undefined
    void Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(settings) })
  }
  const updateSettings = (patch: SettingsPatch): Settings => {
    settings = patchSettings(settings, patch)
    writeTimer ??= window.setTimeout(flushSettings, 400)
    for (const fn of settingsListeners) fn(settings)
    return settings
  }

  // ---- session -----------------------------------------------------------------
  // ponytail: SharedPreferences, not encrypted; the token is already md5-derived, never the password.
  // Upgrade path: capacitor-secure-storage-plugin.
  let session: Session | null = await readJson<Session>(SESSION_KEY)
  if (session) session = withServers(session)
  const sessionListeners = new Set<(s: Session | null) => void>()
  const setSession = (next: Session | null): void => {
    session = next ? withServers(next) : null
    void (session ? Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) }) : Preferences.remove({ key: SESSION_KEY }))
    for (const fn of sessionListeners) fn(session)
  }
  /** Persist a new active server and tell everyone, but only when it actually changed. */
  const activate = (server: string): Session | null => {
    if (!session) return null
    if (server !== session.server) setSession({ ...session, server })
    return session
  }
  const reselect = async (): Promise<Session | null> => (session ? activate((await reselectServer(session)).server) : null)

  // ---- engine --------------------------------------------------------------------
  const engine = new AudioEngine((event, payload) => {
    applyPlayerEvent(playerState, event, payload)
    if (event === 'volumeChanged') {
      const p = payload as PlayerEvents['volumeChanged']
      updateSettings({ volume: p.volume, muted: p.muted })
    } else if (event === 'modeChanged') {
      const p = payload as PlayerEvents['modeChanged']
      updateSettings({ repeat: p.repeat, shuffle: p.shuffle })
    } else if (event === 'playStateChanged') {
      const { playing } = payload as PlayerEvents['playStateChanged']
      if (playing) keepAlive.start()
      else keepAlive.stop()
    }
    updateMediaSession(event, payload)
    for (const fn of listeners.get(event) ?? []) fn(payload as never)
  })

  const applySession = (s: Session | null): void => engine.setClient(s ? new SubsonicClient(s) : null)
  engine.recover = async () => {
    const before = session?.server
    const next = await reselect()
    if (!next || next.server === before) return false
    applySession(next)
    return true
  }

  // ---- lockscreen / headset controls ----------------------------------------------
  function updateMediaSession<K extends PlayerEventName>(event: K, payload: PlayerEvents[K]): void {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    if (event === 'trackChanged') {
      const { track } = payload as PlayerEvents['trackChanged']
      const client = session && new SubsonicClient(session)
      const art = track && client?.coverArtUrl(track.coverArt, 512)
      ms.metadata = track
        ? new MediaMetadata({ title: track.title, artist: track.artist, album: track.album, artwork: art ? [{ src: art, sizes: '512x512' }] : [] })
        : null
    } else if (event === 'playStateChanged') {
      ms.playbackState = (payload as PlayerEvents['playStateChanged']).playing ? 'playing' : 'paused'
    } else if (event === 'positionUpdate') {
      const { position, duration } = payload as PlayerEvents['positionUpdate']
      if (Number.isFinite(duration) && duration > 0 && position <= duration) {
        try {
          ms.setPositionState({ duration, position, playbackRate: 1 })
        } catch {
          /* a WebView that lacks setPositionState still shows the controls */
        }
      }
    }
  }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession
    const bind = (action: MediaSessionAction, cmd: PlayerCommandName): void => {
      try {
        ms.setActionHandler(action, () => engine.handle(cmd, undefined as never))
      } catch {
        /* unsupported action on this WebView */
      }
    }
    bind('play', 'play')
    bind('pause', 'pause')
    bind('nexttrack', 'next')
    bind('previoustrack', 'prev')
    bind('stop', 'pause')
    try {
      ms.setActionHandler('seekto', (d) => d.seekTime !== undefined && engine.handle('seek', { position: d.seekTime }))
    } catch {
      /* ditto */
    }
  }

  // ---- resume checkpoint --------------------------------------------------------------
  let lastResume = ''
  const saveResume = (): void => {
    // Before the engine finishes restoring, the queue is still empty and a write would erase the saved one.
    if (!playerState.hostReady) return
    const { queue, index, position } = playerState
    const resume = sanitizeResume({ queue, index, position })
    const key = resumeKey(resume)
    if (key === lastResume) return
    lastResume = key
    updateSettings({ resume })
  }
  window.setInterval(saveResume, 10_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    saveResume()
    flushSettings() // Android may kill a backgrounded app without warning
  })

  // ---- the api ----------------------------------------------------------------------
  const api: SonoraApi = {
    windowName: 'main',
    nativeAcrylic: false,
    mobile: true,

    player: {
      on,
      command<K extends PlayerCommandName>(cmd: K, payload?: PlayerCommands[K]): void {
        engine.handle(cmd, payload as PlayerCommands[K])
      },
      getState: () => Promise.resolve({ ...playerState }),
      wantFrames: (wanted) => engine.setFramesWanted(wanted)
    },

    host: { emit: noop, onCommand: never, onFramesWanted: never },

    auth: {
      getSession: () => Promise.resolve(session),
      async login(input) {
        const next = await loginSession(input)
        // Recents and saved mixes belong to the account that left.
        if (!sameAccount(session, next)) updateSettings({ recents: [], savedMixes: [] })
        setSession(next)
        return next
      },
      logout() {
        setSession(null)
        updateSettings({ recents: [], savedMixes: [], resume: null })
        engine.handle('stop', undefined)
        return Promise.resolve()
      },
      async setServers(urls) {
        if (!session) return null
        const next = withServerList(session, urls)
        if (!next) return session
        setSession(next)
        return (await reselect()) ?? next
      },
      selectServer: (server) => Promise.resolve(activate(normalizeServerUrl(server))),
      reselect,
      probe: () => (session ? probeServers(session, session.servers ?? [session.server]) : Promise.resolve([])),
      onChange(cb) {
        sessionListeners.add(cb)
        return () => sessionListeners.delete(cb)
      }
    },

    settings: {
      get: () => Promise.resolve(settings),
      update: (patch) => Promise.resolve(updateSettings(patch)),
      onChange(cb) {
        settingsListeners.add(cb)
        return () => settingsListeners.delete(cb)
      }
    },

    cache: { want: () => Promise.resolve(null), stats: () => Promise.resolve({ bytes: 0, count: 0 }), clear: () => Promise.resolve() },
    art: { stats: () => Promise.resolve({ bytes: 0, count: 0 }), clear: () => Promise.resolve() },

    window: { minimize: noop, maximize: noop, close: noop, hide: noop, showMain: noop, setIgnoreMouse: noop },
    overlay: { onHover: never, onHitTest: never },
    toast: { onShow: never, shown: noop, leaving: noop, done: noop },

    app: {
      info: () => Promise.resolve({ version: __APP_VERSION__, platform: 'android' }),
      openExternal: (url) => void window.open(url, '_blank')
    }
  }
  window.sonora = api

  // ---- boot (mirrors src/renderer/host/main.ts) ------------------------------------------
  // The client has to exist before restore(), which loads the saved queue paused at its last position.
  applySession(session)
  engine.restore({
    volume: settings.volume,
    muted: settings.muted,
    repeat: settings.repeat,
    shuffle: settings.shuffle,
    normalize: settings.normalize,
    resume: settings.resume
  })
  sessionListeners.add(applySession)
  settingsListeners.add((next) => engine.setNormalize(next.normalize))
  // Emitted through the engine's own callback so the mirror and every subscriber see it.
  applyPlayerEvent(playerState, 'hostReady', { ready: true })
  for (const fn of listeners.get('hostReady') ?? []) fn({ ready: true } as never)
}
