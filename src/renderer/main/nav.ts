import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | { name: 'albums' }
  | { name: 'artists' }
  | { name: 'genres' }
  | { name: 'genre'; value: string }
  | { name: 'moods' }
  | { name: 'mood'; value: string }
  | { name: 'mix'; value: string }
  | { name: 'artist'; id: string }
  | { name: 'album'; id: string }
  | { name: 'playlist'; id: string }
  | { name: 'search'; query: string }
  | { name: 'favorites' }
  | { name: 'settings' }

interface NavState {
  history: View[]
  cursor: number
  view: View
  showQueue: boolean
  showLyrics: boolean
}

export const useNav = create<NavState>(() => ({
  history: [{ name: 'home' }],
  cursor: 0,
  view: { name: 'home' },
  showQueue: false,
  showLyrics: false
}))

export const nav = {
  go(view: View): void {
    useNav.setState((s) => {
      const history = [...s.history.slice(0, s.cursor + 1), view]
      return { history, cursor: history.length - 1, view, showLyrics: false }
    })
  },
  back(): void {
    useNav.setState((s) => {
      if (s.cursor === 0) return s
      const cursor = s.cursor - 1
      return { cursor, view: s.history[cursor], showLyrics: false }
    })
  },
  forward(): void {
    useNav.setState((s) => {
      if (s.cursor >= s.history.length - 1) return s
      const cursor = s.cursor + 1
      return { cursor, view: s.history[cursor], showLyrics: false }
    })
  },
  toggleQueue(): void {
    useNav.setState((s) => ({ showQueue: !s.showQueue }))
  },
  toggleLyrics(): void {
    useNav.setState((s) => ({ showLyrics: !s.showLyrics }))
  }
}
