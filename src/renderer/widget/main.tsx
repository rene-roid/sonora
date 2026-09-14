import { bootstrap } from '@renderer/shared/bootstrap'
import { Cover } from '@renderer/shared/Cover'
import { TransportControls } from '@renderer/shared/Controls'
import { usePlayerState } from '@renderer/shared/playerStore'
import { Visualizer } from './Visualizer'

/**
 * Taskbar-area widget: a small acrylic flyout pinned to the bottom-right of the work area,
 * right above the Windows taskbar next to the system tray.
 */
function TaskbarWidget() {
  const track = usePlayerState((s) => s.track)
  const position = usePlayerState((s) => s.position)
  const duration = usePlayerState((s) => s.duration)
  const pct = duration > 0 ? (position / duration) * 100 : 0

  return (
    <div className="h-full w-full p-1">
      <div className="acrylic relative flex h-full w-full items-center gap-2.5 overflow-hidden px-2.5">
        <Visualizer bars={40} className="pointer-events-none absolute inset-x-0 bottom-0 h-full w-full opacity-40" />
        <button
          className="relative h-[50px] w-[50px] shrink-0 overflow-hidden rounded-md"
          onClick={() => window.sonora.window.showMain()}
          title="Open Sonora"
        >
          <Cover id={track?.coverArt} size={120} className="h-full w-full" />
        </button>
        <div className="relative min-w-0 flex-1 cursor-default" onDoubleClick={() => window.sonora.window.showMain()}>
          <div className="text-shadow truncate text-[13px] font-semibold leading-tight">
            {track?.title ?? 'Sonora'}
          </div>
          <div className="text-shadow truncate text-[11.5px] text-ink-2">{track?.artist ?? 'Nothing playing'}</div>
        </div>
        <div className="relative">
          <TransportControls compact size={15} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

bootstrap(<TaskbarWidget />)
