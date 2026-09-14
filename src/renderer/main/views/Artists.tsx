import { useMemo, useState } from 'react'
import { useClient } from '@renderer/shared/sessionStore'
import { ArtistCard, CardGrid } from '../components/AlbumCard'
import { Empty, ErrorBox, Loading, PageTitle } from '../components/ui'
import { useAsync } from '../useAsync'

export function Artists() {
  const client = useClient()
  const state = useAsync('artists', () => client?.getArtists(), [client])
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (state.data ?? []).filter((a) => !q || a.name.toLowerCase().includes(q))
  }, [state.data, filter])

  return (
    <div>
      <PageTitle title="Artists" subtitle={state.data ? `${state.data.length} artists` : undefined} />
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter artists"
        className="mb-5 h-8 w-[280px] rounded-full border border-white/10 bg-white/[0.06] px-4 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
      />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.data && filtered.length === 0 && <Empty>No artists match</Empty>}
      <CardGrid>{filtered.map((a) => <ArtistCard key={a.id} artist={a} />)}</CardGrid>
    </div>
  )
}
