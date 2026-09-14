import { beforeEach, describe, expect, test } from 'bun:test'
import type { Track } from '../src/shared/types'

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

const { recordPlayed, useRecents } = await import('../src/renderer/main/recents')
const ids = (): string[] => useRecents.getState().items.map((i) => i.id)
const track = (albumId?: string): Track =>
  ({ id: `t-${albumId}`, title: 't', artist: 'a', album: `Album ${albumId}`, albumId, duration: 1 }) as Track

describe('recents', () => {
  beforeEach(() => useRecents.setState({ items: [] }))

  test('newest first, no duplicates, capped', () => {
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) recordPlayed(track(k))
    expect(ids()).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b'])
    recordPlayed(track('c'))
    expect(ids()).toEqual(['c', 'h', 'g', 'f', 'e', 'd', 'b'])
  })

  test('ignores tracks with no album', () => {
    recordPlayed(track(undefined))
    recordPlayed(null)
    expect(ids()).toEqual([])
  })

  test('survives a reload', () => {
    recordPlayed(track('a'))
    useRecents.setState({ items: [] })
    expect(JSON.parse(store.get('sonora.recents')!)[0].id).toBe('a')
  })
})
