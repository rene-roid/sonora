import { describe, expect, test } from 'bun:test'
import { pushRecent, type RecentAlbum, type Track } from '../src/shared/types'

const track = (albumId?: string): Track =>
  ({ id: `t-${albumId}`, title: 't', artist: 'a', album: `Album ${albumId}`, albumId, duration: 1 }) as Track
const play = (items: RecentAlbum[], ...albumIds: string[]): RecentAlbum[] =>
  albumIds.reduce((acc, id) => pushRecent(acc, track(id)), items)

describe('pushRecent', () => {
  test('newest first, no duplicates, capped at 7', () => {
    const items = play([], 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h')
    expect(items.map((i) => i.id)).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b'])
    expect(play(items, 'c').map((i) => i.id)).toEqual(['c', 'h', 'g', 'f', 'e', 'd', 'b'])
  })

  test('keeps the album title and cover for the tile', () => {
    expect(play([], 'a')[0]).toMatchObject({ id: 'a', title: 'Album a', artist: 'a' })
  })

  test('unchanged for no track, no album, or a replay of the newest', () => {
    const items = play([], 'a')
    expect(pushRecent(items, null)).toBe(items)
    expect(pushRecent(items, track(undefined))).toBe(items)
    expect(pushRecent(items, track('a'))).toBe(items)
  })
})
