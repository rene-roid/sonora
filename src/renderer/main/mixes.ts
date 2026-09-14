/**
 * Auto-generated "mixes": daily playlists seeded from what the server says you actually play.
 * Navidrome already tracks play counts and genre tags, so there is no recommendation engine
 * here -- just seed, shuffle and spread.
 */
import type { SubsonicClient } from '@shared/subsonic/client'
import type { Track } from '@shared/types'

const MIX_LENGTH = 50
/** Most a single artist may take up in one mix, so a mix never turns into an album. */
const PER_ARTIST = 2

function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Deterministic shuffle: a mix stays put all day and comes back different tomorrow, with nothing stored. */
function shuffle<T>(items: T[], seed: string): T[] {
  let s = seedOf(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function spread(tracks: Track[]): Track[] {
  const seen = new Map<string, number>()
  const out: Track[] = []
  for (const t of tracks) {
    const n = seen.get(t.artist) ?? 0
    if (n >= PER_ARTIST) continue
    seen.set(t.artist, n + 1)
    out.push(t)
    if (out.length === MIX_LENGTH) break
  }
  return out
}

/** The genres behind your most played albums, most played first. */
export async function mixSeeds(client: SubsonicClient, count = 6): Promise<string[]> {
  const albums = await client.getAlbumList2('frequent', 50)
  const counts = new Map<string, number>()
  for (const a of albums) if (a.genre) counts.set(a.genre, (counts.get(a.genre) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([genre]) => genre)
}

export async function buildMix(client: SubsonicClient, genre: string): Promise<Track[]> {
  // ponytail: one genre pull is the whole pool. Blend in similar artists (getSimilarSongs2) if
  // the mixes start feeling like a genre dump -- that endpoint needs Last.fm set up on the server.
  const pool = await client.getSongsByGenre(genre, 500)
  return spread(shuffle(pool, `${genre}:${new Date().toDateString()}`))
}
