import { useEffect, useState, type DependencyList } from 'react'
import { cacheRead, cacheWrite } from '@renderer/shared/cache'

export interface AsyncState<T> {
  data: T | undefined
  error: string | undefined
  loading: boolean
  reload: () => void
}

/** Retry delay after a failed load, in ms. */
export const RETRY_MS = 5000

interface Cached<T> {
  key: string | undefined
  data: T | undefined
  error: string | undefined
  loading: boolean
}

function fromCache<T>(key: string | undefined): Cached<T> {
  const data = cacheRead<T>(key)
  return { key, data, error: undefined, loading: data === undefined }
}

/**
 * Loads `fn`, showing any cached copy immediately while the network call refreshes it in the
 * background. `key` identifies the cached entry; pass undefined for responses not worth storing.
 */
export function useAsync<T>(
  key: string | undefined,
  fn: () => Promise<T> | undefined,
  deps: DependencyList
): AsyncState<T> {
  const [state, setState] = useState<Cached<T>>(() => fromCache<T>(key))
  const [tick, setTick] = useState(0)

  // Swap to the new key's cached copy during render, so navigating never paints the previous view's data.
  if (state.key !== key) setState(fromCache<T>(key))

  useEffect(() => {
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const p = fn()
    if (!p) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    p.then(
      (d) => {
        if (cancelled) return
        cacheWrite(key, d)
        setState({ key, data: d, error: undefined, loading: false })
      },
      (e: Error) => {
        if (cancelled) return
        // A stale copy on screen beats an error box; the retry below keeps trying either way.
        setState((s) => ({ ...s, error: s.data === undefined ? (e.message ?? String(e)) : undefined, loading: false }))
        retry = setTimeout(() => setTick((t) => t + 1), RETRY_MS)
      }
    )
    return () => {
      cancelled = true
      clearTimeout(retry)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, key, tick])

  return { data: state.data, error: state.error, loading: state.loading, reload: () => setTick((t) => t + 1) }
}
