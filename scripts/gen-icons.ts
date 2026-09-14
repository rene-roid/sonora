/**
 * Generates resources/icon.png (256px, for electron-builder) and resources/tray.png (32px)
 * without any native image dependency: a rounded gradient tile with a small waveform.
 *
 *   bun run scripts/gen-icons.ts
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0))
  ])
}

function render(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4)
  const radius = size * 0.22
  const bars = [0.35, 0.6, 0.95, 0.7, 0.45, 0.8, 0.5]
  const barW = size * 0.075
  const gap = size * 0.045
  const totalW = bars.length * barW + (bars.length - 1) * gap
  const left = (size - totalW) / 2

  const inRoundedRect = (x: number, y: number): number => {
    const cx = Math.min(Math.max(x, radius), size - radius)
    const cy = Math.min(Math.max(y, radius), size - radius)
    const d = Math.hypot(x - cx, y - cy)
    return Math.min(1, Math.max(0, radius - d + 0.5))
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const a = inRoundedRect(x + 0.5, y + 0.5)
      if (a <= 0) continue
      const t = (x + y) / (2 * size)
      let r = 20 + (0 - 20) * t + 0 * t
      let g = 120 + (200 - 120) * t
      let b = 212 + (255 - 212) * t
      r = 12 + 30 * (1 - t)
      // waveform bars
      let bar = 0
      for (let k = 0; k < bars.length; k++) {
        const bx = left + k * (barW + gap)
        const bh = bars[k] * size * 0.56
        const by = (size - bh) / 2
        if (x + 0.5 >= bx && x + 0.5 <= bx + barW && y + 0.5 >= by && y + 0.5 <= by + bh) {
          const ex = Math.min(x + 0.5 - bx, bx + barW - (x + 0.5), barW / 2)
          const ey = Math.min(y + 0.5 - by, by + bh - (y + 0.5), barW / 2)
          const corner = Math.hypot(barW / 2 - ex, barW / 2 - ey)
          bar = ex < barW / 2 && ey < barW / 2 ? Math.min(1, Math.max(0, barW / 2 - corner + 0.5)) : 1
        }
      }
      r = r + (255 - r) * bar
      g = g + (255 - g) * bar
      b = b + (255 - b) * bar
      px[i] = r
      px[i + 1] = g
      px[i + 2] = b
      px[i + 3] = Math.round(a * 255)
    }
  }
  return px
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'icon.png'), encodePng(256, 256, render(256)))
writeFileSync(join(out, 'tray.png'), encodePng(32, 32, render(32)))
writeFileSync(join(out, 'tray@2x.png'), encodePng(64, 64, render(64)))
console.log(`wrote ${join(out, 'icon.png')}, tray.png, tray@2x.png`)
