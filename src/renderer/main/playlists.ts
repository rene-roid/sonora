import { create } from 'zustand'
import type { Track } from '@shared/types'

interface PlaylistsState {
  /** Bumped after every change, so the lists watching playlists re-fetch. */
  revision: number
  /** Tracks the open "new playlist" dialog starts with; null while it is closed. */
  draft: Track[] | null
}

export const usePlaylists = create<PlaylistsState>(() => ({ revision: 0, draft: null }))

/** Re-read the revision so a `useAsync` over playlists reloads whenever one is created. */
export function usePlaylistsRevision(): number {
  return usePlaylists((s) => s.revision)
}

export const playlists = {
  /** Open the new-playlist dialog, optionally seeded with the tracks it should start with. */
  newPlaylist(tracks: Track[] = []): void {
    usePlaylists.setState({ draft: tracks })
  },
  closeDialog(): void {
    usePlaylists.setState({ draft: null })
  },
  changed(): void {
    usePlaylists.setState((s) => ({ revision: s.revision + 1 }))
  }
}
