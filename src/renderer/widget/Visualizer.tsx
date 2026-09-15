import { useEffect, useRef } from 'react'
import { usePlayerState } from '@renderer/shared/playerStore'

/**
 * Canvas bar visualiser fed by the audio host's `audioFrame` events (~30fps).
 * Bars are smoothed toward the latest frame on every animation frame so motion stays fluid
 * even though IPC frames arrive at a lower rate than the display refresh.
 */
export function Visualizer({
  bars = 32,
  className = '',
  color = '#4cc2ff',
  mirror = false
}: {
  bars?: number
  className?: string
  color?: string
  mirror?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const target = useRef<Float32Array>(new Float32Array(bars))
  const current = useRef<Float32Array>(new Float32Array(bars))
  const playing = usePlayerState((s) => s.playing)
  const playingRef = useRef(playing)
  playingRef.current = playing
  /** Starts the draw loop if it has idled. Installed by the effect that owns the loop. */
  const wake = useRef<() => void>(() => {})

  useEffect(() => {
    target.current = new Float32Array(bars)
    current.current = new Float32Array(bars)
    wake.current()
  }, [bars])

  // Pausing stops the frames, so the decay to the floor needs waking on its own.
  useEffect(() => {
    wake.current()
  }, [playing])

  useEffect(() => {
    window.sonora.player.wantFrames(true)
    const off = window.sonora.player.on('audioFrame', ({ bins }) => {
      const t = target.current
      const n = t.length
      const per = bins.length / n
      for (let i = 0; i < n; i++) {
        const start = Math.floor(i * per)
        const end = Math.max(start + 1, Math.floor((i + 1) * per))
        let acc = 0
        for (let j = start; j < end; j++) acc += bins[j]
        t[i] = acc / (end - start) / 255
      }
      wake.current()
    })
    return () => {
      off()
      window.sonora.player.wantFrames(false)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      wake.current()
    })
    ro.observe(canvas)

    /**
     * The loop runs only while there is motion left to draw. Paused audio decays the bars to
     * their floor and then stops; the next frame off the host starts it again. Without this the
     * widget would hold a display-rate redraw open for as long as it is on screen, which for a
     * window that sits above the taskbar all day is most of the day.
     */
    const draw = (): void => {
      const w = canvas.width
      const h = canvas.height
      if (!w || !h) {
        raf = 0
        return
      }
      const t = target.current
      const c = current.current
      const n = c.length
      const decaying = !playingRef.current
      let moving = false
      for (let i = 0; i < n; i++) {
        const goal = decaying ? 0 : t[i]
        const rate = goal > c[i] ? 0.45 : 0.12
        c[i] += (goal - c[i]) * rate
        if (Math.abs(goal - c[i]) > 0.002) moving = true
      }
      ctx.clearRect(0, 0, w, h)
      const gap = Math.max(1, w / n / 4)
      const bw = (w - gap * (n - 1)) / n
      ctx.fillStyle = color
      for (let i = 0; i < n; i++) {
        const v = Math.max(0.04, c[i])
        const bh = Math.max(2, v * h)
        const x = i * (bw + gap)
        const y = mirror ? (h - bh) / 2 : h - bh
        ctx.globalAlpha = 0.35 + v * 0.65
        roundRect(ctx, x, y, bw, bh, Math.min(bw / 2, 3))
      }
      ctx.globalAlpha = 1
      raf = moving ? requestAnimationFrame(draw) : 0
    }

    wake.current = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    wake.current()
    return () => {
      cancelAnimationFrame(raf)
      raf = 0
      wake.current = () => {}
      ro.disconnect()
    }
  }, [color, mirror])

  return <canvas ref={canvasRef} className={className} />
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}
