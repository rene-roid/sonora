import { Heart, Shuffle } from 'lucide-react'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { Cover } from '@renderer/shared/Cover'
import { AlbumCard, CardGrid, hue } from '../components/AlbumCard'
import { ErrorBox, Loading, PrimaryButton, SectionHeader } from '../components/ui'
import { nav, type View } from '../nav'
import { useRecents } from '../recents'
import { MixRow } from './Mixes'
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

function RecentTile({ title, view, art }: { title: string; view: View; art: React.ReactNode }) {
  return (
    <button
      onClick={() => nav.go(view)}
      className="flex h-16 items-center gap-3 overflow-hidden rounded-md bg-white/[0.07] text-left transition hover:bg-white/[0.14]"
    >
      <div className="h-16 w-16 shrink-0">{art}</div>
      <div className="line-clamp-2 min-w-0 flex-1 pr-3 text-sm font-semibold leading-tight">{title}</div>
    </button>
  )
}

function RecentGrid() {
  const items = useRecents((s) => s.items)
  return (
    <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
      <RecentTile
        title="Liked Songs"
        view={{ name: 'favorites' }}
        art={
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-400 to-purple-700">
            <Heart size={24} fill="currentColor" />
          </div>
        }
      />
      {items.map((it) => (
        <RecentTile
          key={it.key}
          title={it.title}
          view={it.view}
          art={
            it.coverArt ? (
              <Cover id={it.coverArt} size={160} className="h-full w-full" rounded="rounded-none" />
            ) : (
              <div
                className="h-full w-full"
                style={{
                  background: `linear-gradient(135deg, hsl(${hue(it.title)} 60% 32%), hsl(${(hue(it.title) + 40) % 360} 55% 18%))`
                }}
              />
            )
          }
        />
      ))}
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
            player.setQueue(await client.getRandomSongs(50), 0, true)
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
