import { useState } from 'react'
import { Play } from 'lucide-react'
import type { AlbumID3, ArtistID3 } from '@shared/subsonic/types'
import type { SubsonicClient } from '@shared/subsonic/client'
import type { RecentItem, Track } from '@shared/types'
import { parseDiscName } from '@shared/format'
import { Cover } from '@renderer/shared/Cover'
import { useClient } from '@renderer/shared/sessionStore'
import { nav, type View } from '../nav'
import { albumRecent, playFrom } from '../recents'
import { Spinner } from './ui'

/** `discIds` are sibling albums holding the rest of a split multi-disc release, in disc order. */
export function AlbumCard({ album, discIds }: { album: AlbumID3; discIds?: string[] }) {
  const client = useClient()
  const ids = [album.id, ...(discIds ?? [])]
  const playAlbum = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!client) return
    const albums = await Promise.all(ids.map((i) => client.getAlbum(i)))
    playFrom(albums.flatMap((a) => a.song), 0, albumRecent(album, discIds))
  }
  return (
    <div
      className="group cursor-pointer rounded-lg bg-white/[0.02] p-3 transition hover:bg-white/[0.07]"
      onClick={() => nav.go({ name: 'album', id: album.id, discIds })}
    >
      <div className="relative">
        <Cover id={album.coverArt ?? album.id} size={300} className="aspect-square w-full shadow-lg" />
        <button
          onClick={playAlbum}
          className="absolute right-2 bottom-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-black opacity-0 shadow-xl transition group-hover:translate-y-0 group-hover:opacity-100 hover:scale-105"
          title="Play album"
        >
          <Play size={20} fill="currentColor" className="ml-0.5" />
        </button>
      </div>
      <div className="mt-3 truncate text-sm font-semibold">
        {ids.length > 1 ? parseDiscName(album.name).base : album.name}
      </div>
      <div className="mt-0.5 truncate text-xs text-ink-2">
        {album.year ? `${album.year} · ` : ''}
        {album.artist ?? 'Unknown artist'}
      </div>
    </div>
  )
}

export function ArtistCard({ artist }: { artist: ArtistID3 }) {
  return (
    <div
      className="group cursor-pointer rounded-lg bg-white/[0.02] p-3 text-center transition hover:bg-white/[0.07]"
      onClick={() => nav.go({ name: 'artist', id: artist.id })}
    >
      <Cover id={artist.coverArt ?? artist.id} size={300} className="aspect-square w-full shadow-lg" rounded="rounded-full" />
      <div className="mt-3 truncate text-sm font-semibold">{artist.name}</div>
      <div className="mt-0.5 truncate text-xs text-ink-2">
        {artist.albumCount ? `${artist.albumCount} album${artist.albumCount === 1 ? '' : 's'}` : 'Artist'}
      </div>
    </div>
  )
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">{children}</div>
}

/** Tags (genres, moods) have no artwork on Navidrome, so give each a stable colour from its name. */
export function hue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export function TagCard({
  name,
  subtitle,
  onClick,
  art,
  action
}: {
  name: string
  subtitle: string
  onClick: () => void
  /** Background layer, filling the card behind the label. Falls back to the plain colour block. */
  art?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      className="group relative flex aspect-5/4 cursor-pointer flex-col justify-end overflow-hidden rounded-lg p-4 transition hover:brightness-110"
      style={{ background: gradient(name) }}
      onClick={onClick}
    >
      {art && <div className="absolute inset-0">{art}</div>}
      <div className="relative pr-12">
        <div className="line-clamp-2 text-base font-bold break-words drop-shadow-md">{name}</div>
        <div className="mt-1 truncate text-xs text-white/75">{subtitle}</div>
      </div>
      {action}
    </div>
  )
}

export function gradient(name: string): string {
  return `linear-gradient(135deg, hsl(${hue(name)} 60% 32%), hsl(${(hue(name) + 40) % 360} 55% 18%))`
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">{children}</div>
}

/** Wide short tile with a hover play button: the "jump back in" shelf at the top of Home. */
export function Tile({
  title,
  view,
  art,
  load,
  recent
}: {
  title: string
  /** Absent for a tile that stands for a single song: clicking it plays instead of navigating. */
  view?: View
  art: React.ReactNode
  load: (client: SubsonicClient) => Promise<Track[]>
  /** What playing this tile puts on Home's shelf; `null` for one that is pinned there anyway. */
  recent: RecentItem | null
}) {
  const client = useClient()
  const [busy, setBusy] = useState(false)
  const play = async (e?: React.MouseEvent): Promise<void> => {
    e?.stopPropagation()
    if (!client || busy) return
    setBusy(true)
    try {
      const tracks = await load(client)
      if (tracks.length) playFrom(tracks, 0, recent)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="group relative">
      <button
        onClick={() => (view ? nav.go(view) : void play())}
        className="flex h-16 w-full items-center gap-3 overflow-hidden rounded-md bg-white/[0.07] text-left transition hover:bg-white/[0.14]"
      >
        <div className="h-16 w-16 shrink-0">{art}</div>
        <div className="line-clamp-2 min-w-0 flex-1 pr-14 text-sm font-semibold leading-tight">{title}</div>
      </button>
      <button
        onClick={play}
        title={`Play ${title}`}
        className="absolute top-1/2 right-3 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-black opacity-0 shadow-xl transition group-hover:opacity-100 hover:scale-105 focus-visible:opacity-100"
      >
        {busy ? <Spinner className="h-5 w-5" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>
    </div>
  )
}
