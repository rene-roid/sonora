import { Heart, Shuffle } from 'lucide-react'
import { useClient, useSettings } from '@renderer/shared/sessionStore'
import { Cover } from '@renderer/shared/Cover'
import { AlbumCard, CardGrid, Tile, TileGrid, gradient } from '../components/AlbumCard'
import { ErrorBox, Loading, PrimaryButton, SectionHeader } from '../components/ui'
import { MixRow } from './Mixes'
import { loadRecent, playFrom } from '../recents'
import { useAsync } from '../useAsync'
import type { AlbumListType } from '@shared/subsonic/types'

function AlbumRow({ title, type }: { title: string; type: AlbumListType }) {
  const client = useClient()
  const state = useAsync(`list:${type}`, () => client?.getAlbumList2(type, 12), [client, type])
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

function RecentGrid() {
  const items = useSettings().recents
  return (
    <div className="mb-8">
      <TileGrid>
        <Tile
          title="Liked Songs"
          view={{ name: 'favorites' }}
          load={async (c) => (await c.getStarred2()).songs}
          recent={null}
          art={
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-400 to-purple-700">
              <Heart size={24} fill="currentColor" />
            </div>
          }
        />
        {items.map((it) => (
          <Tile
            key={it.key}
            title={it.title}
            view={it.view}
            load={(c) => loadRecent(c, it)}
            recent={it}
            art={
              it.coverArt ? (
                <Cover id={it.coverArt} size={160} className="h-full w-full" rounded="rounded-none" />
              ) : (
                <div className="h-full w-full" style={{ background: gradient(it.title) }} />
              )
            }
          />
        ))}
      </TileGrid>
    </div>
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
            playFrom(await client.getRandomSongs(50))
          }}
        >
          <Shuffle size={16} /> Shuffle library
        </PrimaryButton>
      </div>
      <RecentGrid />
      <MixRow />
      <AlbumRow title="Recently added" type="newest" />
      <AlbumRow title="Recently played" type="recent" />
      <AlbumRow title="Most played" type="frequent" />
      <AlbumRow title="Random picks" type="random" />
    </div>
  )
}
