import { useMemo, useState } from 'react'
import { Play, Shuffle } from 'lucide-react'
import type { Genre } from '@shared/subsonic/types'
import { filterTracks, formatDuration } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { TrackList } from '../components/TrackList'
import { CardGrid, TagCard } from '../components/AlbumCard'
import { Empty, ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton, SearchInput } from '../components/ui'
import { nav } from '../nav'
import { useAsync } from '../useAsync'
import { useRecent } from '../recents'

function GenreCard({ genre }: { genre: Genre }) {
  const client = useClient()
  const play = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    const songs = await client?.getSongsByGenre(genre.value)
    if (songs?.length) player.setQueue(songs, 0, true)
  }
  return (
    <TagCard
      name={genre.value}
      subtitle={`${genre.songCount ?? 0} song${genre.songCount === 1 ? '' : 's'}`}
      onClick={() => nav.go({ name: 'genre', value: genre.value })}
      action={
        <button
          onClick={play}
          className="absolute right-3 bottom-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-accent text-black opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105"
          title="Play genre"
        >
          <Play size={18} fill="currentColor" className="ml-0.5" />
        </button>
      }
    />
  )
}

export function Genres() {
  const client = useClient()
  const state = useAsync('genres', () => client?.getGenres(), [client])
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (state.data ?? [])
      .filter((g) => g.value && (!q || g.value.toLowerCase().includes(q)))
      .sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0))
  }, [state.data, filter])

  return (
    <div>
      <PageTitle title="Genres" subtitle={state.data ? `${state.data.length} genres` : undefined} />
      <SearchInput value={filter} onChange={setFilter} placeholder="Filter genres" />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.data && filtered.length === 0 && <Empty>No genres match</Empty>}
      <CardGrid>{filtered.map((g) => <GenreCard key={g.value} genre={g} />)}</CardGrid>
    </div>
  )
}

export function GenreView({ value }: { value: string }) {
  const client = useClient()
  const state = useAsync(`genre:${value}`, () => client?.getSongsByGenre(value), [client, value])
  useRecent({ key: `genre:${value}`, view: { name: 'genre', value }, title: value })
  const [query, setQuery] = useState('')
  const songs = state.data
  const shown = useMemo(() => filterTracks(songs ?? [], query), [songs, query])

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!songs) return null
  const total = songs.reduce((s, t) => s + t.duration, 0)

  return (
    <div>
      <PageTitle
        eyebrow="Genre"
        title={value}
        subtitle={`${songs.length} song${songs.length === 1 ? '' : 's'}, ${formatDuration(total)}`}
        actions={
          <>
            <PrimaryButton onClick={() => player.setQueue(songs, 0, true)} disabled={!songs.length}>
              <Play size={16} fill="currentColor" /> Play
            </PrimaryButton>
            <GhostButton
              disabled={!songs.length}
              onClick={() => {
                player.setShuffle(true)
                player.setQueue(songs, Math.floor(Math.random() * songs.length), true)
              }}
            >
              <Shuffle size={16} /> Shuffle
            </GhostButton>
          </>
        }
      />
      <SearchInput value={query} onChange={setQuery} placeholder="Search in this genre" />
      {songs.length === 0 ? (
        <Empty>No songs in this genre</Empty>
      ) : shown.length === 0 ? (
        <Empty>No songs match</Empty>
      ) : (
        <TrackList tracks={shown} />
      )}
    </div>
  )
}
