import { md5 } from 'js-md5'
import type { Session, Track } from '../types'
import type {
  AlbumID3,
  AlbumList2Response,
  AlbumListType,
  AlbumResponse,
  ArtistID3,
  ArtistResponse,
  ArtistsResponse,
  Child,
  Genre,
  GenresResponse,
  LyricsBySongIdResponse,
  LyricsResponse,
  PingResponse,
  Playlist,
  PlaylistResponse,
  PlaylistsResponse,
  RandomSongsResponse,
  Search3Response,
  SongsByGenreResponse,
  Starred2Response,
  StructuredLyrics,
  SubsonicEnvelope
} from './types'

export const API_VERSION = '1.16.1'
export const CLIENT_NAME = 'sonora'

export class SubsonicError extends Error {
  constructor(
    message: string,
    public readonly code?: number
  ) {
    super(message)
    this.name = 'SubsonicError'
  }
}

function randomSalt(length = 16): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(length)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

/** Derive the salted token the Subsonic API expects. The plain password is not kept anywhere. */
export function credentialsFromPassword(password: string): { token: string; salt: string } {
  const salt = randomSalt()
  return { token: md5(password + salt), salt }
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim()
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`
  return url.replace(/\/+$/, '')
}

export function childToTrack(c: Child): Track {
  return {
    id: c.id,
    title: c.title,
    artist: c.artist ?? 'Unknown artist',
    artistId: c.artistId,
    album: c.album ?? '',
    albumId: c.albumId,
    duration: c.duration ?? 0,
    track: c.track,
    disc: c.discNumber,
    year: c.year,
    genre: c.genre,
    coverArt: c.coverArt ?? c.albumId,
    starred: Boolean(c.starred),
    bitRate: c.bitRate,
    suffix: c.suffix,
    // baseGain is deliberately dropped: it is the Opus header gain, which the decoder already applies.
    gain: c.replayGain && {
      track: c.replayGain.trackGain,
      album: c.replayGain.albumGain,
      trackPeak: c.replayGain.trackPeak,
      albumPeak: c.replayGain.albumPeak,
      fallback: c.replayGain.fallbackGain
    }
  }
}

type Params = Record<string, string | number | boolean | undefined | null | (string | number)[]>
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export class SubsonicClient {
  /** Currently used candidate. Failover moves it without rebuilding the client. */
  private active: string
  /** Shared in-flight failover race, so N concurrent failures cause one round of pings. */
  private switching?: Promise<string>

  constructor(
    public readonly session: Session,
    private readonly fetchImpl: Fetch = (url, init) => globalThis.fetch(url, init),
    /** Called when failover changes the active server, so main can persist the new pick. */
    private readonly onServerSwitch?: (server: string) => void
  ) {
    this.active = session.server
  }

  get server(): string {
    return this.active
  }

  private get candidates(): string[] {
    return this.session.servers?.length ? this.session.servers : [this.session.server]
  }

  private authParams(): URLSearchParams {
    const p = new URLSearchParams()
    p.set('u', this.session.username)
    p.set('t', this.session.token)
    p.set('s', this.session.salt)
    p.set('v', API_VERSION)
    p.set('c', CLIENT_NAME)
    p.set('f', 'json')
    return p
  }

  url(method: string, params: Params = {}): string {
    const p = this.authParams()
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue
      // Subsonic takes repeated keys for multi-valued params (songIdToAdd, songIndexToRemove).
      if (Array.isArray(v)) for (const item of v) p.append(k, String(item))
      else p.set(k, String(v))
    }
    return `${this.active}/rest/${method}?${p.toString()}`
  }

  /**
   * After a network-level failure, re-race the other candidates and adopt the winner.
   * Resolves undefined when there is nothing better to switch to.
   */
  private async switchServer(): Promise<string | undefined> {
    const others = this.candidates.filter((s) => s !== this.active)
    if (others.length === 0) return undefined
    const race = (this.switching ??= pickFastestServer(this.session, others, this.fetchImpl).finally(() => {
      this.switching = undefined
    }))
    try {
      const next = await race
      if (next !== this.active) {
        this.active = next
        this.onServerSwitch?.(next)
      }
      return next
    } catch {
      return undefined // every candidate is down too; report the original failure
    }
  }

  async call<T>(method: string, params: Params = {}, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(this.url(method, params), init)
    } catch (err) {
      // ping is the probe itself, and its init carries a spent AbortSignal, so never retry it.
      if (method === 'ping' || !(await this.switchServer())) throw err
      res = await this.fetchImpl(this.url(method, params), init)
    }
    if (!res.ok) throw new SubsonicError(`HTTP ${res.status} ${res.statusText} calling ${method}`)
    const json = (await res.json()) as SubsonicEnvelope<T>
    const body = json['subsonic-response']
    if (!body) throw new SubsonicError(`Malformed response from ${method}`)
    if (body.status !== 'ok') {
      throw new SubsonicError(body.error?.message ?? `Subsonic error calling ${method}`, body.error?.code)
    }
    return body as unknown as T
  }

  // ---- system -------------------------------------------------------------

  /** Times out rather than hanging, so callers can treat a dead server as "down" promptly. */
  ping(timeoutMs = 8000): Promise<PingResponse> {
    return this.call<PingResponse>('ping', {}, { signal: AbortSignal.timeout(timeoutMs) })
  }

  // ---- browsing ------------------------------------------------------------

  async getArtists(): Promise<ArtistID3[]> {
    const r = await this.call<ArtistsResponse>('getArtists')
    return (r.artists.index ?? []).flatMap((i) => i.artist ?? [])
  }

  async getArtist(id: string): Promise<ArtistID3 & { album: AlbumID3[] }> {
    const r = await this.call<ArtistResponse>('getArtist', { id })
    return { ...r.artist, album: r.artist.album ?? [] }
  }

  async getAlbum(id: string): Promise<AlbumID3 & { song: Track[] }> {
    const r = await this.call<AlbumResponse>('getAlbum', { id })
    return { ...r.album, song: (r.album.song ?? []).map(childToTrack) }
  }

  async getAlbumList2(type: AlbumListType, size = 40, offset = 0, extra: Params = {}): Promise<AlbumID3[]> {
    const r = await this.call<AlbumList2Response>('getAlbumList2', { type, size, offset, ...extra })
    return r.albumList2.album ?? []
  }

  /**
   * Every album, paged. Subsonic has no endpoint listing moods, so the Moods view derives them
   * from the album tags; 500 is the per-call ceiling the spec allows.
   */
  async getAllAlbums(max = 5000): Promise<AlbumID3[]> {
    const all: AlbumID3[] = []
    while (all.length < max) {
      const page = await this.getAlbumList2('alphabeticalByName', 500, all.length)
      all.push(...page)
      if (page.length < 500) break
    }
    return all
  }

  async getRandomSongs(size = 50): Promise<Track[]> {
    const r = await this.call<RandomSongsResponse>('getRandomSongs', { size })
    return (r.randomSongs.song ?? []).map(childToTrack)
  }

  async getGenres(): Promise<Genre[]> {
    const r = await this.call<GenresResponse>('getGenres')
    return r.genres.genre ?? []
  }

  async getSongsByGenre(genre: string, count = 500, offset = 0): Promise<Track[]> {
    const r = await this.call<SongsByGenreResponse>('getSongsByGenre', { genre, count, offset })
    return (r.songsByGenre.song ?? []).map(childToTrack)
  }

  async getStarred2(): Promise<{ artists: ArtistID3[]; albums: AlbumID3[]; songs: Track[] }> {
    const r = await this.call<Starred2Response>('getStarred2')
    return {
      artists: r.starred2.artist ?? [],
      albums: r.starred2.album ?? [],
      songs: (r.starred2.song ?? []).map(childToTrack)
    }
  }

  // ---- search --------------------------------------------------------------

  async search3(
    query: string,
    counts: { artistCount?: number; albumCount?: number; songCount?: number } = {}
  ): Promise<{ artists: ArtistID3[]; albums: AlbumID3[]; songs: Track[] }> {
    const r = await this.call<Search3Response>('search3', {
      query,
      artistCount: counts.artistCount ?? 10,
      albumCount: counts.albumCount ?? 20,
      songCount: counts.songCount ?? 40
    })
    return {
      artists: r.searchResult3.artist ?? [],
      albums: r.searchResult3.album ?? [],
      songs: (r.searchResult3.song ?? []).map(childToTrack)
    }
  }

  // ---- playlists -----------------------------------------------------------

  async getPlaylists(): Promise<Playlist[]> {
    const r = await this.call<PlaylistsResponse>('getPlaylists')
    return r.playlists.playlist ?? []
  }

  async getPlaylist(id: string): Promise<Playlist & { entry: Track[] }> {
    const r = await this.call<PlaylistResponse>('getPlaylist', { id })
    return { ...r.playlist, entry: (r.playlist.entry ?? []).map(childToTrack) }
  }

  /** Add and/or remove songs. Indexes refer to the playlist's current order, so removals are applied server-side in one call. */
  updatePlaylist(
    playlistId: string,
    changes: { songIdToAdd?: string[]; songIndexToRemove?: number[]; name?: string }
  ): Promise<unknown> {
    return this.call('updatePlaylist', { playlistId, ...changes })
  }

  // ---- annotation ----------------------------------------------------------

  star(id: string, kind: 'song' | 'album' | 'artist' = 'song'): Promise<unknown> {
    const key = kind === 'song' ? 'id' : kind === 'album' ? 'albumId' : 'artistId'
    return this.call('star', { [key]: id })
  }

  unstar(id: string, kind: 'song' | 'album' | 'artist' = 'song'): Promise<unknown> {
    const key = kind === 'song' ? 'id' : kind === 'album' ? 'albumId' : 'artistId'
    return this.call('unstar', { [key]: id })
  }

  scrobble(id: string, submission: boolean): Promise<unknown> {
    return this.call('scrobble', { id, submission, time: Date.now() })
  }

  // ---- lyrics --------------------------------------------------------------

  /** OpenSubsonic synced lyrics. Returns [] on servers that do not support the endpoint. */
  async getLyricsBySongId(id: string): Promise<StructuredLyrics[]> {
    try {
      const r = await this.call<LyricsBySongIdResponse>('getLyricsBySongId', { id })
      return r.lyricsList?.structuredLyrics ?? []
    } catch (err) {
      if (err instanceof SubsonicError && (err.code === 0 || err.code === 70 || err.message.includes('404'))) {
        return []
      }
      throw err
    }
  }

  /** Legacy unsynced lyrics lookup by artist/title. */
  async getLyrics(artist: string, title: string): Promise<string | undefined> {
    const r = await this.call<LyricsResponse>('getLyrics', { artist, title })
    return r.lyrics?.value
  }

  // ---- media ---------------------------------------------------------------

  coverArtUrl(id: string | undefined, size = 300): string | undefined {
    if (!id) return undefined
    return this.url('getCoverArt', { id, size })
  }

  streamUrl(id: string, opts: { maxBitRate?: number; format?: string } = {}): string {
    return this.url('stream', { id, maxBitRate: opts.maxBitRate, format: opts.format })
  }

  downloadUrl(id: string): string {
    return this.url('download', { id })
  }
}

export interface ServerProbe {
  server: string
  ok: boolean
  /** Round-trip time of the ping, in milliseconds. */
  ms: number
  error?: string
}

/** Ping every candidate at once; the first to answer wins. Rejects when all of them fail. */
export function pickFastestServer(
  session: Session,
  servers: string[],
  fetchImpl?: Fetch,
  timeoutMs = 5000
): Promise<string> {
  return Promise.any(
    servers.map(async (server) => {
      await new SubsonicClient({ ...session, server }, fetchImpl).ping(timeoutMs)
      return server
    })
  )
}

/** Like pickFastestServer, but waits for every candidate and reports each result, for the UI. */
export function probeServers(
  session: Session,
  servers: string[],
  fetchImpl?: Fetch,
  timeoutMs = 5000
): Promise<ServerProbe[]> {
  return Promise.all(
    servers.map(async (server) => {
      const started = Date.now()
      try {
        await new SubsonicClient({ ...session, server }, fetchImpl).ping(timeoutMs)
        return { server, ok: true, ms: Date.now() - started }
      } catch (err) {
        return { server, ok: false, ms: Date.now() - started, error: (err as Error).message }
      }
    })
  )
}
