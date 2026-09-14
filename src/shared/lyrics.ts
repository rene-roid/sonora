import type { LyricLine, Lyrics } from './types'
import type { StructuredLyrics } from './subsonic/types'

const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/** Parse LRC text (supports multiple timestamps per line and the [offset:] tag). */
export function parseLrc(text: string): Lyrics {
  const lines: LyricLine[] = []
  let offset = 0
  for (const raw of text.split(/\r?\n/)) {
    const offsetMatch = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]/i)
    if (offsetMatch) {
      offset = Number(offsetMatch[1])
      continue
    }
    const stamps: number[] = []
    let m: RegExpExecArray | null
    LRC_TIME.lastIndex = 0
    while ((m = LRC_TIME.exec(raw))) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const fracRaw = m[3] ?? '0'
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length)
      stamps.push(min * 60 + sec + frac)
    }
    const content = raw.replace(LRC_TIME, '').trim()
    if (stamps.length === 0) {
      // metadata tags such as [ar:], [ti:], [al:]
      if (/^\[\w+:.*\]$/.test(raw.trim())) continue
      if (content) lines.push({ time: Number.NaN, text: content })
      continue
    }
    for (const t of stamps) lines.push({ time: t, text: content })
  }
  const synced = lines.some((l) => !Number.isNaN(l.time))
  const out = synced
    ? lines.filter((l) => !Number.isNaN(l.time)).sort((a, b) => a.time - b.time)
    : lines.map((l, i) => ({ time: i, text: l.text }))
  return { synced, lines: out, offset }
}

/** Parse SRT subtitles into lyric lines (start time of each cue). */
export function parseSrt(text: string): Lyrics {
  const lines: LyricLine[] = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    const rows = block.split(/\r?\n/).filter(Boolean)
    const timeRow = rows.find((r) => r.includes('-->'))
    if (!timeRow) continue
    const m = timeRow.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/)
    if (!m) continue
    const time = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000
    const textRows = rows.slice(rows.indexOf(timeRow) + 1)
    lines.push({ time, text: textRows.join(' ').trim() })
  }
  return { synced: lines.length > 0, lines: lines.sort((a, b) => a.time - b.time) }
}

/** Convert OpenSubsonic structured lyrics into Sonora's Lyrics shape. Prefers a synced entry. */
export function fromStructuredLyrics(list: StructuredLyrics[]): Lyrics | null {
  if (!list.length) return null
  const pick = list.find((l) => l.synced) ?? list[0]
  const lines: LyricLine[] = (pick.line ?? []).map((l, i) => ({
    time: pick.synced && typeof l.start === 'number' ? l.start / 1000 : i,
    text: l.value ?? ''
  }))
  return {
    synced: Boolean(pick.synced),
    lines: pick.synced ? lines.sort((a, b) => a.time - b.time) : lines,
    lang: pick.lang,
    displayArtist: pick.displayArtist,
    displayTitle: pick.displayTitle,
    offset: pick.offset
  }
}

/** Best-effort parse of a free-form lyrics string (LRC, SRT or plain text). */
export function parseLyricsText(text: string): Lyrics {
  if (/^\s*\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d+\s*-->/m.test(text)) return parseSrt(text)
  if (/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(text)) return parseLrc(text)
  const lines = text
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => ({ time: i, text: t }))
  return { synced: false, lines }
}

/** Index of the line active at `position` seconds, or -1 before the first line. */
export function activeLineIndex(lyrics: Lyrics, position: number): number {
  if (!lyrics.synced) return -1
  const t = position + (lyrics.offset ?? 0) / 1000
  let lo = 0
  let hi = lyrics.lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lyrics.lines[mid].time <= t) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}
