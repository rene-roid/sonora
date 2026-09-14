import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Lyrics } from '@shared/types'
import { activeLineIndex, fromStructuredLyrics, parseLyricsText } from '@shared/lyrics'
import { Cover } from '@renderer/shared/Cover'
import { player, usePlayerState, usePlayerStore } from '@renderer/shared/playerStore'
import { useClient } from '@renderer/shared/sessionStore'
import { Spinner } from '../components/ui'
import { nav } from '../nav'

/**
 * Karaoke-style lyrics. Position updates arrive every 250ms; between them we extrapolate
 * from the last update timestamp on every animation frame so the highlight lands within a
 * few milliseconds of the audio.
 */
export function LyricsView() {
  const client = useClient()
  const track = usePlayerState((s) => s.track)
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)
  const clock = useRef({ position: 0, at: performance.now(), playing: false })

  useEffect(() => {
    setLyrics(null)
    setActive(-1)
    if (!client || !track) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      let result: Lyrics | null = null
      try {
        result = fromStructuredLyrics(await client.getLyricsBySongId(track.id))
        if (!result || !result.lines.length) {
          const text = await client.getLyrics(track.artist, track.title).catch(() => undefined)
          result = text?.trim() ? parseLyricsText(text) : null
        }
      } catch (err) {
        console.warn('[lyrics]', err)
      }
      if (!cancelled) {
        setLyrics(result)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, track?.id])

  // Track the play clock from the store without re-rendering on every position tick.
  useEffect(() => {
    const sync = (): void => {
      const s = usePlayerStore.getState()
      clock.current = { position: s.position, at: performance.now(), playing: s.playing }
    }
    sync()
    return usePlayerStore.subscribe(sync)
  }, [])

  useEffect(() => {
    if (!lyrics?.synced) return
    let raf = 0
    const tick = (): void => {
      raf = requestAnimationFrame(tick)
      const c = clock.current
      const pos = c.playing ? c.position + (performance.now() - c.at) / 1000 : c.position
      const idx = activeLineIndex(lyrics, pos)
      setActive((prev) => (prev === idx ? prev : idx))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lyrics])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${active}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [active])

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-gradient-to-b from-[#1b2a3a] to-surface">
      <div className="flex items-center justify-between px-6 pt-4">
        <div className="flex items-center gap-3">
          <Cover id={track?.coverArt} size={120} className="h-12 w-12" />
          <div>
            <div className="text-sm font-semibold">{track?.title}</div>
            <div className="text-xs text-ink-2">{track?.artist}</div>
          </div>
        </div>
        <button className="icon-btn h-8 w-8" onClick={nav.toggleLyrics} title="Close lyrics">
          <X size={18} />
        </button>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-10 py-[35vh]">
        {loading && (
          <div className="flex justify-center">
            <Spinner />
          </div>
        )}
        {!loading && !lyrics && <div className="text-center text-ink-3">No lyrics available for this track</div>}
        {lyrics?.lines.map((line, i) => {
          const isActive = i === active
          const passed = lyrics.synced && i < active
          return (
            <div
              key={i}
              data-line={i}
              onClick={() => lyrics.synced && player.seek(line.time - (lyrics.offset ?? 0) / 1000)}
              className={`my-1 rounded-md px-3 py-1.5 text-[26px] leading-snug font-bold transition-all duration-300 ${
                lyrics.synced ? 'cursor-pointer hover:bg-white/[0.06]' : ''
              } ${isActive ? 'scale-100 text-ink' : passed ? 'text-ink-3/70' : lyrics.synced ? 'text-ink-3' : 'text-ink-2'}`}
              style={{ transformOrigin: 'left center', transform: isActive ? 'scale(1.02)' : 'scale(1)' }}
            >
              {line.text || '♪'}
            </div>
          )
        })}
        {lyrics && !lyrics.synced && (
          <div className="mt-8 text-center text-xs text-ink-3">Unsynced lyrics: this track has no timestamps.</div>
        )}
      </div>
    </div>
  )
}
