import { useEffect } from 'react'
import { create } from 'zustand'
import { cacheRead, cacheWrite } from '../shared/cache' // relative so bun test can resolve it without the vite alias
import type { View } from './nav'

/** One thing the user opened: album, artist, playlist, genre or mood. */
export interface RecentItem {
  key: string
  view: View
  title: string
  /** Missing for tags (genres/moods), which get a gradient tile instead. */
  coverArt?: string
}

const LIMIT = 7
// ponytail: rides the response cache, so recents are wiped on account switch (wanted) and on a
// quota blowout (harmless). Own storage key if they ever need to outlive the cache.
const KEY = 'recents'

export const useRecents = create<{ items: RecentItem[] }>(() => ({
  items: cacheRead<RecentItem[]>(KEY) ?? []
}))

export function recordRecent(item: RecentItem): void {
  useRecents.setState((s) => {
    if (s.items[0]?.key === item.key) return s
    const items = [item, ...s.items.filter((i) => i.key !== item.key)].slice(0, LIMIT)
    cacheWrite(KEY, items)
    return { items }
  })
}

/** Call from a detail view; `item` is undefined until its data has loaded. */
export function useRecent(item: RecentItem | undefined): void {
  useEffect(() => {
    if (item) recordRecent(item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key])
}
