import { useEffect, useState, type DependencyList } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: string | undefined
  loading: boolean
  reload: () => void
}

export function useAsync<T>(fn: () => Promise<T> | undefined, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const p = fn()
    if (!p) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(undefined)
    p.then(
      (d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      },
      (e: Error) => {
        if (cancelled) return
        setError(e.message ?? String(e))
        setLoading(false)
      }
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}
