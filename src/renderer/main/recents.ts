import type { AlbumID3 } from '@shared/subsonic/types'
import type { SubsonicClient } from '@shared/subsonic/client'
import { parseDiscName } from '@shared/format'
import { pushRecent, viewKey, type RecentItem, type Track, type View } from '@shared/types'
import { player } from '@renderer/shared/playerStore'
import { useSessionStore } from '@renderer/shared/sessionStore'
import { buildMix } from './mixes'

/** Describe a page for the shelf. Call sites pass this as the origin of a play. */
export function recentOf(view: View, title: string, subtitle?: string, coverArt?: string): RecentItem {
  return { key: viewKey(view), view, title, subtitle, coverArt }
}

/** `discIds` are the sibling albums of a split multi-disc release, as on AlbumCard. */
export function albumRecent(album: AlbumID3, discIds?: string[]): RecentItem {
  const view: View = { name: 'album', id: album.id, discIds: discIds?.length ? discIds : undefined }
  return recentOf(view, parseDiscName(album.name).base, album.artist, album.coverArt ?? album.id)
}

function songItem(t: Track | undefined): RecentItem | null {
  return t ? { key: `track:${t.id}`, title: t.title, subtitle: t.artist, coverArt: t.coverArt, track: t } : null
}

function remember(item: RecentItem | null): void {
  const { recents } = useSessionStore.getState().settings
  const next = pushRecent(recents, item)
  if (next !== recents) void window.sonora.settings.update({ recents: next })
}

/**
 * Play `tracks` and record what the user played *from* on Home's shelf.
 * `origin` omitted means the song stands on its own (search hit, library shuffle); `null` records nothing.
 */
export function playFrom(tracks: Track[], index = 0, origin?: RecentItem | null): void {
  player.setQueue(tracks, index, true)
  remember(origin === undefined ? songItem(tracks[index]) : origin)
}

/** Re-fetch what a shelf tile stands for, so its play button works long after the play that made it. */
export async function loadRecent(c: SubsonicClient, r: RecentItem): Promise<Track[]> {
  const v = r.view
  if (!v) return r.track ? [r.track] : []
  switch (v.name) {
    case 'album': {
      const albums = await Promise.all([v.id, ...(v.discIds ?? [])].map((i) => c.getAlbum(i)))
      return albums.flatMap((a) => a.song)
    }
    case 'artist': {
      const albums = [...(await c.getArtist(v.id)).album].sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
      return (await Promise.all(albums.map((a) => c.getAlbum(a.id)))).flatMap((a) => a.song)
    }
    case 'playlist':
      return (await c.getPlaylist(v.id)).entry
    case 'genre':
      return c.getSongsByGenre(v.value)
    case 'mood': {
      const albums = (await c.getAllAlbums()).filter((a) => a.moods?.includes(v.value))
      return (await Promise.all(albums.map((a) => c.getAlbum(a.id)))).flatMap((a) => a.song)
    }
    case 'mix':
      return buildMix(c, v.value)
    case 'favorites':
      return (await c.getStarred2()).songs
    default:
      return []
  }
}
