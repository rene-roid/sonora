import { Heart, ListMusic, MicVocal, PictureInPicture2, Repeat, Repeat1, Shuffle, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatTime } from '@shared/format'
import { Cover } from '@renderer/shared/Cover'
import { TransportControls } from '@renderer/shared/Controls'
import { player, usePlayerState } from '@renderer/shared/playerStore'
import { useClient, useSettings } from '@renderer/shared/sessionStore'
import { nav, useNav } from './nav'

export function NowPlayingBar() {
  const track = usePlayerState((s) => s.track)
  const position = usePlayerState((s) => s.position)
  const duration = usePlayerState((s) => s.duration)
  const volume = usePlayerState((s) => s.volume)
  const muted = usePlayerState((s) => s.muted)
  const repeat = usePlayerState((s) => s.repeat)
  const shuffle = usePlayerState((s) => s.shuffle)
  const showQueue = useNav((s) => s.showQueue)
  const showLyrics = useNav((s) => s.showLyrics)
  const settings = useSettings()
  const [scrub, setScrub] = useState<number | null>(null)

  const shown = scrub ?? position
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <footer className="grid h-[88px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-stroke bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        {track && (
          <>
            <Cover id={track.coverArt} size={120} className="h-14 w-14" />
            <div className="min-w-0">
              <button
                className="block max-w-full truncate text-sm font-semibold hover:underline"
                onClick={() => track.albumId && nav.go({ name: 'album', id: track.albumId })}
              >
                {track.title}
              </button>
              <button
                className="block max-w-full truncate text-xs text-ink-2 hover:underline"
                onClick={() => track.artistId && nav.go({ name: 'artist', id: track.artistId })}
              >
                {track.artist}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex w-[520px] flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <button
            className={`icon-btn h-8 w-8 ${shuffle ? 'text-accent hover:text-accent' : ''}`}
            onClick={() => player.setShuffle(!shuffle)}
            title="Shuffle"
          >
            <Shuffle size={16} />
          </button>
          <TransportControls size={18} />
          <button
            className={`icon-btn h-8 w-8 ${repeat !== 'off' ? 'text-accent hover:text-accent' : ''}`}
            onClick={() => player.cycleRepeat(repeat)}
            title={`Repeat: ${repeat}`}
          >
            {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </button>
        </div>
        <div className="flex w-full items-center gap-2 text-[11px] tabular-nums text-ink-2">
          <span className="w-10 text-right">{formatTime(shown)}</span>
          <input
            type="range"
            className="range"
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.1}
            value={shown}
            disabled={!track}
            onChange={(e) => setScrub(Number(e.target.value))}
            onMouseUp={(e) => {
              player.seek(Number((e.target as HTMLInputElement).value))
              setScrub(null)
            }}
            onKeyUp={(e) => {
              player.seek(Number((e.target as HTMLInputElement).value))
              setScrub(null)
            }}
            style={{
              background: `linear-gradient(to right, #fff ${duration ? (shown / duration) * 100 : 0}%, rgba(255,255,255,0.2) 0)`
            }}
          />
          <span className="w-10">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1">
        <FavoriteButton />
        <button
          className={`icon-btn h-8 w-8 ${showLyrics ? 'text-accent hover:text-accent' : ''}`}
          onClick={nav.toggleLyrics}
          title="Lyrics"
          disabled={!track}
        >
          <MicVocal size={16} />
        </button>
        <button
          className={`icon-btn h-8 w-8 ${showQueue ? 'text-accent hover:text-accent' : ''}`}
          onClick={nav.toggleQueue}
          title="Queue"
        >
          <ListMusic size={16} />
        </button>
        <button
          className={`icon-btn h-8 w-8 ${settings.widgets.mini ? 'text-accent hover:text-accent' : ''}`}
          onClick={() => void window.sonora.settings.update({ widgets: { ...settings.widgets, mini: !settings.widgets.mini } })}
          title="Mini player"
        >
          <PictureInPicture2 size={16} />
        </button>
        <div className="ml-2 flex w-[150px] items-center gap-2">
          <button className="icon-btn h-8 w-8" onClick={() => player.setMuted(!muted)} title={muted ? 'Unmute' : 'Mute'}>
            <VolumeIcon size={16} />
          </button>
          <input
            type="range"
            className="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, #fff ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) 0)`
            }}
          />
        </div>
      </div>
    </footer>
  )
}

/** Star/unstar the current track on the server. Optimistic, reverts if the call fails. */
function FavoriteButton() {
  const track = usePlayerState((s) => s.track)
  const client = useClient()
  const [starred, setStarred] = useState(false)

  useEffect(() => setStarred(Boolean(track?.starred)), [track?.id, track?.starred])

  return (
    <button
      className={`icon-btn h-8 w-8 ${starred ? 'text-accent hover:text-accent' : ''}`}
      disabled={!track || !client}
      title={starred ? 'Remove from favorites' : 'Add to favorites'}
      onClick={async () => {
        if (!track || !client) return
        const next = !starred
        setStarred(next)
        try {
          await (next ? client.star(track.id) : client.unstar(track.id))
        } catch {
          setStarred(!next)
        }
      }}
    >
      <Heart size={16} fill={starred ? 'currentColor' : 'none'} />
    </button>
  )
}
