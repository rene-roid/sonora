import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { player, usePlayerState } from './playerStore'

export function TransportControls({ size = 18, compact = false }: { size?: number; compact?: boolean }) {
  const playing = usePlayerState((s) => s.playing)
  const hasTrack = usePlayerState((s) => Boolean(s.track))
  const btn = compact ? 'h-7 w-7' : 'h-8 w-8'
  return (
    <div className="no-drag flex items-center gap-1">
      <button className={`icon-btn ${btn}`} onClick={player.prev} disabled={!hasTrack} title="Previous">
        <SkipBack size={size - 2} />
      </button>
      <button
        className={`icon-btn ${compact ? 'h-8 w-8' : 'h-9 w-9'} bg-white text-black hover:bg-white/90 hover:text-black`}
        onClick={player.toggle}
        disabled={!hasTrack}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={size} fill="currentColor" /> : <Play size={size} fill="currentColor" className="ml-0.5" />}
      </button>
      <button className={`icon-btn ${btn}`} onClick={player.next} disabled={!hasTrack} title="Next">
        <SkipForward size={size - 2} />
      </button>
    </div>
  )
}
