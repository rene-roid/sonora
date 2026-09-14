/** Subsonic / OpenSubsonic API response shapes (subset used by Sonora). */

export interface SubsonicEnvelope<T = Record<string, unknown>> {
  'subsonic-response': {
    status: 'ok' | 'failed'
    version: string
    type?: string
    serverVersion?: string
    openSubsonic?: boolean
    error?: { code: number; message: string }
  } & T
}

export interface ArtistID3 {
  id: string
  name: string
  coverArt?: string
  albumCount?: number
  starred?: string
  artistImageUrl?: string
}

export interface AlbumID3 {
  id: string
  name: string
  artist?: string
  artistId?: string
  coverArt?: string
  songCount?: number
  duration?: number
  playCount?: number
  created?: string
  starred?: string
  year?: number
  genre?: string
}

export interface Child {
  id: string
  parent?: string
  isDir?: boolean
  title: string
  album?: string
  artist?: string
  track?: number
  year?: number
  genre?: string
  coverArt?: string
  size?: number
  contentType?: string
  suffix?: string
  duration?: number
  bitRate?: number
  path?: string
  discNumber?: number
  albumId?: string
  artistId?: string
  type?: string
  starred?: string
  playCount?: number
}

export interface Playlist {
  id: string
  name: string
  comment?: string
  owner?: string
  public?: boolean
  songCount?: number
  duration?: number
  created?: string
  changed?: string
  coverArt?: string
}

export interface PlaylistWithSongs extends Playlist {
  entry?: Child[]
}

export interface ArtistsResponse {
  artists: { ignoredArticles?: string; index?: { name: string; artist?: ArtistID3[] }[] }
}

export interface ArtistResponse {
  artist: ArtistID3 & { album?: AlbumID3[] }
}

export interface AlbumResponse {
  album: AlbumID3 & { song?: Child[] }
}

export interface AlbumList2Response {
  albumList2: { album?: AlbumID3[] }
}

export interface Search3Response {
  searchResult3: { artist?: ArtistID3[]; album?: AlbumID3[]; song?: Child[] }
}

export interface PlaylistsResponse {
  playlists: { playlist?: Playlist[] }
}

export interface PlaylistResponse {
  playlist: PlaylistWithSongs
}

export interface RandomSongsResponse {
  randomSongs: { song?: Child[] }
}

export interface Starred2Response {
  starred2: { artist?: ArtistID3[]; album?: AlbumID3[]; song?: Child[] }
}

export interface StructuredLyricLine {
  /** milliseconds */
  start?: number
  value: string
}

export interface StructuredLyrics {
  lang?: string
  synced: boolean
  displayArtist?: string
  displayTitle?: string
  offset?: number
  line: StructuredLyricLine[]
}

export interface LyricsBySongIdResponse {
  lyricsList: { structuredLyrics?: StructuredLyrics[] }
}

export interface LyricsResponse {
  lyrics: { artist?: string; title?: string; value?: string }
}

export interface PingResponse {
  serverVersion?: string
  type?: string
  openSubsonic?: boolean
  version: string
}

export type AlbumListType =
  | 'random'
  | 'newest'
  | 'highest'
  | 'frequent'
  | 'recent'
  | 'alphabeticalByName'
  | 'alphabeticalByArtist'
  | 'starred'
  | 'byYear'
  | 'byGenre'

export interface Genre {
  value: string
  songCount?: number
  albumCount?: number
}

export interface GenresResponse {
  genres: { genre?: Genre[] }
}

export interface SongsByGenreResponse {
  songsByGenre: { song?: Child[] }
}
