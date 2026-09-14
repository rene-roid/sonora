import { useEffect, useState } from 'react'
import type { AlbumID3, AlbumListType } from '@shared/subsonic/types'
import { useClient } from '@renderer/shared/sessionStore'
import { AlbumCard, CardGrid } from '../components/AlbumCard'
import { ErrorBox, GhostButton, Loading, PageTitle } from '../components/ui'
import { RETRY_MS } from '../useAsync'

const SORTS: { key: AlbumListType; label: string }[] = [
  { key: 'alphabeticalByName', label: 'A–Z' },
  { key: 'alphabeticalByArtist', label: 'Artist' },
  { key: 'newest', label: 'Recently added' },
  { key: 'frequent', label: 'Most played' },
  { key: 'random', label: 'Random' }
]

const PAGE = 60

export function Albums() {
  const client = useClient()
  const [sort, setSort] = useState<AlbumListType>('alphabeticalByName')
  const [albums, setAlbums] = useState<AlbumID3[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string>()

  const load = async (offset: number, reset: boolean): Promise<void> => {
    if (!client) return
    setLoading(true)
    setError(undefined)
    try {
      const page = await client.getAlbumList2(sort, PAGE, offset)
      setAlbums((prev) => (reset ? page : [...prev, ...page]))
      setDone(page.length < PAGE)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Failed page load retries itself until it lands; the Retry button short-circuits the wait.
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => void load(albums.length, albums.length === 0), RETRY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  useEffect(() => {
    setAlbums([])
    setDone(false)
    void load(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sort])

  return (
    <div>
      <PageTitle title="Albums" />
      <div className="mb-5 flex flex-wrap gap-2">
        {SORTS.map((s) => (
          <GhostButton key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
            {s.label}
          </GhostButton>
        ))}
      </div>
      {error && <ErrorBox message={error} onRetry={() => load(albums.length, false)} />}
      <CardGrid>{albums.map((a, i) => <AlbumCard key={`${a.id}-${i}`} album={a} />)}</CardGrid>
      {loading && <Loading />}
      {!loading && !done && albums.length > 0 && (
        <div className="mt-6 flex justify-center">
          <GhostButton onClick={() => load(albums.length, false)}>Load more</GhostButton>
        </div>
      )}
    </div>
  )
}
