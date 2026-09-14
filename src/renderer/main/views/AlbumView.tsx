import { useMemo, useState } from 'react'
import { ListPlus, Play, Shuffle } from 'lucide-react'
import type { AlbumID3 } from '@shared/subsonic/types'
import type { SubsonicClient } from '@shared/subsonic/client'
import type { Track } from '@shared/types'
import { filterTracks, formatDuration, parseDiscName } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { Cover } from '@renderer/shared/Cover'
import { TrackList } from '../components/TrackList'
import { Empty, ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton, SearchInput } from '../components/ui'
import { useAsync } from '../useAsync'
import { nav } from '../nav'

/**
 * One album, or several albums of a split release stitched into one. Tracks keep their own disc
 * number when tagged; untagged ones fall back to the album's position in `ids`, which is how
 * "(Disc 2)"-style splits usually arrive.
 */
async function loadAlbum(client: SubsonicClient, ids: string[]): Promise<AlbumID3 & { song: Track[] }> {
  const albums = await Promise.all(ids.map((i) => client.getAlbum(i)))
  if (albums.length === 1) return albums[0]
  const song = albums
    .flatMap((a, i) => a.song.map((t) => ({ ...t, disc: t.disc ?? i + 1 })))
    .sort((a, b) => a.disc - b.disc || (a.track ?? 0) - (b.track ?? 0))
  const duration = song.reduce((n, t) => n + t.duration, 0)
  return { ...albums[0], name: parseDiscName(albums[0].name).base, songCount: song.length, duration, song }
}

export function AlbumView({ id, discIds }: { id: string; discIds?: string[] }) {
  const client = useClient()
  const ids = [id, ...(discIds ?? [])]
  const key = ids.join(',')
  const state = useAsync(`album:${key}`, () => (client ? loadAlbum(client, ids) : undefined), [client, key])
  const [query, setQuery] = useState('')
  const shown = useMemo(() => filterTracks(state.data?.song ?? [], query), [state.data, query])

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const album = state.data
  const songs = album.song
  const total = songs.reduce((s, t) => s + t.duration, 0)

  return (
    <div>
      <PageTitle
        eyebrow="Album"
        title={album.name}
        cover={<Cover id={album.coverArt ?? album.id} size={500} className="h-52 w-52 shadow-2xl" />}
        subtitle={
          <span>
            {album.artistId ? (
              <button className="font-semibold text-ink hover:underline" onClick={() => nav.go({ name: 'artist', id: album.artistId! })}>
                {album.artist}
              </button>
            ) : (
              <span className="font-semibold text-ink">{album.artist}</span>
            )}
            {album.year ? ` · ${album.year}` : ''} · {songs.length} song{songs.length === 1 ? '' : 's'}, {formatDuration(total)}
            {album.genre ? ` · ${album.genre}` : ''}
          </span>
        }
        actions={
          <>
            <PrimaryButton onClick={() => player.setQueue(songs, 0, true)}>
              <Play size={16} fill="currentColor" /> Play
            </PrimaryButton>
            <GhostButton
              onClick={() => {
                player.setShuffle(true)
                player.setQueue(songs, Math.floor(Math.random() * songs.length), true)
              }}
            >
              <Shuffle size={16} /> Shuffle
            </GhostButton>
            <GhostButton onClick={() => player.addToQueue(songs)} title="Add to queue">
              <ListPlus size={16} /> Queue
            </GhostButton>
          </>
        }
      />
      <SearchInput value={query} onChange={setQuery} placeholder="Search in this album" />
      {shown.length === 0 ? (
        <Empty>No songs match</Empty>
      ) : (
        <TrackList tracks={shown} showAlbum={false} showCover={false} numbered discs />
      )}
    </div>
  )
}
