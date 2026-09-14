export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '0 min'
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} hr ${m % 60} min`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Case-insensitive substring match over the fields a listener would type: title, artist, album. */
export function filterTracks<T extends { title: string; artist: string; album: string }>(tracks: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return tracks
  return tracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q))
}

/** Genre wording that marks an album as a soundtrack. Tweak here if a library tags them differently. */
const SOUNDTRACK = /sound\s?track|\bost\b|original score|motion picture|\bscore\b/i

export const isSoundtrack = (genre?: string): boolean => SOUNDTRACK.test(genre ?? '')

/** "Halo 2 OST (Disc 2)" / "FFX OST CD2" -> { base: "Halo 2 OST", disc: 2 }. Volumes are separate releases, not discs. */
const DISC_SUFFIX = /[\s,([-]*\b(?:disc|disk|cd)\s*\.?\s*(\d{1,2})\b\s*[)\]]*\s*$/i

export function parseDiscName(name: string): { base: string; disc?: number } {
  const m = DISC_SUFFIX.exec(name)
  if (!m) return { base: name }
  return { base: name.slice(0, m.index).trim(), disc: Number(m[1]) }
}

/** Display-only: mood tags arrive lowercased from most taggers. Leaves the stored value alone. */
export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Collapses a release that the server split across several albums into one entry whose `discIds`
 * hold the rest. Splits happen two ways: a "(Disc 2)" suffix in the name, or the same name with
 * differing per-disc artist credits (Navidrome does this), so the key is name + year, not artist.
 * The album with the most songs leads, since it carries the release's cover and main credits.
 */
export function groupDiscs<T extends { id: string; name: string; year?: number; songCount?: number }>(
  albums: T[]
): { album: T; discIds: string[] }[] {
  const groups = new Map<string, { album: T; disc: number }[]>()
  for (const album of albums) {
    const { base, disc } = parseDiscName(album.name)
    const key = `${base.toLowerCase()}|${album.year ?? ''}`
    const entry = { album, disc: disc ?? 1 }
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  return [...groups.values()].map((g) => {
    const byDisc = [...g].sort((a, b) => a.disc - b.disc)
    const lead = byDisc.reduce((best, e) => ((e.album.songCount ?? 0) > (best.album.songCount ?? 0) ? e : best), byDisc[0])
    return { album: lead.album, discIds: byDisc.filter((e) => e !== lead).map((e) => e.album.id) }
  })
}
