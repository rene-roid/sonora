import { ListEnd, ListPlus, Play, Volume2 } from 'lucide-react'
import type { Track } from '@shared/types'
import { formatTime } from '@shared/format'
import { Cover } from '@renderer/shared/Cover'
import { player, usePlayerState } from '@renderer/shared/playerStore'
import { nav } from '../nav'

export function TrackList({
  tracks,
  showAlbum = true,
  showCover = true,
  numbered = false
}: {
  tracks: Track[]
  showAlbum?: boolean
  showCover?: boolean
  numbered?: boolean
}) {
  const currentId = usePlayerState((s) => s.track?.id)
  const playing = usePlayerState((s) => s.playing)

  if (!tracks.length) return <div className="py-10 text-center text-sm text-ink-3">No tracks</div>

  return (
    <div className="text-sm">
      <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-stroke px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-3 md:grid-cols-[40px_1fr_1fr_80px_60px]">
        <div className="text-center">#</div>
        <div>Title</div>
        {showAlbum ? <div className="hidden md:block">Album</div> : <div className="hidden md:block" />}
        <div className="hidden md:block" />
        <div className="text-right">Time</div>
      </div>
      {tracks.map((t, i) => {
        const isCurrent = t.id === currentId
        return (
          <div
            key={`${t.id}-${i}`}
            onDoubleClick={() => player.setQueue(tracks, i, true)}
            className={`group grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-md px-3 py-1.5 hover:bg-white/[0.06] md:grid-cols-[40px_1fr_1fr_80px_60px] ${
              isCurrent ? 'text-accent' : ''
            }`}
          >
            <div className="flex items-center justify-center text-ink-3">
              <span className="group-hover:hidden">
                {isCurrent && playing ? <Volume2 size={14} className="text-accent" /> : numbered ? (t.track ?? i + 1) : i + 1}
              </span>
              <button className="hidden text-ink group-hover:block" onClick={() => player.setQueue(tracks, i, true)} title="Play">
                <Play size={14} fill="currentColor" />
              </button>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              {showCover && <Cover id={t.coverArt} size={80} className="h-10 w-10" />}
              <div className="min-w-0">
                <div className={`truncate font-medium ${isCurrent ? 'text-accent' : 'text-ink'}`}>{t.title}</div>
                <div className="truncate text-xs text-ink-2">
                  {t.artistId ? (
                    <button className="hover:underline" onClick={() => nav.go({ name: 'artist', id: t.artistId! })}>
                      {t.artist}
                    </button>
                  ) : (
                    t.artist
                  )}
                </div>
              </div>
            </div>
            {showAlbum ? (
              <div className="hidden truncate text-ink-2 md:block">
                {t.albumId ? (
                  <button className="truncate hover:underline" onClick={() => nav.go({ name: 'album', id: t.albumId! })}>
                    {t.album}
                  </button>
                ) : (
                  t.album
                )}
              </div>
            ) : (
              <div className="hidden md:block" />
            )}
            <div className="hidden items-center justify-end gap-1 opacity-0 group-hover:opacity-100 md:flex">
              <button className="icon-btn h-7 w-7" title="Play next" onClick={() => player.addToQueue([t], true)}>
                <ListEnd size={15} />
              </button>
              <button className="icon-btn h-7 w-7" title="Add to queue" onClick={() => player.addToQueue([t])}>
                <ListPlus size={15} />
              </button>
            </div>
            <div className="text-right tabular-nums text-ink-2">{formatTime(t.duration)}</div>
          </div>
        )
      })}
    </div>
  )
}
