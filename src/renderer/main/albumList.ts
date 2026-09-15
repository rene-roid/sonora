/**
 * The whole album list, fetched once and shared by everything that has to walk it.
 *
 * Subsonic has no endpoint for moods, and only carries an album's primary genre, so the Moods
 * view, the soundtrack filter, the mood mixes and the covers behind every tag card all work off
 * one pass over the album list instead. That pass is ten paged requests and, once stored, a
 * JSON blob of some megabytes, so this holds the parsed array: opening a page of two hundred
 * genre cards would otherwise parse the whole thing two hundred times over.
 *
 * The parsed copy lives until the account changes, which is the same life the picks it feeds
 * have -- a tag's covers are meant to hold still for hours.
 */
import type { SubsonicClient } from '@shared/subsonic/client'
import type { AlbumID3 } from '@shared/subsonic/types'
import { cacheRead, cacheWrite, onCacheClear } from '@renderer/shared/cache'

export const ALBUMS_KEY = 'albums:all'

let memo: AlbumID3[] | undefined
let job: Promise<AlbumID3[]> | undefined

onCacheClear(() => {
  memo = undefined
  job = undefined
})

/** Every album. Answers from memory, then from the on-disk cache, and only then from the server. */
export function allAlbums(client: SubsonicClient): Promise<AlbumID3[]> {
  if (memo) return Promise.resolve(memo)
  const stored = cacheRead<AlbumID3[]>(ALBUMS_KEY)
  if (stored?.length) {
    memo = stored
    return Promise.resolve(stored)
  }
  // One walk of the library however many callers ask for it while it is still going.
  return (job ??= client
    .getAllAlbums()
    .then((all) => {
      memo = all
      cacheWrite(ALBUMS_KEY, all)
      return all
    })
    .finally(() => {
      job = undefined
    }))
}
