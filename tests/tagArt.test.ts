import { expect, test } from 'bun:test'
import { SubsonicClient } from '../src/shared/subsonic/client'
import type { Session } from '../src/shared/types'

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  }
}

const { candidates } = await import('../src/renderer/main/tagArt')
const { shuffle } = await import('../src/renderer/main/mixes')

/** 300 albums, all tagged "chill", named so that alphabetical order is also index order. */
const ALBUMS = Array.from({ length: 300 }, (_, i) => ({
  id: `a${i}`,
  name: `Album ${String(i).padStart(3, '0')}`,
  coverArt: `c${i}`,
  genre: 'ambient',
  moods: ['chill']
}))

const client = new SubsonicClient({ server: 'http://s', username: 'u', token: 't', salt: 's' } as Session, async (url) => {
  const p = new URL(url).searchParams
  const offset = Number(p.get('offset') ?? 0)
  const body = { albumList2: { album: ALBUMS.slice(offset, offset + 500) } }
  return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', ...body } }))
})

test('a tag draws on all its music, not the alphabetical front of it', async () => {
  const pool = await candidates(client, { kind: 'mood', value: 'Chill' })
  expect(pool).toHaveLength(300)

  // What the covers actually end up being: the tail of the library has to turn up across rolls.
  const picks = Array.from({ length: 40 }, (_, i) => shuffle(pool, `mood|mood|chill:${i}`)[0])
  expect(picks.some((id) => ALBUMS.slice(200).some((a) => a.coverArt === id))).toBe(true)
})
