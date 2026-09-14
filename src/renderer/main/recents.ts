import { create } from 'zustand'
import type { Track } from '../../shared/types' // relative so bun test can resolve it without the vite alias

/** An album the user actually listened to. */
export interface RecentItem {
  id: string
  title: string
  artist?: string
  coverArt?: string
}

const LIMIT = 7
// Own key rather than the response cache, so play history survives a cache wipe.
// setCacheScope() still deletes it when the account changes.
const KEY = 'sonora.recents'

function load(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentItem[]
  } catch {
    return []
  }
}

export const useRecents = create<{ items: RecentItem[] }>(() => ({ items: load() }))

/** Call whenever a track starts playing: its album becomes the newest recent. */
export function recordPlayed(track: Track | null | undefined): void {
  if (!track?.albumId) return
  const item: RecentItem = {
    id: track.albumId,
    title: track.album,
    artist: track.artist,
    coverArt: track.coverArt
  }
  useRecents.setState((s) => {
    if (s.items[0]?.id === item.id) return s
    const items = [item, ...s.items.filter((i) => i.id !== item.id)].slice(0, LIMIT)
    try {
      localStorage.setItem(KEY, JSON.stringify(items))
    } catch {
      // Storage full: the list still works for this session.
    }
    return { items }
  })
}
