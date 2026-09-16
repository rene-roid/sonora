import { create } from 'zustand'
import type { View } from '@shared/types'

export type { View }


interface NavState {
  history: View[]
  cursor: number
  view: View
  showQueue: boolean
  showLyrics: boolean
  /** Phone-only full-screen player. */
  showFullPlayer: boolean
}

export const useNav = create<NavState>(() => ({
  history: [{ name: 'home' }],
  cursor: 0,
  view: { name: 'home' },
  showQueue: false,
  showLyrics: false,
  showFullPlayer: false
}))

export const nav = {
  go(view: View): void {
    useNav.setState((s) => {
      const history = [...s.history.slice(0, s.cursor + 1), view]
      return { history, cursor: history.length - 1, view, showLyrics: false, showFullPlayer: false }
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
  // Queue and lyrics sit under the full-screen player, so opening either closes it.
  toggleQueue(): void {
    useNav.setState((s) => ({ showQueue: !s.showQueue, showFullPlayer: false }))
  },
  toggleLyrics(): void {
    useNav.setState((s) => ({ showLyrics: !s.showLyrics, showFullPlayer: false }))
  },
  toggleFullPlayer(): void {
    useNav.setState((s) => ({ showFullPlayer: !s.showFullPlayer }))
  }
}
