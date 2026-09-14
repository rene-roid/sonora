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

  useEffect(() => {
    target.current = new Float32Array(bars)
    current.current = new Float32Array(bars)
  }, [bars])

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
    })
    ro.observe(canvas)

    const draw = (): void => {
      raf = requestAnimationFrame(draw)
      const w = canvas.width
      const h = canvas.height
      if (!w || !h) return
      const t = target.current
      const c = current.current
      const n = c.length
      const decaying = !playingRef.current
      for (let i = 0; i < n; i++) {
        const goal = decaying ? 0 : t[i]
        const rate = goal > c[i] ? 0.45 : 0.12
        c[i] += (goal - c[i]) * rate
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
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
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
