import { ListPlus, Trash2, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef } from 'react'
import type { Track } from '@shared/types'
import { formatTime } from '@shared/format'
import { Cover } from '@renderer/shared/Cover'
import { player, usePlayerState } from '@renderer/shared/playerStore'
import { nav } from '../nav'
import { playlists } from '../playlists'

export function QueuePanel() {
  const queue = usePlayerState((s) => s.queue)
  const index = usePlayerState((s) => s.index)
  const listRef = useRef<HTMLDivElement>(null)
  // Stable, so a track change does not hand every row a new callback and re-render the lot.
  const remove = useCallback((i: number) => player.removeFromQueue(i), [])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-current="true"]')?.scrollIntoView({ block: 'center' })
  }, [index])

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-stroke bg-surface">
      <div className="flex h-12 items-center justify-between border-b border-stroke px-4">
        <div className="text-sm font-semibold">
          Queue <span className="ml-1 text-xs font-normal text-ink-3">{queue.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button className="icon-btn h-7 w-7" title="Save queue as playlist" onClick={() => playlists.newPlaylist(queue)} disabled={!queue.length}>
            <ListPlus size={15} />
          </button>
          <button className="icon-btn h-7 w-7" title="Clear queue" onClick={player.clearQueue} disabled={!queue.length}>
            <Trash2 size={14} />
          </button>
          <button className="icon-btn h-7 w-7" title="Close" onClick={nav.toggleQueue}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {queue.length === 0 && <div className="py-10 text-center text-xs text-ink-3">Queue is empty</div>}
        {queue.map((t, i) => (
          <QueueRow key={`${t.id}-${i}`} track={t} index={i} current={i === index} onRemove={remove} />
        ))}
      </div>
    </aside>
  )
}

/**
 * One queued track. Memoised and skipped while off screen for the same reason the track list's
 * rows are: the panel re-renders whole on every track change, and a long queue is mostly rows
 * that did not change and are not even in view.
 */
const QueueRow = memo(function QueueRow({
  track: t,
  index: i,
  current,
  onRemove
}: {
  track: Track
  index: number
  current: boolean
  onRemove: (index: number) => void
}) {
  return (
    <div
      data-current={current}
      onDoubleClick={() => player.playAt(i)}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 48px' }}
      className={`group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-white/[0.06] ${
        current ? 'bg-white/[0.08]' : ''
      }`}
    >
      <Cover id={t.coverArt} size={80} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <div className={`truncate font-medium ${current ? 'text-accent' : ''}`}>{t.title}</div>
        <div className="truncate text-xs text-ink-2">{t.artist}</div>
      </div>
      <span className="text-[11px] tabular-nums text-ink-3 group-hover:hidden">{formatTime(t.duration)}</span>
      <button className="icon-btn hidden h-6 w-6 group-hover:inline-flex" title="Remove" onClick={() => onRemove(i)}>
        <X size={13} />
      </button>
    </div>
  )
})
