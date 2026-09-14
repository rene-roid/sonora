import { useClient } from '@renderer/shared/sessionStore'
import { AlbumCard, ArtistCard, CardGrid } from '../components/AlbumCard'
import { TrackList } from '../components/TrackList'
import { Empty, ErrorBox, Loading, PageTitle, SectionHeader } from '../components/ui'
import { useAsync } from '../useAsync'

export function SearchView({ query }: { query: string }) {
  const client = useClient()
  const state = useAsync(() => (query ? client?.search3(query) : undefined), [client, query])

  if (!query) return <Empty>Type to search your library</Empty>
  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  const r = state.data
  if (!r) return null
  const nothing = !r.songs.length && !r.albums.length && !r.artists.length

  return (
    <div>
      <PageTitle title={`Results for “${query}”`} />
      {nothing && <Empty>Nothing found</Empty>}
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
