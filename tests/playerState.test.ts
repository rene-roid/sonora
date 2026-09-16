import { describe, expect, test } from 'bun:test'
import { applyPlayerEvent, resumeKey } from '../src/shared/playerState'
import { initialPlayerState, type Track } from '../src/shared/types'

const t = (id: string): Track => ({ id, title: id, artist: 'A', album: 'B', duration: 120 })

describe('applyPlayerEvent', () => {
  test('trackChanged resets position and takes the track duration', () => {
    const s = { ...initialPlayerState, position: 50 }
    applyPlayerEvent(s, 'trackChanged', { track: t('x'), index: 2 })
    expect(s).toMatchObject({ track: t('x'), index: 2, position: 0, duration: 120 })
  })

  test('queue, volume and mode events land in their fields', () => {
    const s = { ...initialPlayerState }
    applyPlayerEvent(s, 'queueChanged', { queue: [t('a'), t('b')], index: 1 })
    applyPlayerEvent(s, 'volumeChanged', { volume: 0.3, muted: true })
    applyPlayerEvent(s, 'modeChanged', { repeat: 'one', shuffle: true })
    applyPlayerEvent(s, 'hostReady', { ready: true })
    expect(s).toMatchObject({ index: 1, volume: 0.3, muted: true, repeat: 'one', shuffle: true, hostReady: true })
    expect(s.queue).toHaveLength(2)
  })
})

describe('resumeKey', () => {
  test('is stable across sub-second position drift and empty when nothing to resume', () => {
    const q = [t('a'), t('b')]
    expect(resumeKey({ queue: q, index: 0, position: 10.2 })).toBe(resumeKey({ queue: q, index: 0, position: 10.4 }))
    expect(resumeKey({ queue: q, index: 0, position: 10 })).not.toBe(resumeKey({ queue: q, index: 1, position: 10 }))
    expect(resumeKey(null)).toBe('')
  })
})
