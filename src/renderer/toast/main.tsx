import { useEffect, useRef, useState } from 'react'
import type { Track } from '@shared/types'
import { bootstrap } from '@renderer/shared/bootstrap'
import { Cover } from '@renderer/shared/Cover'

interface ToastItem {
  key: number
  track: Track
  durationMs: number
}

function ToastApp() {
  const [item, setItem] = useState<ToastItem | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    return window.sonora.toast.onShow(({ track, durationMs }) => {
      window.clearTimeout(timer.current)
      setLeaving(false)
      setItem({ key: Date.now(), track, durationMs })
      window.sonora.toast.shown()
      timer.current = window.setTimeout(() => setLeaving(true), durationMs)
    })
  }, [])

  if (!item) return null
  const { track } = item

  return (
    <div className="flex h-full w-full items-end justify-end p-2">
      <div
        key={item.key}
        className={`acrylic flex w-full items-center gap-3 p-3 ${leaving ? 'toast-out' : 'toast-in'}`}
        onAnimationEnd={() => {
          if (leaving) {
            setItem(null)
            window.sonora.toast.done()
          }
        }}
      >
        <Cover id={track.coverArt} size={160} className="h-[76px] w-[76px]" />
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            Now playing
          </div>
          <div className="truncate text-[15px] font-semibold leading-tight text-ink">{track.title}</div>
          <div className="truncate text-[13px] text-ink-2">{track.artist}</div>
          {track.album && <div className="truncate text-[12px] text-ink-3">{track.album}</div>}
        </div>
      </div>
    </div>
  )
}

bootstrap(<ToastApp />)
