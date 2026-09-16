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

/**
 * What a mix is seeded from: a genre tag, a mood tag, or one artist the mix is built around.
 * Optional on a View because mixes were genre-only at first, so a missing kind means `genre`.
 */
export type MixKind = 'genre' | 'mood' | 'artist'

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
  | { name: 'mix'; value: string; kind?: MixKind }
  | { name: 'mixes' }
  | { name: 'savedMix'; id: string }
  | { name: 'artist'; id: string }
  /** `discIds` are sibling albums holding the other discs of the same release, in disc order. */
  | { name: 'album'; id: string; discIds?: string[] }
  | { name: 'playlist'; id: string }
  | { name: 'search'; query: string }
  | { name: 'favorites' }
  | { name: 'settings' }
  /** Phone-only: the sidebar's links as a page. */
  | { name: 'library' }

/** Identity of a view, for deduping the shelf. */
export function viewKey(v: View): string {
  // Mixes carry their kind, so a "Rock" genre mix and a "Rock" mood mix stay separate entries.
  if (v.name === 'mix') return `mix:${v.kind ?? 'genre'}:${v.value}`
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

/**
 * A mix frozen at the moment it was saved. Mixes are rebuilt from the server every day, so the
 * songs are kept with it rather than the seed alone -- reopening a saved mix gives back the exact
 * lineup, which is the whole point of saving one.
 *
 * ponytail: the songs ride along in the settings file, like the resume queue already does. Fine for
 * the two dozen mixes `saveMix` allows; move them to their own file if that starts to hurt.
 */
export interface SavedMix {
  /** Seed and the day it was saved, so saving the same mix twice in a day replaces it. */
  id: string
  title: string
  /** What the mix was built around, so the saved copy keeps the artwork it was wearing. */
  seed: { kind: MixKind; value: string }
  savedAt: number
  tracks: Track[]
}

const SAVED_MIXES_LIMIT = 24

/** Saved mixes, newest first, one entry per id and capped. */
export function saveMix(mixes: SavedMix[], mix: SavedMix): SavedMix[] {
  return [mix, ...mixes.filter((m) => m.id !== mix.id)].slice(0, SAVED_MIXES_LIMIT)
}

export type WindowName = 'main' | 'host' | 'toast' | 'mini' | 'widget'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Corner or edge of the work area an overlay window (taskbar widget, toast) is glued to. */
export type OverlayAnchor =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right'

export const OVERLAY_ANCHORS: { value: OverlayAnchor; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' }
]

/**
 * How an overlay's card is filled. `solid` is an opaque panel dimmed by `opacity`; `acrylic` is
 * the blurred system backdrop, so whatever sits behind the window shows through it.
 */
export type OverlayBackground = 'solid' | 'acrylic'

export const OVERLAY_BACKGROUNDS: { value: OverlayBackground; label: string; hint: string }[] = [
  { value: 'solid', label: 'Solid', hint: 'An opaque card, dimmed to the opacity you pick' },
  { value: 'acrylic', label: 'Acrylic', hint: 'Frosted glass that blurs whatever sits behind it' }
]

/**
 * Windows 11 22H2 is the first build that can draw the acrylic system backdrop behind a window.
 * Everywhere else acrylic mode falls back to a translucent glass card with no blur, since a
 * transparent window gives `backdrop-filter` nothing to sample.
 */
export function supportsNativeAcrylic(platform: string, release: string): boolean {
  return platform === 'win32' && Number(release.split('.')[2] ?? 0) >= 22621
}

/** How long an overlay takes to settle on a new opacity, in CSS and in main alike. */
export const OVERLAY_FADE_MS = 250

/**
 * The look every floating window shares: taskbar widget, mini player and toast. The hover and
 * click-through options only apply to the two the pointer can actually interact with.
 */
export interface OverlayChrome {
  background: OverlayBackground
  /** Resting opacity, 0.35 to 1. */
  opacity: number
  /** Fade the window down to `hoverOpacity` while the pointer is over it, to see past it. */
  fadeOnHover: boolean
  /** Opacity while hovered, 0.05 to 1. Only ever dims further than `opacity`, never brighter. */
  hoverOpacity: number
  /** Let clicks fall through to whatever is behind the window, except on its own controls. */
  clickThrough: boolean
}

export const defaultOverlayChrome: OverlayChrome = {
  background: 'solid',
  opacity: 1,
  fadeOnHover: false,
  hoverOpacity: 0.35,
  clickThrough: false
}

/**
 * Opacity an overlay should be showing right now. Hovering only ever dims further, so a hover
 * level left above the resting one cannot make the window brighter than the user asked for.
 */
export function overlayOpacity(o: OverlayChrome, hovering: boolean): number {
  return o.fadeOnHover && hovering ? Math.min(o.opacity, o.hoverOpacity) : o.opacity
}

/** Layout and chrome of the taskbar widget. Main sizes and places the window from these. */
export interface WidgetOptions extends OverlayChrome {
  anchor: OverlayAnchor
  /** Shorter bar with the artist line dropped. */
  compact: boolean
  visualizer: boolean
  /** Thin accent progress line along the bottom edge. */
  progress: boolean
  cover: boolean
  /** `1:23 / 4:56` next to the transport buttons. */
  elapsed: boolean
}

export const defaultWidgetOptions: WidgetOptions = {
  ...defaultOverlayChrome,
  anchor: 'bottom-right',
  compact: false,
  visualizer: true,
  progress: true,
  cover: true,
  elapsed: false
}

/** The mini player has no layout options of its own; its position lives in `windowBounds`. */
export type MiniOptions = OverlayChrome

export const defaultMiniOptions: MiniOptions = defaultOverlayChrome

/** Track-change toast. It never takes the mouse, so only the card's look and its corner apply. */
export interface ToastOptions extends Pick<OverlayChrome, 'background' | 'opacity'> {
  anchor: OverlayAnchor
}

export const defaultToastOptions: ToastOptions = {
  anchor: 'bottom-right',
  background: 'solid',
  opacity: 1
}

/**
 * Footprint of the taskbar widget for a given set of options. Lives here so the main process
 * can size the window and the renderer can lay out to exactly the same box. The deltas are the
 * content widths in `widget/main.tsx`, each with the flex gap that goes away with it.
 */
export function widgetSize(o: WidgetOptions): { width: number; height: number } {
  const c = o.compact
  const width = (c ? 288 : 340) - (o.cover ? 0 : c ? 44 : 64) + (o.elapsed ? (c ? 72 : 74) : 0)
  return { width, height: c ? 52 : 76 }
}

export interface Settings {
  widgets: { mini: boolean; taskbar: boolean; toast: boolean }
  /** Position and chrome of the taskbar widget; `widgets.taskbar` decides whether it is shown. */
  widget: WidgetOptions
  mini: MiniOptions
  toast: ToastOptions
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
  /** Disk budget for cached songs, in GB. 0 turns caching off. */
  cacheMaxGb: number
  /** Disk budget for cached cover art, in MB. 0 turns it off and covers load off the server. */
  artCacheMaxMb: number
  /** Mixes the user kept, newest first. */
  savedMixes: SavedMix[]
  /** Also match soundtrack wording in the album title, not just the genre tag. */
  soundtrackTitleMatch: boolean
}

export const defaultSettings: Settings = {
  widgets: { mini: false, taskbar: true, toast: true },
  widget: defaultWidgetOptions,
  mini: defaultMiniOptions,
  toast: defaultToastOptions,
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
  recents: [],
  cacheMaxGb: 5,
  artCacheMaxMb: 256,
  savedMixes: [],
  soundtrackTitleMatch: true
}

/**
 * What a caller may hand to `settings.update`. The nested groups merge field by field, so a
 * window can flip one option without having to echo back the rest.
 */
export type SettingsPatch = Partial<Omit<Settings, 'widget' | 'widgets' | 'mini' | 'toast'>> & {
  widget?: Partial<WidgetOptions>
  mini?: Partial<MiniOptions>
  toast?: Partial<ToastOptions>
  widgets?: Partial<Settings['widgets']>
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
