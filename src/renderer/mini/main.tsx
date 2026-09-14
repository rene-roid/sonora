import { Maximize2, X } from 'lucide-react'
import { bootstrap } from '@renderer/shared/bootstrap'
import { Cover } from '@renderer/shared/Cover'
import { TransportControls } from '@renderer/shared/Controls'
import { player, usePlayerState } from '@renderer/shared/playerStore'
import { formatTime } from '@shared/format'

function MiniPlayer() {
  const track = usePlayerState((s) => s.track)
  const position = usePlayerState((s) => s.position)
  const duration = usePlayerState((s) => s.duration)
  const pct = duration > 0 ? (position / duration) * 100 : 0

  return (
    <div className="h-full w-full p-1.5">
      <div className="acrylic drag relative flex h-full w-full items-center gap-3 p-2.5 pr-3">
        <Cover id={track?.coverArt} size={200} className="h-[84px] w-[84px]" />
        <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
          <div className="min-w-0 pr-12">
            <div className="truncate text-[14px] font-semibold leading-tight">{track?.title ?? 'Nothing playing'}</div>
            <div className="truncate text-[12px] text-ink-2">{track?.artist ?? 'Pick something in Sonora'}</div>
          </div>
          <div className="flex items-center justify-between">
            <TransportControls compact size={16} />
            <span className="text-[11px] tabular-nums text-ink-3">
              {formatTime(position)} / {formatTime(duration)}
            </span>
          </div>
          <div
            className="no-drag group relative h-1 w-full cursor-pointer rounded-full bg-white/15"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              player.seek(((e.clientX - r.left) / r.width) * duration)
            }}
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="no-drag absolute top-1.5 right-1.5 flex items-center gap-0.5">
          <button className="icon-btn h-6 w-6" title="Open Sonora" onClick={() => window.sonora.window.showMain()}>
            <Maximize2 size={12} />
          </button>
          <button
            className="icon-btn h-6 w-6"
            title="Close mini player"
            onClick={() => void window.sonora.settings.update({ widgets: { mini: false } as never })}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

bootstrap(<MiniPlayer />)
