/**
 * Minimal OpenSubsonic-compatible mock server for developing Sonora without a Navidrome instance.
 * Serves a tiny synthetic library with generated WAV audio, cover art and synced lyrics.
 *
 *   bun run scripts/mock-server.ts [--port 4599]
 *
 * Any username/password is accepted (auth params are only checked for presence).
 */

const portArg = process.argv.indexOf('--port')
const PORT = portArg !== -1 ? Number(process.argv[portArg + 1]) : 4599

// ---- library ---------------------------------------------------------------

const artists = [
  { id: 'ar1', name: 'Aurora Fields', albumCount: 2 },
  { id: 'ar2', name: 'Blue Static', albumCount: 1 }
]
const albums = [
  { id: 'al1', name: 'Northern Lights', artist: 'Aurora Fields', artistId: 'ar1', year: 2021, genre: 'Ambient', songCount: 3, duration: 36, coverArt: 'al1', created: '2024-01-01T00:00:00Z' },
  { id: 'al2', name: 'Meridian', artist: 'Aurora Fields', artistId: 'ar1', year: 2023, genre: 'Ambient', songCount: 2, duration: 24, coverArt: 'al2', created: '2024-03-01T00:00:00Z' },
  { id: 'al3', name: 'Signal Loss', artist: 'Blue Static', artistId: 'ar2', year: 2019, genre: 'Electronic', songCount: 2, duration: 24, coverArt: 'al3', created: '2024-02-01T00:00:00Z' }
]
const songs = [
  { id: 's1', title: 'Dawn Chorus', albumId: 'al1', track: 1, freq: 220 },
  { id: 's2', title: 'Ice Sheet', albumId: 'al1', track: 2, freq: 277 },
  { id: 's3', title: 'Solar Wind', albumId: 'al1', track: 3, freq: 330 },
  { id: 's4', title: 'Meridian I', albumId: 'al2', track: 1, freq: 392 },
  { id: 's5', title: 'Meridian II', albumId: 'al2', track: 2, freq: 440 },
  { id: 's6', title: 'Carrier', albumId: 'al3', track: 1, freq: 494 },
  { id: 's7', title: 'Static Bloom', albumId: 'al3', track: 2, freq: 523 }
].map((s) => {
  const album = albums.find((a) => a.id === s.albumId)!
  return {
    id: s.id,
    title: s.title,
    album: album.name,
    albumId: album.id,
    artist: album.artist,
    artistId: album.artistId,
    track: s.track,
    year: album.year,
    genre: album.genre,
    coverArt: album.id,
    duration: 12,
    bitRate: 1411,
    suffix: 'wav',
    contentType: 'audio/wav',
    isDir: false,
    type: 'music',
    freq: s.freq
  }
})
const playlists = [{ id: 'pl1', name: 'Focus', owner: 'admin', public: true, songCount: 3, duration: 36, entry: ['s1', 's4', 's6'] }]

// ---- audio: 12s WAV with a gentle pulse so the visualiser has something to show -------------

function wav(freq: number, seconds = 12, rate = 22050): Uint8Array {
  const n = seconds * rate
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const env = 0.5 + 0.5 * Math.max(0, Math.sin(t * Math.PI * 2 * 2)) // 2 beats/sec
    const s = Math.sin(t * Math.PI * 2 * freq) * 0.5 + Math.sin(t * Math.PI * 2 * freq * 2.01) * 0.2
    v.setInt16(44 + i * 2, Math.round(s * env * 0.6 * 32767), true)
  }
  return new Uint8Array(buf)
}

// ---- cover art: solid colour PNG per album --------------------------------------------------

import { deflateSync } from 'node:zlib'
function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size: number, rgb: [number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = y * (size * 3 + 1) + 1 + x * 3
      const shade = 0.6 + 0.4 * (1 - (x + y) / (2 * size))
      raw[o] = rgb[0] * shade
      raw[o + 1] = rgb[1] * shade
      raw[o + 2] = rgb[2] * shade
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0))
  ])
}
const covers: Record<string, Buffer> = {
  al1: png(300, [40, 120, 200]),
  al2: png(300, [200, 90, 60]),
  al3: png(300, [70, 170, 110]),
  ar1: png(300, [120, 80, 180]),
  ar2: png(300, [180, 160, 60])
}

// ---- lyrics ----------------------------------------------------------------------------------

function lyricsFor(song: (typeof songs)[number]) {
  const words = ['Under the', 'northern sky', 'we wait for', 'the light to', 'come back home', 'one more time']
  return {
    lang: 'eng',
    synced: true,
    displayArtist: song.artist,
    displayTitle: song.title,
    offset: 0,
    line: words.map((w, i) => ({ start: i * 1800 + 500, value: `${w} (${song.title})` }))
  }
}

// ---- server ----------------------------------------------------------------------------------

const ok = (body: Record<string, unknown> = {}) =>
  Response.json({ 'subsonic-response': { status: 'ok', version: '1.16.1', type: 'sonora-mock', serverVersion: '0.1', openSubsonic: true, ...body } })
const fail = (code: number, message: string) =>
  Response.json({ 'subsonic-response': { status: 'failed', version: '1.16.1', error: { code, message } } })
const song = (id: string) => songs.find((s) => s.id === id)
const strip = (s: (typeof songs)[number]) => {
  const { freq: _f, ...rest } = s
  return rest
}
const cors = { 'Access-Control-Allow-Origin': '*' }

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)
    const m = url.pathname.match(/^\/rest\/(\w+)(?:\.view)?$/)
    if (!m) return new Response('not found', { status: 404 })
    const method = m[1]
    const q = url.searchParams
    if (!q.get('u') || !(q.get('t') || q.get('p'))) return fail(10, 'Required parameter is missing.')
    if (q.get('u') === 'bad') return fail(40, 'Wrong username or password.')

    const respond = (): Response => {
      switch (method) {
        case 'ping':
          return ok()
        case 'getArtists':
          return ok({ artists: { ignoredArticles: 'The', index: [{ name: 'A', artist: [artists[0]] }, { name: 'B', artist: [artists[1]] }] } })
        case 'getArtist': {
          const a = artists.find((x) => x.id === q.get('id'))
          if (!a) return fail(70, 'Artist not found')
          return ok({ artist: { ...a, album: albums.filter((al) => al.artistId === a.id) } })
        }
        case 'getAlbum': {
          const a = albums.find((x) => x.id === q.get('id'))
          if (!a) return fail(70, 'Album not found')
          return ok({ album: { ...a, song: songs.filter((s) => s.albumId === a.id).map(strip) } })
        }
        case 'getAlbumList2': {
          const type = q.get('type')
          const list = [...albums]
          if (type === 'newest') list.sort((a, b) => b.created.localeCompare(a.created))
          if (type === 'alphabeticalByName') list.sort((a, b) => a.name.localeCompare(b.name))
          if (type === 'random') list.sort(() => Math.random() - 0.5)
          const offset = Number(q.get('offset') ?? 0)
          const size = Number(q.get('size') ?? 10)
          return ok({ albumList2: { album: list.slice(offset, offset + size) } })
        }
        case 'getRandomSongs':
          return ok({ randomSongs: { song: [...songs].sort(() => Math.random() - 0.5).slice(0, Number(q.get('size') ?? 10)).map(strip) } })
        case 'getGenres': {
          const counts = new Map<string, number>()
          for (const s of songs) if (s.genre) counts.set(s.genre, (counts.get(s.genre) ?? 0) + 1)
          return ok({ genres: { genre: [...counts].map(([value, songCount]) => ({ value, songCount })) } })
        }
        case 'getSongsByGenre':
          return ok({ songsByGenre: { song: songs.filter((s) => s.genre === q.get('genre')).map(strip) } })
        case 'getStarred2':
          return ok({ starred2: { artist: [], album: [albums[0]], song: [strip(songs[0])] } })
        case 'search3': {
          const query = (q.get('query') ?? '').toLowerCase().replace(/"/g, '')
          const has = (s: string) => !query || s.toLowerCase().includes(query)
          return ok({
            searchResult3: {
              artist: artists.filter((a) => has(a.name)),
              album: albums.filter((a) => has(a.name) || has(a.artist)),
              song: songs.filter((s) => has(s.title) || has(s.artist) || has(s.album)).map(strip)
            }
          })
        }
        case 'getPlaylists':
          return ok({ playlists: { playlist: playlists.map(({ entry: _e, ...p }) => p) } })
        case 'getPlaylist': {
          const p = playlists.find((x) => x.id === q.get('id'))
          if (!p) return fail(70, 'Playlist not found')
          return ok({ playlist: { ...p, entry: p.entry.map((id) => strip(song(id)!)) } })
        }
        case 'scrobble':
        case 'star':
        case 'unstar':
          return ok()
        case 'getLyricsBySongId': {
          const s = song(q.get('id') ?? '')
          if (!s) return fail(70, 'Song not found')
          return ok({ lyricsList: { structuredLyrics: [lyricsFor(s)] } })
        }
        case 'getLyrics':
          return ok({ lyrics: {} })
        case 'getCoverArt': {
          const id = q.get('id') ?? ''
          const buf = covers[id] ?? covers[song(id)?.albumId ?? ''] ?? covers.al1
          return new Response(buf as unknown as BodyInit, { headers: { "content-type": "image/png", ...cors } })
        }
        case 'stream':
        case 'download': {
          const s = song(q.get('id') ?? '')
          if (!s) return fail(70, 'Song not found')
          const body = wav(s.freq)
          if (req.method === 'HEAD') return new Response(null, { headers: { 'content-type': 'audio/wav', 'content-length': String(body.length), ...cors } })
          return new Response(body as unknown as BodyInit, { headers: { "content-type": "audio/wav", "accept-ranges": "bytes", ...cors } })
        }
        default:
          return fail(0, `Unsupported method ${method}`)
      }
    }
    const res = respond()
    res.headers.set('Access-Control-Allow-Origin', '*')
    return res
  }
})

console.log(`Sonora mock Subsonic server on http://localhost:${PORT}  (any user/password; user "bad" fails auth)`)
