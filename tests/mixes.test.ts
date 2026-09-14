import { describe, expect, test } from 'bun:test'
import { SubsonicClient } from '../src/shared/subsonic/client'
import { buildMix, mixSeeds } from '../src/renderer/main/mixes'
import type { Session } from '../src/shared/types'

const session: Session = { server: 'http://s', username: 'u', token: 't', salt: 's' }

/** 90 songs shared between 3 artists, plus frequent albums tagged by genre. */
function fakeFetch(): (url: string) => Promise<Response> {
  return async (url) => {
    const p = new URL(url).searchParams
    const body = url.includes('getSongsByGenre')
      ? {
          songsByGenre: {
            song: Array.from({ length: 90 }, (_, i) => ({
              id: `s${i}`,
              title: `Song ${i}`,
              artist: `Artist ${i % 3}`,
              duration: 100
            }))
          }
        }
      : {
          albumList2: {
            album: [
              { id: 'a1', name: 'A', genre: 'rock' },
              { id: 'a2', name: 'B', genre: 'jazz' },
              { id: 'a3', name: 'C', genre: 'rock' },
              { id: 'a4', name: 'D' }
            ].slice(0, Number(p.get('size')))
          }
        }
    return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', ...body } }))
  }
}

const client = new SubsonicClient(session, fakeFetch())

describe('mixes', () => {
  test('seeds are the genres of the most played albums, most played first', async () => {
    expect(await mixSeeds(client)).toEqual(['rock', 'jazz'])
  })

  test('a mix caps each artist and stays stable within the day', async () => {
    const mix = await buildMix(client, 'rock')
    const perArtist = new Map<string, number>()
    for (const t of mix) perArtist.set(t.artist, (perArtist.get(t.artist) ?? 0) + 1)
    expect([...perArtist.values()].every((n) => n <= 2)).toBe(true)
    expect(mix.length).toBe(6) // 3 artists x 2
    expect(new Set(mix.map((t) => t.id)).size).toBe(mix.length)
    expect((await buildMix(client, 'rock')).map((t) => t.id)).toEqual(mix.map((t) => t.id))
    // A different seed draws a different set from the same pool.
    expect((await buildMix(client, 'jazz')).map((t) => t.id)).not.toEqual(mix.map((t) => t.id))
  })
})
