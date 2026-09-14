/**
 * Shared contract between the main process, the audio host and every display window.
 * Every visible window is a pure subscriber of PlayerEvents and only ever sends PlayerCommands.
 */

export interface Track {
  id: string
  title: string
  artist: string
  artistId?: string
  album: string
  albumId?: string
  duration: number
  track?: number
  disc?: number
  year?: number
  genre?: string
  coverArt?: string
  starred?: boolean
  bitRate?: number
  suffix?: string
  /** ReplayGain tags from the server, used by the volume-normalisation setting. */
  gain?: { track?: number; album?: number; trackPeak?: number; albumPeak?: number; fallback?: number }
}

export type NormalizeMode = 'off' | 'track' | 'album'

/**
 * Linear gain factor for a track under `mode`, clamped so peak * gain never clips.
 * Album mode keeps a record's internal loudness shape and only levels between albums.
 */
export function replayGainFactor(gain: Track['gain'], mode: NormalizeMode): number {
  if (mode === 'off') return 1
  const album = mode === 'album'
  // Album mode falls back to the track value: a single loose track has no album gain.
  const dB = (album ? gain?.album ?? gain?.track : gain?.track) ?? gain?.fallback
  if (dB === undefined || !Number.isFinite(dB)) return 1
  const peak = (album ? gain?.albumPeak ?? gain?.trackPeak : gain?.trackPeak) ?? 0
  const factor = 10 ** (dB / 20)
  // No peak means no headroom budget, so a boost could clip: only attenuation is safe.
  return peak > 0 ? Math.min(factor, 1 / peak) : Math.min(factor, 1)
}

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerState {
  hostReady: boolean
  track: Track | null
  index: number
  queue: Track[]
  playing: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
}

export const initialPlayerState: PlayerState = {
  hostReady: false,
  track: null,
  index: -1,
  queue: [],
  playing: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false
}

/** Events emitted by the audio host and relayed by main to every window. */
export interface PlayerEvents {
  hostReady: { ready: boolean }
  trackChanged: { track: Track | null; index: number }
  playStateChanged: { playing: boolean }
  positionUpdate: { position: number; duration: number }
  queueChanged: { queue: Track[]; index: number }
  volumeChanged: { volume: number; muted: boolean }
  modeChanged: { repeat: RepeatMode; shuffle: boolean }
  /** ~30fps frequency bins (0..255) and an overall level (0..1). */
  audioFrame: { bins: Uint8Array; level: number }
  error: { message: string }
}
export type PlayerEventName = keyof PlayerEvents

/** Commands any window may send; main forwards them to the audio host. */
export interface PlayerCommands {
  play: undefined
  pause: undefined
  toggle: undefined
  next: undefined
  prev: undefined
  stop: undefined
  seek: { position: number }
  setVolume: { volume: number }
  setMuted: { muted: boolean }
  setQueue: { tracks: Track[]; index?: number; autoplay?: boolean }
  addToQueue: { tracks: Track[]; next?: boolean }
  playAt: { index: number }
  removeFromQueue: { index: number }
  clearQueue: undefined
  setRepeat: { repeat: RepeatMode }
  setShuffle: { shuffle: boolean }
}
export type PlayerCommandName = keyof PlayerCommands

export interface Session {
  /** The candidate currently in use; always a member of `servers`. */
  server: string
  /** Every URL that points at this same library (LAN, VPN, public). Fastest reachable one wins. */
  servers?: string[]
  username: string
  /** md5(password + salt). The raw password is never persisted. */
  token: string
  salt: string
}

export interface ResumeState {
  queue: Track[]
  index: number
  position: number
}

/** Clamp a persisted resume snapshot back into a usable range; null when there is nothing to resume. */
export function sanitizeResume(r: ResumeState | null | undefined): ResumeState | null {
  if (!r?.queue?.length) return null
  const index = Math.min(Math.max(Math.trunc(r.index) || 0, 0), r.queue.length - 1)
  const position = Number.isFinite(r.position) ? Math.max(0, r.position) : 0
  return { queue: r.queue, index, position }
}

/** Every navigable page of the main window. Lives here because `recents` persists it. */
export type View =
  | { name: 'home' }
  | { name: 'albums' }
  | { name: 'soundtracks' }
  | { name: 'artists' }
  | { name: 'genres' }
  | { name: 'genre'; value: string }
  | { name: 'moods' }
  | { name: 'mood'; value: string }
  | { name: 'mix'; value: string }
  | { name: 'artist'; id: string }
  /** `discIds` are sibling albums holding the other discs of the same release, in disc order. */
  | { name: 'album'; id: string; discIds?: string[] }
  | { name: 'playlist'; id: string }
  | { name: 'search'; query: string }
  | { name: 'favorites' }
  | { name: 'settings' }

/** Identity of a view, for deduping the shelf. */
export function viewKey(v: View): string {
  return 'id' in v ? `${v.name}:${v.id}` : 'value' in v ? `${v.name}:${v.value}` : v.name
}

/**
 * A tile on Home's "jump back in" shelf: the album, artist, playlist, genre or mix the user
 * started a play from, or the song itself when it was played on its own.
 */
export interface RecentItem {
  /** `viewKey(view)`, or `track:<id>` for a lone song. */
  key: string
  title: string
  subtitle?: string
  coverArt?: string
  /** The place played from. Absent for a lone song, which `track` holds instead. */
  view?: View
  track?: Track
}

const RECENTS_LIMIT = 7

/** Shelf entries, newest first, deduped and capped. Returns `items` untouched when nothing changed. */
export function pushRecent(items: RecentItem[], item: RecentItem | null | undefined): RecentItem[] {
  if (!item || items[0]?.key === item.key) return items
  return [item, ...items.filter((i) => i.key !== item.key)].slice(0, RECENTS_LIMIT)
}

export type WindowName = 'main' | 'host' | 'toast' | 'mini' | 'widget'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Settings {
  widgets: { mini: boolean; taskbar: boolean; toast: boolean }
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
  closeToTray: boolean
  autoLaunch: boolean
  mediaKeys: boolean
  /** Level playback across tracks using the server's ReplayGain tags. */
  normalize: NormalizeMode
  toastDurationMs: number
  windowBounds: Partial<Record<WindowName, Rect>>
  /** Queue and playback position saved on quit so the next launch picks up where it left off. */
  resume: ResumeState | null
  /** Where the user played from recently, newest first; Home's shelf. Cleared when the account changes. */
  recents: RecentItem[]
}

export const defaultSettings: Settings = {
  widgets: { mini: false, taskbar: true, toast: true },
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false,
  closeToTray: true,
  autoLaunch: false,
  mediaKeys: true,
  normalize: 'album',
  toastDurationMs: 3500,
  windowBounds: {},
  resume: null,
  recents: []
}

export interface LyricLine {
  /** seconds */
  time: number
  text: string
}

export interface Lyrics {
  synced: boolean
  lines: LyricLine[]
  lang?: string
  displayArtist?: string
  displayTitle?: string
  /** milliseconds, added to playback position before matching lines */
  offset?: number
}
