import { expect, test } from 'bun:test'
import { groupDiscs, isSoundtrack, parseDiscName } from '../src/shared/format'

test('soundtrack genres match, ordinary ones do not', () => {
  for (const g of ['Soundtrack', 'soundtracks', 'Game Soundtrack', 'Sound Track', 'OST', 'Original Score', 'Original Motion Picture Soundtrack', 'Score'])
    expect(isSoundtrack(g)).toBe(true)
  for (const g of [undefined, '', 'Rock', 'Hardcore', 'Post-Rock', 'Jazz', 'Boston'])
    expect(isSoundtrack(g)).toBe(false)
})

test('a soundtrack-y title is enough on its own, even when every genre tag is a plain music style', () => {
  const genres = 'Indie, Jazz, R&B, Piano Ballad, J-Pop, Chiptune, Hyperpop, J-Rock, K-Pop, Synthwave'
  expect(isSoundtrack(genres, 'Stellar Blade - Arrange Tracks (Original Soundtrack)')).toBe(true)
  expect(isSoundtrack(undefined, 'Halo 2 OST')).toBe(true)
  expect(isSoundtrack(genres, 'Stellar Blade - Arrange Tracks')).toBe(false)
})

test('disc suffixes split off the base name', () => {
  const cases: [string, string, number | undefined][] = [
    ['Halo 2 OST (Disc 2)', 'Halo 2 OST', 2],
    ['Final Fantasy X OST CD2', 'Final Fantasy X OST', 2],
    ['Nier Soundtrack - Disc 1', 'Nier Soundtrack', 1],
    ['Nier Soundtrack, Disc 10', 'Nier Soundtrack', 10],
    ['Undertale [CD 1]', 'Undertale', 1],
    ['Undertale', 'Undertale', undefined],
    ['Bravely Default Vol. 2', 'Bravely Default Vol. 2', undefined],
    ['Disc', 'Disc', undefined]
  ]
  for (const [name, base, disc] of cases) expect(parseDiscName(name)).toEqual(disc ? { base, disc } : { base })
})

test('split discs group into one entry, single albums stay alone', () => {
  const albums = [
    { id: '2', name: 'Halo 2 OST (Disc 2)', year: 2004, songCount: 10 },
    { id: '1', name: 'Halo 2 OST (Disc 1)', year: 2004, songCount: 12 },
    { id: '3', name: 'Undertale', year: 2015, songCount: 101 },
    { id: '4', name: 'Halo 2 OST (Disc 1)', year: 1999, songCount: 8 }
  ]
  expect(groupDiscs(albums)).toEqual([
    { album: albums[1], discIds: ['2'] },
    { album: albums[2], discIds: [] },
    { album: albums[3], discIds: [] }
  ])
})

test('same-name albums of one release group, with the biggest one leading', () => {
  // Navidrome splits a release when per-disc artist credits differ; names and year stay identical.
  const albums = [
    { id: 'a', name: 'NieR:Automata OST', year: 2017, songCount: 1 },
    { id: 'b', name: 'NieR:Automata OST', year: 2017, songCount: 44 },
    { id: 'c', name: 'NieR:Automata OST', year: 2017, songCount: 1 }
  ]
  expect(groupDiscs(albums)).toEqual([{ album: albums[1], discIds: ['a', 'c'] }])
})
