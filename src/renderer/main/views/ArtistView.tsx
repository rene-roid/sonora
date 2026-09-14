import { Play, Shuffle } from 'lucide-react'
import { useClient } from '@renderer/shared/sessionStore'
import { Cover } from '@renderer/shared/Cover'
import { AlbumCard, CardGrid } from '../components/AlbumCard'
import { ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton } from '../components/ui'
import { recentOf, playFrom } from '../recents'
import { useAsync } from '../useAsync'

export function ArtistView({ id }: { id: string }) {
  const client = useClient()
  const state = useAsync(`artist:${id}`, () => client?.getArtist(id), [client, id])

  const playAll = async (shuffle: boolean): Promise<void> => {
    if (!client || !state.data) return
    const albums = [...state.data.album].sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
    const songs = (await Promise.all(albums.map((a) => client.getAlbum(a.id)))).flatMap((a) => a.song)
    if (shuffle) for (let i = songs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[songs[i], songs[j]] = [songs[j], songs[i]]
    }
    playFrom(songs, 0, recentOf({ name: 'artist', id }, state.data.name, 'Artist', state.data.coverArt ?? id))
  }

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const artist = state.data
  const albums = [...artist.album].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))

  return (
    <div>
      <PageTitle
        eyebrow="Artist"
        title={artist.name}
        subtitle={`${albums.length} album${albums.length === 1 ? '' : 's'}`}
        cover={<Cover id={artist.coverArt ?? artist.id} size={400} className="h-44 w-44 shadow-2xl" rounded="rounded-full" />}
        actions={
          <>
            <PrimaryButton onClick={() => playAll(false)}>
              <Play size={16} fill="currentColor" /> Play
            </PrimaryButton>
            <GhostButton onClick={() => playAll(true)}>
              <Shuffle size={16} /> Shuffle
            </GhostButton>
          </>
        }
      />
      <CardGrid>{albums.map((a) => <AlbumCard key={a.id} album={{ ...a, artist: a.artist ?? artist.name }} />)}</CardGrid>
    </div>
  )
}
