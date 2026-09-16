import { describe, expect, test } from 'bun:test'
import { SubsonicClient } from '../src/shared/subsonic/client'
import { buildMix, mixSeeds, seedOfView } from '../src/renderer/main/mixes'
import { saveMix, type SavedMix, type Session, type Track } from '../src/shared/types'

const session: Session = { server: 'http://s', username: 'u', token: 't', salt: 's' }

/** The most played albums: between them they carry genres, mood tags and artist credits. */
const FREQUENT = [
  { id: 'a1', name: 'A', artist: 'Nova', genre: 'indie', moods: ['chill', 'warm'] },
  { id: 'a2', name: 'B', artist: 'Various Artists', genre: 'jazz', moods: ['chill'] },
  { id: 'a3', name: 'C', artist: 'Kite', genre: 'indie' },
  { id: 'a4', name: 'D' }
]

const song = (id: string, artist: string, genre?: string): Record<string, unknown> => ({
  id,
  title: `Song ${id}`,
  artist,
  genre,
  duration: 100
})

/**
 * A small library: the albums above, two albums of the seed artist's own ("Nova", ids n1/n2), and
 * a genre pull of 90 songs. "indie" is spread over 45 artists so an artist mix can fill up from
 * it, while "rock" and "jazz" have only 3, which is what pins down the per-artist cap below.
 */
function fakeFetch(): (url: string) => Promise<Response> {
  return async (url) => {
    const method = new URL(url).pathname.split('/').pop()
    const p = new URL(url).searchParams
    let body: Record<string, unknown>
    if (method === 'getSongsByGenre') {
      const genre = p.get('genre') ?? ''
      const artists = genre === 'indie' ? 45 : 3
      body = {
        songsByGenre: { song: Array.from({ length: 90 }, (_, i) => song(`g${i}`, `Artist ${i % artists}`, genre)) }
      }
    } else if (method === 'search3') {
      body = { searchResult3: { artist: [{ id: 'nova', name: 'Nova' }] } }
    } else if (method === 'getArtist') {
      body = { artist: { id: 'nova', name: 'Nova', album: [{ id: 'n1', name: 'One' }, { id: 'n2', name: 'Two' }] } }
    } else if (method === 'getAlbum') {
      const id = p.get('id') ?? ''
      const own = id.startsWith('n') // the seed artist's own records; the rest are compilations
      body = {
        album: {
          id,
          name: id,
          song: Array.from({ length: 10 }, (_, i) =>
            song(`${id}-${i}`, own ? 'Nova' : `${id}#${i % 5}`, 'indie')
          )
        }
      }
    } else if (p.get('type') === 'alphabeticalByName') {
      // getAllAlbums pages until a short page comes back; one page is the whole library here.
      body = { albumList2: { album: Number(p.get('offset')) ? [] : FREQUENT } }
    } else {
      body = { albumList2: { album: FREQUENT.slice(0, Number(p.get('size'))) } }
    }
    return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', ...body } }))
  }
}

const client = new SubsonicClient(session, fakeFetch())

const ids = (tracks: { id: string }[]): string[] => tracks.map((t) => t.id)

function countByArtist(tracks: { artist: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of tracks) counts.set(t.artist, (counts.get(t.artist) ?? 0) + 1)
  return counts
}

describe('mix seeds', () => {
  test('are the genres, moods and artists of the most played albums, dealt round-robin', async () => {
    expect(await mixSeeds(client)).toEqual([
      { kind: 'genre', value: 'indie' },
      { kind: 'mood', value: 'chill' },
      { kind: 'artist', value: 'Nova' },
      { kind: 'genre', value: 'jazz' },
      { kind: 'mood', value: 'warm' },
      { kind: 'artist', value: 'Kite' }
    ])
  })

  test('kinds take turns, so one well-tagged kind cannot fill the whole row', async () => {
    expect((await mixSeeds(client, 4)).map((s) => s.kind)).toEqual(['genre', 'mood', 'artist', 'genre'])
  })

  test('stops once every kind is exhausted, and never seeds off a compilation credit', async () => {
    const seeds = await mixSeeds(client, 20)
    expect(seeds.length).toBe(6)
    expect(seeds.filter((s) => s.kind === 'artist').map((s) => s.value)).toEqual(['Nova', 'Kite'])
  })
})

describe('genre mixes', () => {
  test('cap each artist and stay stable within the day', async () => {
    const mix = await buildMix(client, { kind: 'genre', value: 'rock' })
    expect([...countByArtist(mix).values()].every((n) => n <= 2)).toBe(true)
    expect(mix.length).toBe(6) // 3 artists x 2
    expect(new Set(ids(mix)).size).toBe(mix.length)
    expect(ids(await buildMix(client, { kind: 'genre', value: 'rock' }))).toEqual(ids(mix))
    // A different seed draws a different set from the same pool.
    expect(ids(await buildMix(client, { kind: 'genre', value: 'jazz' }))).not.toEqual(ids(mix))
  })
})

describe('mood mixes', () => {
  test('draw only from the albums carrying the tag', async () => {
    const mix = await buildMix(client, { kind: 'mood', value: 'chill' })
    // a1 and a2 are the "chill" albums; 5 artists each, capped at 2 songs apiece.
    expect(mix.length).toBe(20)
    expect(mix.every((t) => t.id.startsWith('a1-') || t.id.startsWith('a2-'))).toBe(true)
    expect([...countByArtist(mix).values()].every((n) => n <= 2)).toBe(true)
    expect(ids(await buildMix(client, { kind: 'mood', value: 'chill' }))).toEqual(ids(mix))
  })

  test('a mood is its own seed, not the genre of the same name', async () => {
    const asMood = await buildMix(client, { kind: 'mood', value: 'warm' })
    const asGenre = await buildMix(client, { kind: 'genre', value: 'warm' })
    expect(ids(asMood)).not.toEqual(ids(asGenre))
  })

  test('a mood no album carries yields an empty mix rather than a random one', async () => {
    expect(await buildMix(client, { kind: 'mood', value: 'nonesuch' })).toEqual([])
  })
})

describe('artist mixes', () => {
  test('lead with the seed artist and deal them through songs by others', async () => {
    const mix = await buildMix(client, { kind: 'artist', value: 'Nova' })
    expect(mix.length).toBe(50)
    expect(new Set(ids(mix)).size).toBe(mix.length)
    expect(mix[0].artist).toBe('Nova')

    const own = mix.filter((t) => t.artist === 'Nova')
    // The seed artist gets more room than the 2-song cap, but never takes over the mix.
    expect(own.length).toBe(8)
    // Their songs are dealt through the mix, not stacked at the front.
    expect(mix.slice(0, 8).filter((t) => t.artist === 'Nova').length).toBeLessThan(own.length)
    expect(mix.slice(25).some((t) => t.artist === 'Nova')).toBe(true)

    // Everyone else still obeys the per-artist cap.
    const others = countByArtist(mix.filter((t) => t.artist !== 'Nova'))
    expect([...others.values()].every((n) => n <= 2)).toBe(true)
    expect(others.size).toBeGreaterThan(10)
  })

  test('stay stable within the day', async () => {
    const mix = await buildMix(client, { kind: 'artist', value: 'Nova' })
    expect(ids(await buildMix(client, { kind: 'artist', value: 'Nova' }))).toEqual(ids(mix))
  })

  test('an artist the server does not know yields an empty mix', async () => {
    const empty = new SubsonicClient(
      session,
      async () => new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', searchResult3: {} } }))
    )
    expect(await buildMix(empty, { kind: 'artist', value: 'Ghost' })).toEqual([])
  })
})

describe('seedOfView', () => {
  test('reads a mix view, defaulting views persisted before mixes had kinds to genre', () => {
    expect(seedOfView({ name: 'mix', value: 'rock' })).toEqual({ kind: 'genre', value: 'rock' })
    expect(seedOfView({ name: 'mix', kind: 'mood', value: 'chill' })).toEqual({ kind: 'mood', value: 'chill' })
  })
})

describe('saveMix', () => {
  const mix = (id: string): SavedMix => ({
    id,
    title: `${id} Mix`,
    seed: { kind: 'genre', value: id },
    savedAt: 0,
    tracks: [{ id: 't1' } as Track]
  })
  const keep = (...ids: string[]): SavedMix[] => ids.reduce((acc, id) => saveMix(acc, mix(id)), [] as SavedMix[])

  test('newest first and capped at 24', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `m${i}`)
    const kept = keep(...ids)
    expect(kept).toHaveLength(24)
    expect(kept[0].id).toBe('m29')
    expect(kept.at(-1)!.id).toBe('m6')
  })

  test('saving the same mix again replaces its entry instead of duplicating it', () => {
    const kept = saveMix(keep('a', 'b'), { ...mix('a'), savedAt: 5 })
    expect(kept.map((m) => m.id)).toEqual(['a', 'b'])
    expect(kept[0].savedAt).toBe(5)
  })
})
