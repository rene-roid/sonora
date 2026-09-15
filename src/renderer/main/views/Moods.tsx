import { useMemo, useState } from 'react'
import { Play, Shuffle } from 'lucide-react'
import type { AlbumID3 } from '@shared/subsonic/types'
import { capitalize } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { AlbumCard, CardGrid, TagCard } from '../components/AlbumCard'
import { TagArt, TagArtCover } from '../components/TagArt'
import { Empty, ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton, SearchInput } from '../components/ui'
import { nav } from '../nav'
import { recentOf, playFrom } from '../recents'
import { useAsync, type AsyncState } from '../useAsync'

/**
 * Subsonic has no mood endpoint, so both views work off one cached pass over the album list and
 * read the OpenSubsonic `moods` tag. Servers that do not send it simply show an empty tab.
 */
const useAlbums = (): AsyncState<AlbumID3[]> => {
  const client = useClient()
  return useAsync('albums:all', () => client?.getAllAlbums(), [client])
}

const moodRecent = (value: string) => recentOf({ name: 'mood', value }, capitalize(value), 'Mood')

export function Moods() {
  const state = useAlbums()
  const [filter, setFilter] = useState('')

  const moods = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of state.data ?? []) {
      for (const m of a.moods ?? []) if (m) counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    const q = filter.trim().toLowerCase()
    return [...counts]
      .filter(([m]) => !q || m.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1])
  }, [state.data, filter])

  return (
    <div>
      <PageTitle title="Moods" subtitle={state.data ? `${moods.length} moods` : undefined} />
      <SearchInput value={filter} onChange={setFilter} placeholder="Filter moods" />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.data && moods.length === 0 && (
        <Empty>{filter ? 'No moods match' : 'No mood tags in this library'}</Empty>
      )}
      <CardGrid>
        {moods.map(([mood, count]) => (
          <TagCard
            key={mood}
            name={capitalize(mood)}
            subtitle={`${count} album${count === 1 ? '' : 's'}`}
            art={<TagArt art={{ style: 'mood', seed: { kind: 'mood', value: mood } }} name={capitalize(mood)} />}
            onClick={() => nav.go({ name: 'mood', value: mood })}
          />
        ))}
      </CardGrid>
    </div>
  )
}

export function MoodView({ value }: { value: string }) {
  const client = useClient()
  const state = useAlbums()
  const [query, setQuery] = useState('')

  const albums = useMemo(() => (state.data ?? []).filter((a) => a.moods?.includes(value)), [state.data, value])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return albums
    return albums.filter((a) => `${a.name} ${a.artist ?? ''}`.toLowerCase().includes(q))
  }, [albums, query])

  const playAll = async (shuffle: boolean): Promise<void> => {
    if (!client) return
    const songs = (await Promise.all(albums.map((a) => client.getAlbum(a.id)))).flatMap((a) => a.song)
    if (!songs.length) return
    player.setShuffle(shuffle)
    playFrom(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, moodRecent(value))
  }

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />

  return (
    <div>
      <PageTitle
        eyebrow="Mood"
        title={capitalize(value)}
        cover={<TagArtCover art={{ style: 'mood', seed: { kind: 'mood', value } }} name={capitalize(value)} />}
        subtitle={`${albums.length} album${albums.length === 1 ? '' : 's'}`}
        actions={
          <>
            <PrimaryButton onClick={() => playAll(false)} disabled={!albums.length}>
              <Play size={16} fill="currentColor" /> Play
            </PrimaryButton>
            <GhostButton onClick={() => playAll(true)} disabled={!albums.length}>
              <Shuffle size={16} /> Shuffle
            </GhostButton>
          </>
        }
      />
      <SearchInput value={query} onChange={setQuery} placeholder="Search in this mood" />
      {shown.length === 0 ? (
        <Empty>No albums match</Empty>
      ) : (
        <CardGrid>{shown.map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid>
      )}
    </div>
  )
}
