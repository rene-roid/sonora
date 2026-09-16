import { app, net, protocol } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ART_SCHEME, ART_SIZE, artIdFromUrl } from '@shared/art'
import { SubsonicClient } from '@shared/subsonic/client'
import { loadSession } from './credentials'
import { getSettings } from './store'

/**
 * On-disk cache of cover art, served to the windows over the `sonora-art://` scheme.
 *
 * A window asks for a cover by id and nothing else: main turns that into a server URL from the
 * saved session, downloads it once and answers from the file every time after. That is what makes
 * the mood, genre and mix backgrounds stick -- they are picked from the library, then kept, so
 * they paint instantly on the next launch and survive the server being unreachable.
 *
 * The `artCacheMaxMb` setting is the disk budget; the least recently shown file goes first when it
 * is reached. A budget of 0 turns the cache off, and the windows then load covers off the server.
 */

const MB = 1024 * 1024

function budget(): number {
  return getSettings().artCacheMaxMb * MB
}

/** Bytes written since the last eviction pass. Eviction walks the whole directory, so it waits. */
const EVICT_EVERY = 8 * 1024 * 1024
let sinceEvict = 0

function dir(): string {
  return join(app.getPath('userData'), 'art-cache')
}

/**
 * Keyed per account, so two libraries that reuse the same cover ids never share a file. The scope
 * is the first candidate URL rather than the active one, so failing over keeps the cache warm.
 */
function fileFor(id: string): string {
  const s = loadSession()
  const key = `${s?.servers?.[0] ?? s?.server ?? ''}|${s?.username ?? ''}|${id}`
  return join(dir(), createHash('sha1').update(key).digest('hex'))
}

/** One download per cover, however many cards are asking for it at once. */
const inflight = new Map<string, Promise<string | null>>()

function ensure(id: string): Promise<string | null> {
  if (budget() <= 0) return Promise.resolve(null)
  const running = inflight.get(id)
  if (running) return running
  const job = download(id).finally(() => inflight.delete(id))
  inflight.set(id, job)
  return job
}

async function download(id: string): Promise<string | null> {
  const file = fileFor(id)
  try {
    const now = new Date()
    await utimes(file, now, now) // already here: mark it freshly shown so eviction passes it over
    return file
  } catch {
    // not cached yet; fall through and fetch it
  }
  const session = loadSession()
  if (!session) return null
  try {
    const url = new SubsonicClient(session).coverArtUrl(id, ART_SIZE)
    if (!url) return null
    const res = await net.fetch(url)
    if (!res.ok) return null
    const body = Buffer.from(await res.arrayBuffer())
    if (!body.byteLength) return null
    await mkdir(dir(), { recursive: true })
    // Write beside the final name and rename, so a crash mid-download leaves no half file behind.
    const part = `${file}.part`
    await writeFile(part, body)
    await rename(part, file)
    sinceEvict += body.byteLength
    if (sinceEvict >= EVICT_EVERY) await evict()
    return file
  } catch {
    return null
  }
}

/** Content type off the file's own magic bytes; the server's header is not kept with the file. */
function contentType(b: Buffer): string {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png'
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif'
  if (b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return 'application/octet-stream'
}

/**
 * Must run before `app.whenReady`. `standard` gives the scheme a parseable URL, and the rest let
 * an ordinary page in any of the windows load the images without tripping over origin rules.
 */
export function registerArtScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ART_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
    }
  ])
}

export function registerArtProtocol(): void {
  protocol.handle(ART_SCHEME, async (request) => {
    const id = artIdFromUrl(request.url)
    const file = id ? await ensure(id) : null
    if (!file) return new Response(null, { status: 404 })
    try {
      const body = await readFile(file)
      return new Response(new Uint8Array(body.buffer, body.byteOffset, body.byteLength), {
        headers: { 'content-type': contentType(body), 'cache-control': 'max-age=86400' }
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

type Entry = { file: string; size: number; used: number }

async function entries(): Promise<Entry[]> {
  let names: string[]
  try {
    names = await readdir(dir())
  } catch {
    return [] // no cache directory yet
  }
  const found = await Promise.all(
    names
      .filter((n) => !n.endsWith('.part'))
      .map(async (n) => {
        const file = join(dir(), n)
        try {
          const s = await stat(file)
          return { file, size: s.size, used: s.mtimeMs }
        } catch {
          return null
        }
      })
  )
  return found.filter((e): e is Entry => e !== null)
}

/** Delete the covers shown longest ago until the cache fits the budget. */
export async function evict(): Promise<void> {
  sinceEvict = 0
  const all = await entries()
  const max = budget()
  let total = all.reduce((n, e) => n + e.size, 0)
  for (const e of all.sort((a, b) => a.used - b.used)) {
    if (total <= max) break
    await rm(e.file, { force: true })
    total -= e.size
  }
}

export async function stats(): Promise<{ bytes: number; count: number }> {
  const all = await entries()
  return { bytes: all.reduce((n, e) => n + e.size, 0), count: all.length }
}

export function clear(): Promise<void> {
  sinceEvict = 0
  return rm(dir(), { recursive: true, force: true })
}
