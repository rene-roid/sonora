import { describe, expect, test } from 'bun:test'
import { pushRecent, viewKey, type RecentItem, type Track } from '../src/shared/types'

const album = (id: string): RecentItem => ({ key: viewKey({ name: 'album', id }), title: `Album ${id}`, view: { name: 'album', id } })
const song = (id: string): RecentItem => ({ key: `track:${id}`, title: `Song ${id}`, track: { id } as Track })
const play = (items: RecentItem[], ...entries: RecentItem[]): RecentItem[] =>
  entries.reduce((acc, e) => pushRecent(acc, e), items)

describe('pushRecent', () => {
  test('newest first, no duplicates, capped at 7', () => {
    const items = play([], ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(album))
    expect(items.map((i) => i.title)).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b'].map((c) => `Album ${c}`))
    expect(play(items, album('c'))[0].key).toBe('album:c')
    expect(play(items, album('c'))).toHaveLength(7)
  })

  test('a song and the album it sits on are separate entries', () => {
    const items = play([], album('a'), song('a'))
    expect(items.map((i) => i.key)).toEqual(['track:a', 'album:a'])
  })

  test('unchanged for nothing played or a replay of the newest', () => {
    const items = play([], album('a'))
    expect(pushRecent(items, null)).toBe(items)
    expect(pushRecent(items, album('a'))).toBe(items)
  })
})

describe('viewKey', () => {
  test('one key per page, whatever identifies it', () => {
    expect(viewKey({ name: 'playlist', id: 'p1' })).toBe('playlist:p1')
    expect(viewKey({ name: 'genre', value: 'rock' })).toBe('genre:rock')
    expect(viewKey({ name: 'favorites' })).toBe('favorites')
  })
})
