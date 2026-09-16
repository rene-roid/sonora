import type { PlayerEventName, PlayerEvents, PlayerState, ResumeState } from './types'

/**
 * Fold one audio-host event into a state mirror. Main keeps one so new windows hydrate instantly;
 * the mobile bridge keeps one because it has no main process. Mutates `state` in place.
 */
export function applyPlayerEvent<K extends PlayerEventName>(state: PlayerState, event: K, payload: PlayerEvents[K]): void {
  switch (event) {
    case 'hostReady':
      state.hostReady = (payload as PlayerEvents['hostReady']).ready
      break
    case 'trackChanged': {
      const p = payload as PlayerEvents['trackChanged']
      state.track = p.track
      state.index = p.index
      state.position = 0
      state.duration = p.track?.duration ?? 0
      break
    }
    case 'playStateChanged':
      state.playing = (payload as PlayerEvents['playStateChanged']).playing
      break
    case 'positionUpdate': {
      const p = payload as PlayerEvents['positionUpdate']
      state.position = p.position
      state.duration = p.duration
      break
    }
    case 'queueChanged': {
      const p = payload as PlayerEvents['queueChanged']
      state.queue = p.queue
      state.index = p.index
      break
    }
    case 'volumeChanged': {
      const p = payload as PlayerEvents['volumeChanged']
      state.volume = p.volume
      state.muted = p.muted
      break
    }
    case 'modeChanged': {
      const p = payload as PlayerEvents['modeChanged']
      state.repeat = p.repeat
      state.shuffle = p.shuffle
      break
    }
  }
}

/**
 * Cheap stand-in for the resume state's identity. Serialising the queue to compare it would walk
 * every track on every checkpoint, and the queue is the one part of it that only ever changes
 * wholesale, so its length and ends identify it well enough to skip an unchanged write.
 */
export function resumeKey(r: ResumeState | null): string {
  if (!r) return ''
  const { queue, index, position } = r
  return `${queue.length}|${queue[0]?.id ?? ''}|${queue[queue.length - 1]?.id ?? ''}|${index}|${Math.round(position)}`
}
