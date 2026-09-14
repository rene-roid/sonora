/**
 * Tiny localStorage cache for server responses, so a view paints from disk instantly
 * and the network call only has to refresh it.
 */

const PREFIX = 'sonora.cache.'
const SCOPE_KEY = 'sonora.cacheScope'

function clear(): void {
  // Backwards, because removing an entry shifts every index above it down.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) localStorage.removeItem(k)
  }
}

/** Wipe everything when the logged-in server/user changes, so one account never sees another's library. */
export function setCacheScope(scope: string): void {
  if (localStorage.getItem(SCOPE_KEY) === scope) return
  clear()
  // ponytail: wipes the stored play history, but a live account switch leaves the in-memory list
  // until reload. Give recents a reset hook if that ever shows.
  localStorage.removeItem('sonora.recents')
  localStorage.setItem(SCOPE_KEY, scope)
}

export function cacheRead<T>(key: string | undefined): T | undefined {
  if (!key) return undefined
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

export function cacheWrite(key: string | undefined, value: unknown): void {
  if (!key) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // ponytail: quota blown -> drop everything, it refills on the next load. Per-entry LRU if that starts thrashing.
    clear()
  }
}
