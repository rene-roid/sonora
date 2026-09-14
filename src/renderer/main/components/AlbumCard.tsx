import { Play } from 'lucide-react'
import type { AlbumID3, ArtistID3 } from '@shared/subsonic/types'
import { Cover } from '@renderer/shared/Cover'
import { player } from '@renderer/shared/playerStore'
import { useClient } from '@renderer/shared/sessionStore'
import { nav } from '../nav'

export function AlbumCard({ album }: { album: AlbumID3 }) {
  const client = useClient()
  const playAlbum = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!client) return
    const a = await client.getAlbum(album.id)
    player.setQueue(a.song, 0, true)
  }
  return (
    <div
      className="group cursor-pointer rounded-lg bg-white/[0.02] p-3 transition hover:bg-white/[0.07]"
      onClick={() => nav.go({ name: 'album', id: album.id })}
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
      <div className="mt-3 truncate text-sm font-semibold">{album.name}</div>
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
  action
}: {
  name: string
  subtitle: string
  onClick: () => void
  action?: React.ReactNode
}) {
  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-lg p-4 transition hover:brightness-110"
      style={{ background: `linear-gradient(135deg, hsl(${hue(name)} 60% 32%), hsl(${(hue(name) + 40) % 360} 55% 18%))` }}
      onClick={onClick}
    >
      <div className="text-base font-bold break-words">{name}</div>
      <div className="mt-1 text-xs text-white/70">{subtitle}</div>
      {action}
    </div>
  )
}
