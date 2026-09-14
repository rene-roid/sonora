import { Play, Shuffle } from 'lucide-react'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { AlbumCard, ArtistCard, CardGrid } from '../components/AlbumCard'
import { TrackList } from '../components/TrackList'
import { Empty, ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton, SectionHeader } from '../components/ui'
import { playFrom } from '../recents'
import { useAsync } from '../useAsync'

export function Favorites() {
  const client = useClient()
  const state = useAsync('starred', () => client?.getStarred2(), [client])
  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  const r = state.data
  if (!r) return null
  const nothing = !r.songs.length && !r.albums.length && !r.artists.length
  return (
    <div>
      <PageTitle
        title="Favorites"
        subtitle="Songs, albums and artists you starred in Navidrome"
        actions={
          r.songs.length ? (
            <>
              <PrimaryButton onClick={() => playFrom(r.songs, 0, null)}>
                <Play size={16} fill="currentColor" /> Play
              </PrimaryButton>
              <GhostButton
                onClick={() => {
                  player.setShuffle(true)
                  playFrom(r.songs, Math.floor(Math.random() * r.songs.length), null)
                }}
              >
                <Shuffle size={16} /> Shuffle
              </GhostButton>
            </>
          ) : undefined
        }
      />
      {nothing && <Empty>Nothing starred yet</Empty>}
      {r.songs.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Songs" />
          <TrackList tracks={r.songs} origin={null} />
        </section>
      )}
      {r.albums.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Albums" />
          <CardGrid>{r.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid>
        </section>
      )}
      {r.artists.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Artists" />
          <CardGrid>{r.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</CardGrid>
        </section>
      )}
    </div>
  )
}
