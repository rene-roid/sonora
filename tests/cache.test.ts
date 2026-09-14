import { beforeEach, describe, expect, test } from 'bun:test'

const store = new Map<string, string>()
let full = false
// Minimal stand-in for the browser API; `full` makes setItem throw the way a blown quota does.
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (full) throw new Error('QuotaExceededError')
    store.set(k, v)
  },
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  }
}

const { cacheRead, cacheWrite, setCacheScope } = await import('../src/renderer/shared/cache')

describe('cache', () => {
  beforeEach(() => {
    store.clear()
    full = false
  })

  test('round-trips a value', () => {
    cacheWrite('albums:newest', [{ id: 'a1' }])
    expect(cacheRead<unknown>('albums:newest')).toEqual([{ id: 'a1' }])
  })

  test('misses on unknown and undefined keys', () => {
    expect(cacheRead('nope')).toBeUndefined()
    expect(cacheRead(undefined)).toBeUndefined()
    cacheWrite(undefined, [1])
    expect(store.size).toBe(0)
  })

  test('survives corrupt entries', () => {
    store.set('sonora.cache.bad', '{not json')
    expect(cacheRead('bad')).toBeUndefined()
  })

  test('drops cached entries when the scope changes, and keeps them when it does not', () => {
    setCacheScope('http://a|bob')
    cacheWrite('artists', [{ id: 'x' }])
    setCacheScope('http://a|bob')
    expect(cacheRead<unknown>('artists')).toEqual([{ id: 'x' }])
    setCacheScope('http://a|alice')
    expect(cacheRead<unknown>('artists')).toBeUndefined()
  })

  test('clears itself when storage is full instead of throwing', () => {
    cacheWrite('artists', [{ id: 'x' }])
    full = true
    expect(() => cacheWrite('albums:newest', [{ id: 'y' }])).not.toThrow()
    expect(cacheRead<unknown>('artists')).toBeUndefined()
  })
})
