import { ChevronDown, ListMusic, MicVocal } from 'lucide-react'
import { Cover } from '@renderer/shared/Cover'
import { TransportControls } from '@renderer/shared/Controls'
import { usePlayerState } from '@renderer/shared/playerStore'
import { nav } from './nav'
import { FavoriteButton, RepeatButton, SeekBar, ShuffleButton, useStar } from './NowPlayingBar'

/** Phone-only full-screen player, opened by tapping the strip at the bottom. */
export function FullPlayer() {
  const track = usePlayerState((s) => s.track)
  const star = useStar(track)
  if (!track) return null
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-gradient-to-b from-surface-3 to-surface px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex h-14 shrink-0 items-center justify-between">
        <button className="icon-btn h-10 w-10" onClick={nav.toggleFullPlayer} title="Close">
          <ChevronDown size={24} />
        </button>
        <button className="min-w-0 truncate text-xs font-semibold text-ink-2" onClick={() => track.albumId && nav.go({ name: 'album', id: track.albumId })}>
          {track.album}
        </button>
        <div className="w-10" />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-4">
        <Cover id={track.coverArt} size={600} className="aspect-square max-h-full w-full max-w-sm shadow-2xl" rounded="rounded-xl" />
      </div>

      <div className="shrink-0 pb-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{track.title}</div>
            <button className="block max-w-full truncate text-sm text-ink-2" onClick={() => track.artistId && nav.go({ name: 'artist', id: track.artistId })}>
              {track.artist}
            </button>
          </div>
          <FavoriteButton {...star} size={22} />
        </div>
        <SeekBar />
        <div className="mt-4 flex items-center justify-between">
          <ShuffleButton size={20} />
          <TransportControls size={30} />
          <RepeatButton size={20} />
        </div>
        <div className="mt-4 flex items-center justify-center gap-6">
          <button className="icon-btn h-10 w-10" onClick={nav.toggleLyrics} title="Lyrics">
            <MicVocal size={20} />
          </button>
          <button className="icon-btn h-10 w-10" onClick={nav.toggleQueue} title="Queue">
            <ListMusic size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
