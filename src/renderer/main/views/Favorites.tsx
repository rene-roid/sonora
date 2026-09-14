import { Play } from 'lucide-react'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { AlbumCard, ArtistCard, CardGrid } from '../components/AlbumCard'
import { TrackList } from '../components/TrackList'
import { Empty, ErrorBox, Loading, PageTitle, PrimaryButton, SectionHeader } from '../components/ui'
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
            <PrimaryButton onClick={() => player.setQueue(r.songs, 0, true)}>
              <Play size={16} fill="currentColor" /> Play songs
            </PrimaryButton>
          ) : undefined
        }
      />
      {nothing && <Empty>Nothing starred yet</Empty>}
      {r.songs.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Songs" />
          <TrackList tracks={r.songs} />
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
