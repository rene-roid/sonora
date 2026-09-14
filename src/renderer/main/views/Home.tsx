import { Shuffle } from 'lucide-react'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { AlbumCard, CardGrid } from '../components/AlbumCard'
import { ErrorBox, Loading, PrimaryButton, SectionHeader } from '../components/ui'
import { useAsync } from '../useAsync'
import type { AlbumListType } from '@shared/subsonic/types'

function AlbumRow({ title, type }: { title: string; type: AlbumListType }) {
  const client = useClient()
  const state = useAsync(() => client?.getAlbumList2(type, 12), [client, type])
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  return (
    <section className="mb-8">
      <SectionHeader title={title} />
      {state.loading ? (
        <Loading />
      ) : (
        <CardGrid>{state.data?.map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid>
      )}
    </section>
  )
}

export function Home() {
  const client = useClient()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">{greeting}</h1>
        <PrimaryButton
          onClick={async () => {
            if (!client) return
            player.setQueue(await client.getRandomSongs(50), 0, true)
          }}
        >
          <Shuffle size={16} /> Shuffle library
        </PrimaryButton>
      </div>
      <AlbumRow title="Recently added" type="newest" />
      <AlbumRow title="Recently played" type="recent" />
      <AlbumRow title="Most played" type="frequent" />
      <AlbumRow title="Random picks" type="random" />
    </div>
  )
}
