import { describe, expect, test } from 'bun:test'
import { SubsonicClient } from '../src/shared/subsonic/client'
import { filterTracks } from '../src/shared/format'
import type { Session, Track } from '../src/shared/types'

const session: Session = { server: 'http://s', username: 'u', token: 't', salt: 's' }

/** Serves `total` albums in pages, so getAllAlbums has something to page through. */
function albumFetch(total: number, seen: number[] = []): (url: string) => Promise<Response> {
  return async (url) => {
    const p = new URL(url).searchParams
    const offset = Number(p.get('offset'))
    seen.push(offset)
    const size = Number(p.get('size'))
    const album = Array.from({ length: Math.max(0, Math.min(size, total - offset)) }, (_, i) => ({
      id: `al${offset + i}`,
      name: `Album ${offset + i}`,
      moods: (offset + i) % 2 === 0 ? ['calm'] : []
    }))
    return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', albumList2: { album } } }))
  }
}

describe('getAllAlbums', () => {
  test('pages until a short page ends the list', async () => {
    const seen: number[] = []
    const albums = await new SubsonicClient(session, albumFetch(1200, seen)).getAllAlbums()
    expect(albums.length).toBe(1200)
    expect(seen).toEqual([0, 500, 1000])
    expect(albums.filter((a) => a.moods?.includes('calm')).length).toBe(600)
  })

  test('a library that is an exact multiple of the page size still terminates', async () => {
    const albums = await new SubsonicClient(session, albumFetch(1000)).getAllAlbums()
    expect(albums.length).toBe(1000)
  })

  test('stops at max even when the server keeps serving full pages', async () => {
    const albums = await new SubsonicClient(session, albumFetch(10_000)).getAllAlbums(600)
    expect(albums.length).toBe(1000) // the page that crosses max is kept whole
  })
})

describe('filterTracks', () => {
  const track = (title: string, artist: string, album: string): Track =>
    ({ id: title, title, artist, album, duration: 1 }) as Track
  const tracks = [track('Dawn Chorus', 'Aurora Fields', 'Northern Lights'), track('Carrier', 'Blue Static', 'Signal Loss')]

  test('matches title, artist or album, case-insensitively', () => {
    expect(filterTracks(tracks, 'dawn').map((t) => t.id)).toEqual(['Dawn Chorus'])
    expect(filterTracks(tracks, 'BLUE').map((t) => t.id)).toEqual(['Carrier'])
    expect(filterTracks(tracks, 'signal').map((t) => t.id)).toEqual(['Carrier'])
  })

  test('a blank query keeps everything', () => {
    expect(filterTracks(tracks, '   ').length).toBe(2)
    expect(filterTracks(tracks, 'nope').length).toBe(0)
  })
})

describe('updatePlaylist', () => {
  test('multi-valued params are repeated, not joined', async () => {
    let url = ''
    const client = new SubsonicClient(session, async (u) => {
      url = u
      return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok' } }))
    })
    await client.updatePlaylist('pl1', { songIdToAdd: ['a', 'b'], songIndexToRemove: [0, 3] })
    const p = new URL(url).searchParams
    expect(p.get('playlistId')).toBe('pl1')
    expect(p.getAll('songIdToAdd')).toEqual(['a', 'b'])
    expect(p.getAll('songIndexToRemove')).toEqual(['0', '3'])
  })

  test('removing the first entry still sends index 0', async () => {
    let url = ''
    const client = new SubsonicClient(session, async (u) => {
      url = u
      return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok' } }))
    })
    await client.updatePlaylist('pl1', { songIndexToRemove: [0] })
    expect(new URL(url).searchParams.getAll('songIndexToRemove')).toEqual(['0'])
  })
})

describe('createPlaylist', () => {
  const ok = (body: object): Response => new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', ...body } }))

  test('sends the seed songs and returns the id the server reports', async () => {
    let url = ''
    const client = new SubsonicClient(session, async (u) => {
      url = u
      return ok({ playlist: { id: 'pl9', name: 'Road trip' } })
    })
    expect(await client.createPlaylist('Road trip', ['a', 'b'])).toBe('pl9')
    const p = new URL(url).searchParams
    expect(p.get('name')).toBe('Road trip')
    expect(p.getAll('songId')).toEqual(['a', 'b'])
  })

  test('a server that answers with a bare ok is resolved by name, newest first', async () => {
    const client = new SubsonicClient(session, async (u) =>
      u.includes('getPlaylists')
        ? ok({
            playlists: {
              playlist: [
                { id: 'old', name: 'Road trip', created: '2024-01-01T00:00:00Z' },
                { id: 'new', name: 'Road trip', created: '2026-01-01T00:00:00Z' },
                { id: 'other', name: 'Chill', created: '2026-06-01T00:00:00Z' }
              ]
            }
          })
        : ok({})
    )
    expect(await client.createPlaylist('Road trip')).toBe('new')
  })

  test('throws when the server neither reports nor lists the new playlist', async () => {
    const client = new SubsonicClient(session, async (u) =>
      u.includes('getPlaylists') ? ok({ playlists: {} }) : ok({})
    )
    expect(client.createPlaylist('Road trip')).rejects.toThrow('Road trip')
  })
})
