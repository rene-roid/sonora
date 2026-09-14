import { describe, expect, test } from 'bun:test'
import { activeLineIndex, fromStructuredLyrics, parseLrc, parseLyricsText, parseSrt } from '../src/shared/lyrics'

describe('parseLrc', () => {
  test('parses timestamps, offset and metadata', () => {
    const lrc = ['[ar:Someone]', '[offset:-200]', '[00:01.50]first', '[00:05.000][00:20.00]repeat', '[01:02]minute'].join('\n')
    const l = parseLrc(lrc)
    expect(l.synced).toBe(true)
    expect(l.offset).toBe(-200)
    expect(l.lines.map((x) => [Number(x.time.toFixed(2)), x.text])).toEqual([
      [1.5, 'first'],
      [5, 'repeat'],
      [20, 'repeat'],
      [62, 'minute']
    ])
  })

  test('falls back to unsynced when no timestamps', () => {
    const l = parseLyricsText('line one\nline two')
    expect(l.synced).toBe(false)
    expect(l.lines.length).toBe(2)
  })
})

describe('parseSrt', () => {
  test('uses cue start times', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:01:00,500 --> 00:01:02,000\nWorld\n'
    const l = parseLyricsText(srt)
    expect(l.synced).toBe(true)
    expect(l.lines).toEqual([
      { time: 1, text: 'Hello' },
      { time: 60.5, text: 'World' }
    ])
    expect(parseSrt(srt).lines.length).toBe(2)
  })
})

describe('fromStructuredLyrics', () => {
  test('prefers synced entry and converts ms to seconds', () => {
    const l = fromStructuredLyrics([
      { synced: false, line: [{ value: 'plain' }] },
      { synced: true, lang: 'eng', line: [{ start: 2500, value: 'b' }, { start: 500, value: 'a' }] }
    ])
    expect(l?.synced).toBe(true)
    expect(l?.lines).toEqual([
      { time: 0.5, text: 'a' },
      { time: 2.5, text: 'b' }
    ])
  })
})

describe('activeLineIndex', () => {
  const lyrics = parseLrc('[00:01.00]a\n[00:02.00]b\n[00:03.00]c')
  test('binary search picks the last line at or before position', () => {
    expect(activeLineIndex(lyrics, 0.5)).toBe(-1)
    expect(activeLineIndex(lyrics, 1)).toBe(0)
    expect(activeLineIndex(lyrics, 2.99)).toBe(1)
    expect(activeLineIndex(lyrics, 10)).toBe(2)
  })
  test('applies offset', () => {
    expect(activeLineIndex({ ...lyrics, offset: 1000 }, 0.5)).toBe(0)
  })
})
