import { create } from 'zustand'
import {
  initialPlayerState,
  type PlayerCommandName,
  type PlayerCommands,
  type PlayerState,
  type RepeatMode,
  type Track
} from '@shared/types'

/**
 * Zustand mirror of the audio host's state for this window.
 * Call initPlayerBridge() once per window; every component then uses usePlayerState().
 */
export const usePlayerStore = create<PlayerState>(() => ({ ...initialPlayerState }))

let initialised = false

export function initPlayerBridge(): void {
  if (initialised) return
  initialised = true
  const { player } = window.sonora
  const set = usePlayerStore.setState

  void player.getState().then((s) => set({ ...s }))

  player.on('hostReady', ({ ready }) => set({ hostReady: ready }))
  player.on('trackChanged', ({ track, index }) =>
    set({ track, index, position: 0, duration: track?.duration ?? 0 })
  )
  player.on('playStateChanged', ({ playing }) => set({ playing }))
  player.on('positionUpdate', ({ position, duration }) => set({ position, duration }))
  player.on('queueChanged', ({ queue, index }) => set({ queue, index }))
  player.on('volumeChanged', ({ volume, muted }) => set({ volume, muted }))
  player.on('modeChanged', ({ repeat, shuffle }) => set({ repeat, shuffle }))
}

export function usePlayerState(): PlayerState
export function usePlayerState<T>(selector: (s: PlayerState) => T): T
export function usePlayerState<T>(selector?: (s: PlayerState) => T): T | PlayerState {
  return usePlayerStore(selector ?? ((s) => s as unknown as T))
}

function send<K extends PlayerCommandName>(cmd: K, payload?: PlayerCommands[K]): void {
  window.sonora.player.command(cmd, payload)
}

/** Command helpers. Every widget shares these; none of them touch audio directly. */
export const player = {
  play: () => send('play'),
  pause: () => send('pause'),
  toggle: () => send('toggle'),
  next: () => send('next'),
  prev: () => send('prev'),
  stop: () => send('stop'),
  seek: (position: number) => send('seek', { position }),
  setVolume: (volume: number) => send('setVolume', { volume }),
  setMuted: (muted: boolean) => send('setMuted', { muted }),
  setQueue: (tracks: Track[], index = 0, autoplay = true) => send('setQueue', { tracks, index, autoplay }),
  addToQueue: (tracks: Track[], next = false) => send('addToQueue', { tracks, next }),
  playAt: (index: number) => send('playAt', { index }),
  removeFromQueue: (index: number) => send('removeFromQueue', { index }),
  clearQueue: () => send('clearQueue'),
  setRepeat: (repeat: RepeatMode) => send('setRepeat', { repeat }),
  setShuffle: (shuffle: boolean) => send('setShuffle', { shuffle }),
  cycleRepeat: (current: RepeatMode) =>
    send('setRepeat', { repeat: current === 'off' ? 'all' : current === 'all' ? 'one' : 'off' })
}
