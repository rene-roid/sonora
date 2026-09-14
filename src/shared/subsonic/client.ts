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
    suffix: c.suffix
  }
}

type Params = Record<string, string | number | boolean | undefined | null>

export class SubsonicClient {
  constructor(
    public readonly session: Session,
    private readonly fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (url, init) =>
      globalThis.fetch(url, init)
  ) {}

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
      p.set(k, String(v))
    }
    return `${this.session.server}/rest/${method}?${p.toString()}`
  }

  async call<T>(method: string, params: Params = {}): Promise<T> {
    const res = await this.fetchImpl(this.url(method, params))
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

  ping(): Promise<PingResponse> {
    return this.call<PingResponse>('ping')
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
