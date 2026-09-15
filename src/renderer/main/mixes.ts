/**
 * Auto-generated "mixes": daily playlists seeded from what the server says you actually play.
 * Navidrome already tracks play counts, genre and mood tags, so there is no recommendation engine
 * here -- just seed, shuffle and spread.
 *
 * A seed is a genre tag, a mood tag or an artist. Each kind draws from a different pool but ends
 * up in the same shape: one day-stable, artist-spread list of songs.
 */
import type { SubsonicClient } from '@shared/subsonic/client'
import type { AlbumID3 } from '@shared/subsonic/types'
import type { MixKind, Track, View } from '@shared/types'

/** What one mix is built around. `value` is the tag text, or the artist's name. */
export interface MixSeed {
  kind: MixKind
  value: string
}

/** Views persisted before mixes grew past genres carry no kind. */
export const seedOfView = (v: Extract<View, { name: 'mix' }>): MixSeed => ({
  kind: v.kind ?? 'genre',
  value: v.value
})

const MIX_LENGTH = 50
/** Most a single artist may take up in one mix, so a mix never turns into an album. */
const PER_ARTIST = 2
/** An artist mix is *about* its artist, so they get more room; everyone else stays at PER_ARTIST. */
const PER_SEED_ARTIST = 8
/** Albums opened for a mood mix. Each is a request, and 30 albums already overfill a 50-song mix. */
const MOOD_ALBUMS = 30
/** Albums opened for the seed artist of an artist mix, for the same reason. */
const ARTIST_ALBUMS = 5

/** Compilation and placeholder credits make a nonsense artist mix, so they never become seeds. */
const NOT_AN_ARTIST = /^(various(\s+artists)?|va|unknown artist|soundtrack|\[?unknown\]?)$/i

function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Deterministic shuffle: a mix stays put all day and comes back different tomorrow, with nothing
 * stored. Also what picks the covers a tag wears, so those hold still for their own period too.
 */
export function shuffle<T>(items: T[], seed: string): T[] {
  let s = seedOf(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The seed string behind a mix: same mix all day, a different one tomorrow. */
const daySeed = (seed: MixSeed): string => `${seed.kind}:${seed.value}:${new Date().toDateString()}`

/** Drop repeats and cap how much of the list any one artist may take, up to `limit` songs. */
function spread(tracks: Track[], limit = MIX_LENGTH, perArtist = PER_ARTIST): Track[] {
  const seen = new Map<string, number>()
  const ids = new Set<string>()
  const out: Track[] = []
  for (const t of tracks) {
    if (ids.has(t.id)) continue
    const n = seen.get(t.artist) ?? 0
    if (n >= perArtist) continue
    seen.set(t.artist, n + 1)
    ids.add(t.id)
    out.push(t)
    if (out.length === limit) break
  }
  return out
}

/**
 * Deal `lead` evenly through `rest` rather than stacking it up front, so an artist mix opens with
 * its artist and keeps coming back to them instead of drifting away after the first few songs.
 */
function interleave(lead: Track[], rest: Track[], limit = MIX_LENGTH): Track[] {
  if (!lead.length || !rest.length) return [...lead, ...rest].slice(0, limit)
  const step = Math.max(2, Math.floor(limit / lead.length))
  const out: Track[] = []
  let l = 0
  let r = 0
  while (out.length < limit && (l < lead.length || r < rest.length)) {
    if (l < lead.length && out.length % step === 0) out.push(lead[l++])
    else if (r < rest.length) out.push(rest[r++])
    else out.push(lead[l++])
  }
  return out
}

/** Values by how often they show up, most common first. */
function tally(values: (string | undefined)[]): string[] {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value)
}

const sameArtist = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/**
 * What to build mixes from, drawn from your most played albums: their genres, their mood tags and
 * the artists themselves. The kinds are dealt round-robin so the row is a spread rather than six
 * genres, and a kind the library has no tags for simply drops out.
 */
export async function mixSeeds(client: SubsonicClient, count = 6): Promise<MixSeed[]> {
  const albums = await client.getAlbumList2('frequent', 50)
  const byKind: [MixKind, string[]][] = [
    ['genre', tally(albums.map((a) => a.genre))],
    ['mood', tally(albums.flatMap((a) => a.moods ?? []))],
    ['artist', tally(albums.map((a) => a.artist)).filter((n) => !NOT_AN_ARTIST.test(n.trim()))]
  ]
  const out: MixSeed[] = []
  for (let i = 0; out.length < count; i++) {
    const before = out.length
    for (const [kind, values] of byKind) {
      if (values[i] !== undefined && out.length < count) out.push({ kind, value: values[i] })
    }
    if (out.length === before) break // every kind is exhausted
  }
  return out
}

/** Songs off `albums`, capped at `max` albums so one mix never walks the whole library. */
async function songsFrom(client: SubsonicClient, albums: AlbumID3[], max: number, seed: string): Promise<Track[]> {
  const picked = shuffle(albums, seed).slice(0, max)
  const full = await Promise.all(picked.map((a) => client.getAlbum(a.id)))
  return full.flatMap((a) => a.song)
}

/** Albums carrying the mood tag. Subsonic has no mood endpoint, so this is a pass over the list. */
async function moodPool(client: SubsonicClient, mood: string, seed: string): Promise<Track[]> {
  const albums = (await client.getAllAlbums()).filter((a) => a.moods?.includes(mood))
  return songsFrom(client, albums, MOOD_ALBUMS, seed)
}

/**
 * An artist mix: the artist's own songs dealt through songs by others in the genres they work in,
 * which is as close to "similar artists" as a server without Last.fm can get. Falls back to the
 * artist's own catalogue alone when nothing shares their genres.
 */
async function artistMix(client: SubsonicClient, name: string, seed: string): Promise<Track[]> {
  const { artists } = await client.search3(name, { artistCount: 5, albumCount: 0, songCount: 0 })
  const artist = artists.find((a) => sameArtist(a.name, name)) ?? artists[0]
  if (!artist) return []

  const own = await songsFrom(client, (await client.getArtist(artist.id)).album, ARTIST_ALBUMS, seed)
  const genres = tally(own.map((t) => t.genre)).slice(0, 2)
  const pulls = await Promise.all(genres.map((g) => client.getSongsByGenre(g, 300)))
  const neighbours = pulls.flat().filter((t) => !sameArtist(t.artist, artist.name))

  const lead = spread(shuffle(own, seed), PER_SEED_ARTIST, PER_SEED_ARTIST)
  if (!neighbours.length) return spread(shuffle(own, seed), MIX_LENGTH, MIX_LENGTH)
  const rest = spread(shuffle(neighbours, seed), MIX_LENGTH - lead.length)
  return interleave(lead, rest)
}

export async function buildMix(client: SubsonicClient, seed: MixSeed): Promise<Track[]> {
  const day = daySeed(seed)
  if (seed.kind === 'artist') return artistMix(client, seed.value, day)
  const pool =
    seed.kind === 'mood'
      ? await moodPool(client, seed.value, day)
      : await client.getSongsByGenre(seed.value, 500)
  return spread(shuffle(pool, day))
}
