import { useMemo, useState } from 'react'
import { groupDiscs, isSoundtrack, parseDiscName } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { AlbumCard, CardGrid } from '../components/AlbumCard'
import { Empty, ErrorBox, Loading, PageTitle, SearchInput } from '../components/ui'
import { useAsync } from '../useAsync'

export function Soundtracks() {
  const client = useClient()
  // Shares the album-list cache with Moods, so this costs nothing extra after either view has loaded.
  const state = useAsync('albums:all', () => client?.getAllAlbums(), [client])
  const [query, setQuery] = useState('')

  // Discs of the same release collapse into one card; the card opens all of them as one album.
  const albums = useMemo(() => groupDiscs((state.data ?? []).filter((a) => isSoundtrack(a.genre))), [state.data])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return albums
    return albums.filter(({ album }) => `${parseDiscName(album.name).base} ${album.artist ?? ''}`.toLowerCase().includes(q))
  }, [albums, query])

  return (
    <div>
      <PageTitle
        title="Soundtracks"
        subtitle={state.data ? `${albums.length} album${albums.length === 1 ? '' : 's'}` : undefined}
      />
      <SearchInput value={query} onChange={setQuery} placeholder="Filter soundtracks" />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.data && shown.length === 0 && (
        <Empty>{query ? 'No soundtracks match' : 'No soundtrack albums in this library'}</Empty>
      )}
      <CardGrid>
        {shown.map(({ album, discIds }) => (
          <AlbumCard key={album.id} album={album} discIds={discIds.length ? discIds : undefined} />
        ))}
      </CardGrid>
    </div>
  )
}
