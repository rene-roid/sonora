import { beforeEach, describe, expect, test } from 'bun:test'

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

const { recordRecent, useRecents } = await import('../src/renderer/main/recents')
const keys = (): string[] => useRecents.getState().items.map((i) => i.key)
const visit = (key: string): void => recordRecent({ key, view: { name: 'album', id: key }, title: key })

describe('recents', () => {
  beforeEach(() => useRecents.setState({ items: [] }))

  test('newest first, no duplicates, capped', () => {
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) visit(k)
    expect(keys()).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b'])
    visit('c')
    expect(keys()).toEqual(['c', 'h', 'g', 'f', 'e', 'd', 'b'])
  })

  test('survives a reload', () => {
    visit('a')
    useRecents.setState({ items: [] })
    expect(JSON.parse(store.get('sonora.cache.recents')!)[0].key).toBe('a')
  })
})
