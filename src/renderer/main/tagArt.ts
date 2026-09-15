/**
 * The covers a mood, a genre or a mix wears behind its name.
 *
 * None of these are things the server has artwork for, so each one borrows a few covers from the
 * music actually inside it. The pick is deterministic from the tag and a rotation period, so a
 * card holds still for hours and then quietly turns over; it is written to the local cache as
 * well, which is what lets Home's shelf draw a mood tile without loading the moods page first.
 * The images themselves are kept on disk by the main process behind `sonora-art://`.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { SubsonicClient } from '@shared/subsonic/client'
import type { AlbumID3 } from '@shared/subsonic/types'
import type { View } from '@shared/types'
import { cacheRead, cacheWrite, onCacheClear } from '@renderer/shared/cache'
import { useClient } from '@renderer/shared/sessionStore'
import { shuffle, seedOfView, type MixSeed } from './mixes'

/** Which of the three looks draws the background. A mix is styled as a mix whatever it is seeded from. */
export type ArtStyle = 'mood' | 'genre' | 'mix'

/** A background: the style that draws it, and the tag whose music the covers come from. */
export interface ArtRef {
  style: ArtStyle
  seed: MixSeed
}

/**
 * How long a background holds still before a new set of covers is rolled. Mixes turn over daily
 * because their track list does; a library's moods and genres move far more slowly than that.
 */
const ROTATE_MS: Record<ArtStyle, number> = {
  mood: 12 * 60 * 60 * 1000,
  genre: 24 * 60 * 60 * 1000,
  mix: 24 * 60 * 60 * 1000
}

/** How many covers each style draws. */
export const ART_COUNT: Record<ArtStyle, number> = { mood: 1, genre: 4, mix: 3 }

/** Covers considered for a tag. Past this the pick is plenty varied and the sort is wasted work. */
const POOL = 120

/** Backgrounds resolved at once, so opening a page of 200 genres does not stampede the server. */
const MAX_PARALLEL = 4

/** A rolled pick. `epoch` is the rotation slot it was rolled for; a different one means re-roll. */
interface Pick {
  ids: string[]
  epoch: number
}

export const artKey = ({ style, seed }: ArtRef): string => `${style}|${seed.kind}|${seed.value.toLowerCase()}`

const epochOf = (style: ArtStyle): number => Math.floor(Date.now() / ROTATE_MS[style])

/** The background behind a shelf tile, or null for a view that has real artwork of its own. */
export function artRefOf(view: View | undefined): ArtRef | null {
  switch (view?.name) {
    case 'mood':
      return { style: 'mood', seed: { kind: 'mood', value: view.value } }
    case 'genre':
      return { style: 'genre', seed: { kind: 'genre', value: view.value } }
    case 'mix':
      return { style: 'mix', seed: seedOfView(view) }
    default:
      return null
  }
}

// ---- the store -------------------------------------------------------------

/** Mirror of what is in the cache, so a render does not parse JSON and identities stay stable. */
const memo = new Map<string, Pick>()
const listeners = new Set<() => void>()
/** Bumped when the account changes, so a resolve started for the old library throws its result away. */
let generation = 0

onCacheClear(() => {
  generation++
  memo.clear()
  albumsJob = undefined
  inflight.clear()
  for (const fn of listeners) fn()
})

function read(key: string): Pick | undefined {
  const hit = memo.get(key)
  if (hit) return hit
  const stored = cacheRead<Pick>(`tagArt:${key}`)
  if (stored) memo.set(key, stored)
  return stored
}

function write(key: string, pick: Pick): void {
  memo.set(key, pick)
  cacheWrite(`tagArt:${key}`, pick)
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---- picking ---------------------------------------------------------------

const coversOf = (items: { id: string; coverArt?: string }[]): string[] =>
  [...new Set(items.map((i) => i.coverArt ?? i.id))].slice(0, POOL)

/**
 * The whole album list, shared with the Moods view under the same cache key so the two never
 * fetch it twice. Every mood and most genres are answered out of this one pass.
 */
const ALBUMS_KEY = 'albums:all'
let albumsJob: Promise<AlbumID3[]> | undefined

function albums(client: SubsonicClient): Promise<AlbumID3[]> {
  const cached = cacheRead<AlbumID3[]>(ALBUMS_KEY)
  if (cached?.length) return Promise.resolve(cached)
  const job = (albumsJob ??= client
    .getAllAlbums()
    .then((all) => {
      cacheWrite(ALBUMS_KEY, all)
      return all
    })
    .finally(() => {
      albumsJob = undefined
    }))
  return job
}

async function candidates(client: SubsonicClient, seed: MixSeed): Promise<string[]> {
  const want = seed.value.toLowerCase()
  if (seed.kind === 'mood') {
    return coversOf((await albums(client)).filter((a) => a.moods?.some((m) => m.toLowerCase() === want)))
  }
  if (seed.kind === 'artist') {
    const { artists } = await client.search3(seed.value, { artistCount: 5, albumCount: 0, songCount: 0 })
    const artist = artists.find((a) => a.name.toLowerCase() === want) ?? artists[0]
    return artist ? coversOf((await client.getArtist(artist.id)).album) : []
  }
  // A genre's albums come out of the list pass above; only a genre that is no album's primary
  // genre -- which is the one thing that list does not carry -- costs a request of its own.
  const tagged = coversOf((await albums(client)).filter((a) => a.genre?.toLowerCase() === want))
  return tagged.length ? tagged : coversOf(await client.getSongsByGenre(seed.value, POOL))
}

// ---- resolving -------------------------------------------------------------

const inflight = new Set<string>()
let active = 0
const waiting: (() => void)[] = []

function gate(job: () => Promise<void>): void {
  const run = (): void => {
    active++
    void job().finally(() => {
      active--
      waiting.shift()?.()
    })
  }
  if (active < MAX_PARALLEL) run()
  else waiting.push(run)
}

function resolve(client: SubsonicClient, ref: ArtRef, key: string): void {
  if (inflight.has(key)) return
  inflight.add(key)
  const started = generation
  gate(async () => {
    try {
      const pool = await candidates(client, ref.seed)
      const epoch = epochOf(ref.style)
      if (started !== generation) return // logged into another library while this was in flight
      // An empty pool is still worth writing: it stops every render retrying a tag with no art.
      write(key, { ids: shuffle(pool, `${key}:${epoch}`).slice(0, ART_COUNT[ref.style]), epoch })
    } catch {
      // Leave whatever is on screen alone; the next time the card mounts it tries again.
    } finally {
      inflight.delete(key)
    }
  })
}

/**
 * Cover ids for a background. Returns the stored pick straight away, even a stale one, and rolls
 * a fresh set in the background when the rotation period has moved on.
 */
export function useTagArt(ref: ArtRef): string[] {
  const client = useClient()
  const key = artKey(ref)
  const pick = useSyncExternalStore(subscribe, () => read(key))

  const { style, seed } = ref
  useEffect(() => {
    if (!client) return
    const current = read(key)
    if (!current || current.epoch !== epochOf(style)) resolve(client, { style, seed }, key)
    // The ref object is rebuilt on every render, so depend on the parts it is made of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, style, seed.kind, seed.value])

  return pick?.ids ?? []
}
