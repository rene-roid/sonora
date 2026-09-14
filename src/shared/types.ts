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
  server: string
  username: string
  /** md5(password + salt). The raw password is never persisted. */
  token: string
  salt: string
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
  toastDurationMs: number
  windowBounds: Partial<Record<WindowName, Rect>>
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
  toastDurationMs: 3500,
  windowBounds: {}
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
