import { useMemo, useState } from 'react'
import { Play, Shuffle } from 'lucide-react'
import type { Track } from '@shared/types'
import { filterTracks, formatDuration } from '@shared/format'
import { player } from '@renderer/shared/playerStore'
import type { AsyncState } from '../useAsync'
import { TrackList } from './TrackList'
import { Empty, ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton, SearchInput } from './ui'

/** A flat, searchable, playable list of songs: the shape shared by genre and mix pages. */
export function TrackPage({
  eyebrow,
  title,
  state
}: {
  eyebrow: string
  title: string
  state: AsyncState<Track[]>
}) {
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
        eyebrow={eyebrow}
        title={title}
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
      <SearchInput value={query} onChange={setQuery} placeholder={`Search in this ${eyebrow.toLowerCase()}`} />
      {songs.length === 0 ? (
        <Empty>Nothing here</Empty>
      ) : shown.length === 0 ? (
        <Empty>No songs match</Empty>
      ) : (
        <TrackList tracks={shown} />
      )}
    </div>
  )
}
