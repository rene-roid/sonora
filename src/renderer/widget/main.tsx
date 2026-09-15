import { bootstrap } from '@renderer/shared/bootstrap'
import { Cover } from '@renderer/shared/Cover'
import { TransportControls } from '@renderer/shared/Controls'
import { useOverlayChrome } from '@renderer/shared/overlay'
import { usePlayerState } from '@renderer/shared/playerStore'
import { useSettings } from '@renderer/shared/sessionStore'
import { formatTime } from '@shared/format'
import { Visualizer } from './Visualizer'

/**
 * Taskbar-area widget: a small card pinned to one edge of the work area, usually just above
 * the Windows taskbar. Main owns the window's size and position; everything here lays out to
 * fill whatever box it was given, from the same `settings.widget` options.
 */
function TaskbarWidget() {
  const o = useSettings().widget
  const { card, style } = useOverlayChrome(o)
  const track = usePlayerState((s) => s.track)
  const position = usePlayerState((s) => s.position)
  const duration = usePlayerState((s) => s.duration)
  const pct = duration > 0 ? (position / duration) * 100 : 0
  const art = o.compact ? 36 : 54

  return (
    <div className="h-full w-full" style={style}>
      <div
        className={`${card} relative flex h-full w-full items-center overflow-hidden ${
          o.compact ? 'gap-2 px-2' : 'gap-2.5 px-2.5'
        }`}
      >
        {o.visualizer && (
          <Visualizer bars={40} className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />
        )}
        {o.cover && (
          <button
            className="relative shrink-0 overflow-hidden rounded-md"
            style={{ height: art, width: art }}
            onClick={() => window.sonora.window.showMain()}
            title="Open Sonora"
          >
            <Cover id={track?.coverArt} size={120} className="h-full w-full" />
          </button>
        )}
        <div className="relative min-w-0 flex-1 cursor-default" onDoubleClick={() => window.sonora.window.showMain()}>
          <div className={`text-shadow truncate font-semibold leading-tight ${o.compact ? 'text-[12px]' : 'text-[13px]'}`}>
            {track?.title ?? 'Sonora'}
          </div>
          {!o.compact && (
            <div className="text-shadow truncate text-[11.5px] text-ink-2">{track?.artist ?? 'Nothing playing'}</div>
          )}
        </div>
        {o.elapsed && (
          <div className="text-shadow relative shrink-0 text-[10.5px] tabular-nums text-ink-3">
            {formatTime(position)} / {formatTime(duration)}
          </div>
        )}
        {/* shrink-0: the title next to it has flex-basis 0, so it never gives width back on its own. */}
        <div className="relative shrink-0">
          <TransportControls compact size={o.compact ? 13 : 15} />
        </div>
        {o.progress && (
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

bootstrap(<TaskbarWidget />)
