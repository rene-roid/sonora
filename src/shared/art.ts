/**
 * Cover art served out of Sonora's own on-disk copy instead of straight off the server.
 *
 * The renderer only ever names a cover id: main derives the server URL from the saved session,
 * downloads the image once and keeps the file, so the backgrounds behind moods, genres and
 * mixes paint from disk on every later launch -- and still paint with the server unreachable.
 */

export const ART_SCHEME = 'sonora-art'

/** The one size the cache stores. Whatever displays a cover scales the same file down. */
export const ART_SIZE = 400

export function localArtUrl(id: string | undefined): string | undefined {
  return id ? `${ART_SCHEME}://art/?id=${encodeURIComponent(id)}` : undefined
}

/** The cover id back out of a `sonora-art://` request; undefined when the URL carries none. */
export function artIdFromUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('id') || undefined
  } catch {
    return undefined
  }
}
