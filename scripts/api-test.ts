/**
 * Phase 1 smoke test: exercise the Subsonic client with no UI.
 *
 *   bun run scripts/api-test.ts --server http://localhost:4533 --user admin --pass secret [--song <id>]
 *
 * Or via env: SONORA_SERVER, SONORA_USER, SONORA_PASS
 */
import { SubsonicClient, credentialsFromPassword, normalizeServerUrl } from '../src/shared/subsonic/client'
import { fromStructuredLyrics } from '../src/shared/lyrics'

function arg(name: string, env: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]
  return process.env[env]
}

const server = arg('server', 'SONORA_SERVER')
const user = arg('user', 'SONORA_USER')
const pass = arg('pass', 'SONORA_PASS')
const songArg = arg('song', 'SONORA_SONG')

if (!server || !user || !pass) {
  console.error('usage: bun run scripts/api-test.ts --server <url> --user <name> --pass <password> [--song <id>]')
  process.exit(1)
}

const session = { server: normalizeServerUrl(server), username: user, ...credentialsFromPassword(pass) }
const client = new SubsonicClient(session)

const t0 = Date.now()
const step = (label: string) => console.log(`\n[${((Date.now() - t0) / 1000).toFixed(2)}s] ${label}`)

step('ping')
const ping = await client.ping()
console.log(`  server=${ping.type ?? '?'} ${ping.serverVersion ?? ''} api=${ping.version} openSubsonic=${ping.openSubsonic ?? false}`)

step('getArtists')
const artists = await client.getArtists()
console.log(`  ${artists.length} artists; first: ${artists.slice(0, 5).map((a) => a.name).join(', ')}`)

step('getAlbumList2 newest')
const albums = await client.getAlbumList2('newest', 5)
for (const a of albums) console.log(`  ${a.name} · ${a.artist ?? '?'} (${a.year ?? 'n/a'}) id=${a.id}`)

step('search3 "a"')
const search = await client.search3('a', { artistCount: 3, albumCount: 3, songCount: 3 })
console.log(`  artists=${search.artists.length} albums=${search.albums.length} songs=${search.songs.length}`)

let songId = songArg
if (!songId && albums[0]) {
  step(`getAlbum ${albums[0].id}`)
  const album = await client.getAlbum(albums[0].id)
  console.log(`  ${album.song.length} songs`)
  songId = album.song[0]?.id
}

if (songId) {
  step(`cover art + stream URL for ${songId}`)
  const album = albums[0]
  console.log(`  coverArt: ${client.coverArtUrl(album?.coverArt ?? album?.id, 200)}`)
  console.log(`  stream:   ${client.streamUrl(songId)}`)

  step('HEAD stream (verifies auth + content-type)')
  const head = await fetch(client.streamUrl(songId), { method: 'HEAD' })
  console.log(`  ${head.status} ${head.headers.get('content-type')} cors=${head.headers.get('access-control-allow-origin') ?? 'none'}`)

  step(`getLyricsBySongId ${songId}`)
  const structured = await client.getLyricsBySongId(songId)
  const lyrics = fromStructuredLyrics(structured)
  if (!lyrics) console.log('  no lyrics')
  else {
    console.log(`  synced=${lyrics.synced} lines=${lyrics.lines.length} lang=${lyrics.lang ?? '?'}`)
    for (const l of lyrics.lines.slice(0, 5)) console.log(`   ${l.time.toFixed(2).padStart(7)}  ${l.text}`)
  }
}

step('done')
