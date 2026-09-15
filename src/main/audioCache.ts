import { app } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadSession } from './credentials'
import { getSettings } from './store'

/**
 * On-disk cache of played songs, kept under the configured budget by deleting the
 * least recently played file first. The audio host streams from the server immediately
 * and swaps over to the cached copy once it lands.
 */

const GB = 1024 ** 3

function dir(): string {
  return join(app.getPath('userData'), 'audio-cache')
}

/** Keyed per account, so two libraries that reuse the same track ids never share a file. */
function fileFor(id: string): string {
  const key = `${loadSession()?.username ?? ''}|${id}`
  return join(dir(), createHash('sha1').update(key).digest('hex'))
}

function budget(): number {
  return getSettings().cacheMaxGb * GB
}

/**
 * Bytes written since the last eviction pass. Eviction stats every file in the cache, which for a
 * multi-gigabyte budget is thousands of them, so it waits until enough has landed to be worth it
 * rather than running after every single track. The wait is a slice of the budget, capped, so the
 * overshoot it allows stays proportional however small the budget is set.
 */
const EVICT_EVERY_MAX = 256 * 1024 * 1024
let sinceEvict = 0

function evictEvery(): number {
  return Math.min(EVICT_EVERY_MAX, Math.max(16 * 1024 * 1024, budget() / 16))
}

/** One download per track, however many windows ask for it. */
const inflight = new Map<string, Promise<string | null>>()

function ensure(id: string, url: string): Promise<string | null> {
  if (budget() <= 0) return Promise.resolve(null)
  const running = inflight.get(id)
  if (running) return running
  const job = download(id, url).finally(() => inflight.delete(id))
  inflight.set(id, job)
  return job
}

async function download(id: string, url: string): Promise<string | null> {
  const file = fileFor(id)
  try {
    const now = new Date()
    await utimes(file, now, now) // already here: mark it freshly used so eviction passes it over
    return file
  } catch {
    // not cached yet; fall through and fetch it
  }
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const body = Buffer.from(await res.arrayBuffer())
    if (body.byteLength > budget()) return null // one song bigger than the whole budget
    await mkdir(dir(), { recursive: true })
    // Write beside the final name and rename, so a crash mid-download leaves no half file behind.
    const part = `${file}.part`
    await writeFile(part, body)
    await rename(part, file)
    sinceEvict += body.byteLength
    if (sinceEvict >= evictEvery()) await evict()
    return file
  } catch {
    return null
  }
}

/** Bytes of the cached copy, downloading it first if needed. Null when caching is off or it failed. */
export async function bytes(id: string, url: string): Promise<Buffer | null> {
  const file = await ensure(id, url)
  if (!file) return null
  try {
    return await readFile(file)
  } catch {
    return null
  }
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

/** Delete the oldest files until the cache fits the budget. Also runs when the budget is lowered. */
export async function evict(): Promise<void> {
  sinceEvict = 0
  const max = budget()
  const all = await entries()
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
