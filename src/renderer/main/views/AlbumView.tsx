import { useMemo, useState } from 'react'
import { ListPlus, Play, Shuffle } from 'lucide-react'
import { filterTracks, formatDuration } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { Cover } from '@renderer/shared/Cover'
import { TrackList } from '../components/TrackList'
import { Empty, ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton, SearchInput } from '../components/ui'
import { useAsync } from '../useAsync'
import { nav } from '../nav'

export function AlbumView({ id }: { id: string }) {
  const client = useClient()
  const state = useAsync(`album:${id}`, () => client?.getAlbum(id), [client, id])
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
        <TrackList tracks={shown} showAlbum={false} showCover={false} numbered />
      )}
    </div>
  )
}
