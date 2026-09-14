import { useMemo, useState } from 'react'
import { Play, Shuffle } from 'lucide-react'
import type { Genre } from '@shared/subsonic/types'
import { formatDuration } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { TrackList } from '../components/TrackList'
import { CardGrid } from '../components/AlbumCard'
import { Empty, ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton } from '../components/ui'
import { nav } from '../nav'
import { useAsync } from '../useAsync'

/** Genres have no artwork on Navidrome, so give each a stable colour derived from its name. */
function hue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

function GenreCard({ genre }: { genre: Genre }) {
  const client = useClient()
  const play = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    const songs = await client?.getSongsByGenre(genre.value)
    if (songs?.length) player.setQueue(songs, 0, true)
  }
  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-lg p-4 transition hover:brightness-110"
      style={{ background: `linear-gradient(135deg, hsl(${hue(genre.value)} 60% 32%), hsl(${(hue(genre.value) + 40) % 360} 55% 18%))` }}
      onClick={() => nav.go({ name: 'genre', value: genre.value })}
    >
      <div className="text-base font-bold break-words">{genre.value}</div>
      <div className="mt-1 text-xs text-white/70">
        {genre.songCount ?? 0} song{genre.songCount === 1 ? '' : 's'}
      </div>
      <button
        onClick={play}
        className="absolute right-3 bottom-3 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-accent text-black opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105"
        title="Play genre"
      >
        <Play size={18} fill="currentColor" className="ml-0.5" />
      </button>
    </div>
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
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter genres"
        className="mb-5 h-8 w-[280px] rounded-full border border-white/10 bg-white/[0.06] px-4 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
      />
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

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  const songs = state.data
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
      {songs.length === 0 ? <Empty>No songs in this genre</Empty> : <TrackList tracks={songs} />}
    </div>
  )
}
