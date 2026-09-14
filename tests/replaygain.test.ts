import { describe, expect, test } from 'bun:test'
import { replayGainFactor } from '../src/shared/types'

const loud = { track: -8, album: -6, trackPeak: 0.99, albumPeak: 0.99 }
const quiet = { track: 6, album: 5, trackPeak: 0.3, albumPeak: 0.35 }

describe('replayGainFactor', () => {
  test('off never touches the signal', () => {
    expect(replayGainFactor(loud, 'off')).toBe(1)
    expect(replayGainFactor(quiet, 'off')).toBe(1)
  })

  test('untagged tracks play unchanged', () => {
    expect(replayGainFactor(undefined, 'album')).toBe(1)
    expect(replayGainFactor({}, 'track')).toBe(1)
  })

  test('attenuates loud masters and boosts quiet ones', () => {
    expect(replayGainFactor(loud, 'track')).toBeCloseTo(10 ** (-8 / 20), 6)
    expect(replayGainFactor(quiet, 'track')).toBeCloseTo(10 ** (6 / 20), 6)
  })

  test('album mode uses album values, and falls back to track for loose songs', () => {
    expect(replayGainFactor(loud, 'album')).toBeCloseTo(10 ** (-6 / 20), 6)
    expect(replayGainFactor({ track: -4, trackPeak: 0.9 }, 'album')).toBeCloseTo(10 ** (-4 / 20), 6)
  })

  test('boost is capped so a peak can never clip', () => {
    const factor = replayGainFactor({ track: 12, trackPeak: 0.8 }, 'track')
    expect(factor).toBeCloseTo(1 / 0.8, 6)
    expect(factor * 0.8).toBeLessThanOrEqual(1)
  })

  test('with no peak known, only attenuation is applied', () => {
    expect(replayGainFactor({ track: 6 }, 'track')).toBe(1)
    expect(replayGainFactor({ track: -6 }, 'track')).toBeCloseTo(10 ** (-6 / 20), 6)
  })

  test('server fallback gain covers tracks with no tags of their own', () => {
    expect(replayGainFactor({ fallback: -3 }, 'album')).toBeCloseTo(10 ** (-3 / 20), 6)
  })
})
