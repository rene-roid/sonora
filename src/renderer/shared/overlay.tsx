import { useEffect, useState, type CSSProperties } from 'react'
import { OVERLAY_FADE_MS, overlayOpacity, type OverlayBackground, type OverlayChrome } from '@shared/types'

/** Whether this window sits on the system's acrylic backdrop under the given background mode. */
export function nativeAcrylic(background: OverlayBackground): boolean {
  return background === 'acrylic' && window.sonora.nativeAcrylic
}

/**
 * Card classes for a background mode. Acrylic asks the system for the card's fill, which only
 * Windows 11 draws; anywhere else it degrades to a translucent glass card that still shows the
 * wallpaper, just without the blur.
 */
export function overlayCard(background: OverlayBackground): string {
  if (background === 'solid') return 'acrylic acrylic-flat'
  return nativeAcrylic(background) ? 'acrylic-sheet' : 'acrylic-glass'
}

/** Whether the pointer is over this window. Main watches the cursor and tells us. */
function useHovered(): boolean {
  const [hovered, setHovered] = useState(false)
  useEffect(() => window.sonora.overlay.onHover(setHovered), [])
  return hovered
}

/**
 * Click-through mode: the window ignores the mouse, so clicks land on whatever is behind it, and
 * takes the mouse back for as long as the pointer is over one of its own controls. Main polls the
 * cursor and hands the point over, because a window ignoring the mouse is sent no move messages
 * of its own; resolving it against the layout is this side's job. Controls are buttons and
 * anything marked `no-drag`, which is how the mini player already flags its seek bar.
 */
function useClickThrough(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    let ignoring: boolean | undefined
    const ignore = (next: boolean): void => {
      if (next === ignoring) return
      ignoring = next
      window.sonora.window.setIgnoreMouse(next)
    }
    ignore(true)
    const off = window.sonora.overlay.onHitTest((p) => {
      ignore(!p || !document.elementFromPoint(p.x, p.y)?.closest('button, .no-drag'))
    })
    return () => {
      off()
      window.sonora.window.setIgnoreMouse(false)
    }
  }, [enabled])
}

/**
 * What a floating window needs from its chrome options: the card's classes, and the style of
 * the wrapper that fades. A system backdrop is painted outside the page, so CSS cannot fade it:
 * main eases the whole window's alpha instead and the wrapper stays fully opaque there.
 */
export function useOverlayChrome(o: OverlayChrome): { card: string; style: CSSProperties } {
  const hovered = useHovered()
  useClickThrough(o.clickThrough)
  return {
    card: overlayCard(o.background),
    style: {
      opacity: nativeAcrylic(o.background) ? 1 : overlayOpacity(o, hovered),
      transition: `opacity ${OVERLAY_FADE_MS}ms ease-out`
    }
  }
}
