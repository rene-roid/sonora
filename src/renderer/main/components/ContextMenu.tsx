import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Where a right-click opened the menu, in viewport coordinates. */
export interface MenuPos {
  x: number
  y: number
}

/**
 * Opens on right-click, closes on any outside press, Esc, scroll or resize.
 *
 * `open` and `close` keep the same identity for the life of the hook, so a memoised row that is
 * handed one of them is not re-rendered by its owner re-rendering for something else.
 */
export function useContextMenu(): {
  pos: MenuPos | null
  open: (e: React.MouseEvent) => void
  close: () => void
} {
  const [pos, setPos] = useState<MenuPos | null>(null)
  const open = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setPos({ x: e.clientX, y: e.clientY })
  }, [])
  const close = useCallback(() => setPos(null), [])
  return useMemo(() => ({ pos, open, close }), [pos, open, close])
}

export function ContextMenu({
  pos,
  onClose,
  children
}: {
  pos: MenuPos
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState(pos)

  // Measure first, then nudge inside the viewport, so a menu near the edge is never cut off.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const x = Math.max(8, Math.min(pos.x, window.innerWidth - r.width - 8))
    const y = Math.max(8, Math.min(pos.y, window.innerHeight - r.height - 8))
    // Same value in, same object out: `children` in the deps would otherwise re-measure forever.
    setPlaced((prev) => (prev.x === x && prev.y === y ? prev : { x, y }))
  }, [pos, children])

  useEffect(() => {
    // Pressing or scrolling inside the menu is not "outside", so a long playlist list stays open.
    const outside = (e: Event): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('wheel', outside)
    window.addEventListener('resize', onClose)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('wheel', outside)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      style={{ left: placed.x, top: placed.y }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 max-h-[70vh] min-w-[220px] overflow-y-auto overscroll-contain rounded-lg border border-stroke bg-surface-3 p-1 text-[13px] shadow-2xl"
    >
      {children}
    </div>,
    document.body
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  disabled,
  danger,
  hint
}: {
  icon?: ReactNode
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  hint?: ReactNode
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition disabled:opacity-40 ${
        danger ? 'text-red-300 hover:bg-red-500/15' : 'text-ink hover:bg-white/10'
      }`}
    >
      {icon && <span className="shrink-0 text-ink-2">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-ink-3">{hint}</span>}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="my-1 border-t border-stroke" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{children}</div>
}
