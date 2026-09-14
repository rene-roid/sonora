import type { PlayerCommandName, PlayerCommands, PlayerEvents, RepeatMode, Track } from '@shared/types'
import type { SubsonicClient } from '@shared/subsonic/client'
import { clamp } from '@shared/format'

type Emit = <K extends keyof PlayerEvents>(event: K, payload: PlayerEvents[K]) => void

const POSITION_INTERVAL_MS = 250
const FRAME_INTERVAL_MS = 1000 / 30
const FRAME_BINS = 48

/**
 * The single owner of the <audio> element. Runs inside the hidden audio-host window.
 * Everything else in the app talks to it through PlayerCommands and listens to PlayerEvents.
 */
export class AudioEngine {
  private readonly audio = new Audio()
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private analyserData = new Uint8Array(0)
  private readonly bins = new Uint8Array(FRAME_BINS)

  private client: SubsonicClient | null = null
  private queue: Track[] = []
  /** Pre-shuffle order so shuffle can be turned off losslessly. */
  private unshuffled: Track[] | null = null
  private index = -1
  private repeat: RepeatMode = 'off'
  private shuffle = false

  private positionTimer: number | undefined
  private frameTimer: number | undefined
  private framesWanted = false
  private consecutiveErrors = 0
  private scrobbleSubmitted = false

  constructor(private readonly emit: Emit) {
    const a = this.audio
    a.crossOrigin = 'anonymous'
    a.preload = 'auto'
    a.volume = 0.8

    a.addEventListener('play', () => {
      void this.ctx?.resume()
      this.emit('playStateChanged', { playing: true })
      this.startTimers()
    })
    a.addEventListener('pause', () => {
      this.emit('playStateChanged', { playing: false })
      this.stopPositionTimer()
      this.emitPosition()
    })
    a.addEventListener('ended', () => this.onEnded())
    a.addEventListener('durationchange', () => this.emitPosition())
    a.addEventListener('seeked', () => this.emitPosition())
    a.addEventListener('playing', () => {
      this.consecutiveErrors = 0
    })
    a.addEventListener('timeupdate', () => this.maybeScrobble())
    a.addEventListener('error', () => {
      const code = a.error?.code
      const track = this.current
      this.emit('error', { message: `Playback error${code ? ` (code ${code})` : ''}: ${track?.title ?? 'unknown track'}` })
      this.consecutiveErrors += 1
      if (this.consecutiveErrors < Math.min(this.queue.length, 5)) {
        window.setTimeout(() => this.next(true), 400)
      } else {
        this.emit('playStateChanged', { playing: false })
      }
    })
  }

  // ---- wiring ---------------------------------------------------------------

  setClient(client: SubsonicClient | null): void {
    this.client = client
    if (!client) this.handle('stop', undefined)
  }

  setFramesWanted(wanted: boolean): void {
    this.framesWanted = wanted
    if (wanted && !this.audio.paused) this.startFrameTimer()
    if (!wanted) this.stopFrameTimer()
  }

  restore(opts: { volume: number; muted: boolean; repeat: RepeatMode; shuffle: boolean }): void {
    this.audio.volume = clamp(opts.volume, 0, 1)
    this.audio.muted = opts.muted
    this.repeat = opts.repeat
    this.shuffle = opts.shuffle
    this.emit('volumeChanged', { volume: this.audio.volume, muted: this.audio.muted })
    this.emit('modeChanged', { repeat: this.repeat, shuffle: this.shuffle })
  }

  get current(): Track | null {
    return this.queue[this.index] ?? null
  }

  // ---- commands ---------------------------------------------------------------

  handle<K extends PlayerCommandName>(cmd: K, payload: PlayerCommands[K]): void {
    switch (cmd) {
      case 'play':
        if (!this.audio.src && this.queue.length) this.load(Math.max(this.index, 0), true)
        else void this.safePlay()
        break
      case 'pause':
        this.audio.pause()
        break
      case 'toggle':
        if (this.audio.paused) this.handle('play', undefined)
        else this.audio.pause()
        break
      case 'next':
        this.next(true)
        break
      case 'prev':
        this.prev()
        break
      case 'stop':
        this.stop()
        break
      case 'seek': {
        const { position } = payload as PlayerCommands['seek']
        const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : this.current?.duration ?? 0
        this.audio.currentTime = clamp(position, 0, Math.max(0, dur - 0.25))
        this.emitPosition()
        break
      }
      case 'setVolume': {
        const { volume } = payload as PlayerCommands['setVolume']
        this.audio.volume = clamp(volume, 0, 1)
        if (this.audio.volume > 0 && this.audio.muted) this.audio.muted = false
        this.emit('volumeChanged', { volume: this.audio.volume, muted: this.audio.muted })
        break
      }
      case 'setMuted': {
        this.audio.muted = (payload as PlayerCommands['setMuted']).muted
        this.emit('volumeChanged', { volume: this.audio.volume, muted: this.audio.muted })
        break
      }
      case 'setQueue': {
        const { tracks, index = 0, autoplay = true } = payload as PlayerCommands['setQueue']
        this.unshuffled = null
        this.queue = [...tracks]
        if (this.shuffle && this.queue.length > 1) {
          this.unshuffled = [...this.queue]
          this.queue = shuffleKeepingFirst(this.queue, index)
          this.index = 0
        } else {
          this.index = clamp(index, 0, Math.max(0, this.queue.length - 1))
        }
        this.emitQueue()
        if (this.queue.length) this.load(this.index, autoplay)
        else this.stop()
        break
      }
      case 'addToQueue': {
        const { tracks, next = false } = payload as PlayerCommands['addToQueue']
        if (!tracks.length) break
        const wasEmpty = this.queue.length === 0
        if (next && this.index >= 0) this.queue.splice(this.index + 1, 0, ...tracks)
        else this.queue.push(...tracks)
        if (this.unshuffled) this.unshuffled.push(...tracks)
        this.emitQueue()
        if (wasEmpty) this.load(0, true)
        break
      }
      case 'playAt': {
        const { index } = payload as PlayerCommands['playAt']
        if (index >= 0 && index < this.queue.length) this.load(index, true)
        break
      }
      case 'removeFromQueue': {
        const { index } = payload as PlayerCommands['removeFromQueue']
        if (index < 0 || index >= this.queue.length) break
        const [removed] = this.queue.splice(index, 1)
        if (this.unshuffled) this.unshuffled = this.unshuffled.filter((t) => t !== removed)
        if (index === this.index) {
          if (this.queue.length === 0) this.stop()
          else this.load(Math.min(index, this.queue.length - 1), !this.audio.paused)
        } else if (index < this.index) {
          this.index -= 1
        }
        this.emitQueue()
        break
      }
      case 'clearQueue':
        this.stop()
        break
      case 'setRepeat':
        this.repeat = (payload as PlayerCommands['setRepeat']).repeat
        this.emit('modeChanged', { repeat: this.repeat, shuffle: this.shuffle })
        break
      case 'setShuffle': {
        const { shuffle } = payload as PlayerCommands['setShuffle']
        if (shuffle === this.shuffle) break
        this.shuffle = shuffle
        const cur = this.current
        if (shuffle) {
          this.unshuffled = [...this.queue]
          this.queue = shuffleKeepingFirst(this.queue, this.index)
          this.index = cur ? 0 : -1
        } else if (this.unshuffled) {
          this.queue = this.unshuffled
          this.unshuffled = null
          this.index = cur ? this.queue.indexOf(cur) : -1
        }
        this.emit('modeChanged', { repeat: this.repeat, shuffle: this.shuffle })
        this.emitQueue()
        break
      }
    }
  }

  // ---- internals ----------------------------------------------------------------

  private ensureGraph(): void {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
      const source = this.ctx.createMediaElementSource(this.audio)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.75
      this.analyserData = new Uint8Array(this.analyser.frequencyBinCount)
      source.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    } catch (err) {
      console.error('[engine] Web Audio graph failed; playing without visualiser', err)
      this.ctx = null
      this.analyser = null
    }
  }

  private load(index: number, autoplay: boolean): void {
    const track = this.queue[index]
    if (!track || !this.client) return
    this.ensureGraph()
    this.index = index
    this.scrobbleSubmitted = false
    this.audio.src = this.client.streamUrl(track.id)
    this.audio.load()
    this.emit('trackChanged', { track, index })
    this.emit('positionUpdate', { position: 0, duration: track.duration })
    void this.client.scrobble(track.id, false).catch(() => undefined)
    if (autoplay) void this.safePlay()
  }

  private async safePlay(): Promise<void> {
    try {
      await this.ctx?.resume()
      await this.audio.play()
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') {
        this.emit('error', { message: `Could not start playback: ${(err as Error).message}` })
      }
    }
  }

  private stop(): void {
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.queue = []
    this.unshuffled = null
    this.index = -1
    this.stopTimers()
    this.emitQueue()
    this.emit('trackChanged', { track: null, index: -1 })
    this.emit('positionUpdate', { position: 0, duration: 0 })
    this.emit('playStateChanged', { playing: false })
  }

  private next(userInitiated: boolean): void {
    if (!this.queue.length) return
    let nextIndex = this.index + 1
    if (nextIndex >= this.queue.length) {
      if (this.repeat === 'all' || userInitiated) nextIndex = 0
      else {
        this.audio.pause()
        this.audio.currentTime = 0
        this.emitPosition()
        return
      }
    }
    const shouldPlay = userInitiated ? !this.audio.paused || this.audio.ended || this.audio.currentTime === 0 : true
    this.load(nextIndex, shouldPlay)
  }

  private prev(): void {
    if (!this.queue.length) return
    if (this.audio.currentTime > 3 || this.index <= 0) {
      this.audio.currentTime = 0
      this.emitPosition()
      if (this.index <= 0 && this.audio.currentTime <= 3 && this.repeat === 'all' && this.queue.length > 1) {
        this.load(this.queue.length - 1, !this.audio.paused)
      }
      return
    }
    this.load(this.index - 1, !this.audio.paused)
  }

  private onEnded(): void {
    this.submitScrobble()
    if (this.repeat === 'one') {
      this.audio.currentTime = 0
      void this.safePlay()
      return
    }
    this.next(false)
  }

  private maybeScrobble(): void {
    if (this.scrobbleSubmitted) return
    const dur = this.audio.duration
    if (!Number.isFinite(dur) || dur <= 0) return
    const t = this.audio.currentTime
    // Last.fm rule: half the track or 4 minutes, whichever comes first (tracks > 30s only).
    if (dur > 30 && (t >= dur / 2 || t >= 240)) this.submitScrobble()
  }

  private submitScrobble(): void {
    if (this.scrobbleSubmitted) return
    const track = this.current
    if (!track || !this.client) return
    this.scrobbleSubmitted = true
    void this.client.scrobble(track.id, true).catch(() => undefined)
  }

  private emitQueue(): void {
    this.emit('queueChanged', { queue: this.queue, index: this.index })
  }

  private emitPosition(): void {
    const duration = Number.isFinite(this.audio.duration) && this.audio.duration > 0
      ? this.audio.duration
      : this.current?.duration ?? 0
    this.emit('positionUpdate', { position: this.audio.currentTime, duration })
  }

  private emitFrame(): void {
    if (!this.analyser) return
    this.analyser.getByteFrequencyData(this.analyserData)
    // Keep the musically interesting lower ~75% of the spectrum and bucket it into FRAME_BINS.
    const usable = Math.floor(this.analyserData.length * 0.75)
    const per = usable / FRAME_BINS
    let sum = 0
    for (let i = 0; i < FRAME_BINS; i++) {
      const start = Math.floor(i * per)
      const end = Math.max(start + 1, Math.floor((i + 1) * per))
      let acc = 0
      for (let j = start; j < end; j++) acc += this.analyserData[j]
      const v = acc / (end - start)
      this.bins[i] = v
      sum += v
    }
    this.emit('audioFrame', { bins: this.bins, level: sum / (FRAME_BINS * 255) })
  }

  private startTimers(): void {
    this.stopPositionTimer()
    this.positionTimer = window.setInterval(() => this.emitPosition(), POSITION_INTERVAL_MS)
    if (this.framesWanted) this.startFrameTimer()
  }

  private startFrameTimer(): void {
    if (this.frameTimer !== undefined) return
    this.frameTimer = window.setInterval(() => this.emitFrame(), FRAME_INTERVAL_MS)
  }

  private stopPositionTimer(): void {
    if (this.positionTimer !== undefined) window.clearInterval(this.positionTimer)
    this.positionTimer = undefined
    // Let the visualiser decay for a moment after pausing, then stop streaming frames.
    window.setTimeout(() => {
      if (this.audio.paused) this.stopFrameTimer()
    }, 600)
  }

  private stopFrameTimer(): void {
    if (this.frameTimer !== undefined) window.clearInterval(this.frameTimer)
    this.frameTimer = undefined
  }

  private stopTimers(): void {
    this.stopPositionTimer()
    this.stopFrameTimer()
  }
}

function shuffleKeepingFirst(tracks: Track[], firstIndex: number): Track[] {
  const rest = tracks.filter((_, i) => i !== firstIndex)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  const first = tracks[firstIndex]
  return first ? [first, ...rest] : rest
}
