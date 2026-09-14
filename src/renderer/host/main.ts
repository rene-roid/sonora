import { SubsonicClient } from '@shared/subsonic/client'
import type { Session } from '@shared/types'
import { AudioEngine } from './engine'

/**
 * Hidden audio host. This is the only renderer that owns an <audio> element.
 * It receives PlayerCommands from main and broadcasts PlayerEvents back through the preload bridge.
 */

const logEl = document.getElementById('log')!
const lines: string[] = []
function log(msg: string): void {
  lines.push(`${new Date().toLocaleTimeString()} ${msg}`)
  if (lines.length > 40) lines.shift()
  logEl.textContent = lines.join('\n')
}

const { host, auth, settings } = window.sonora

const engine = new AudioEngine((event, payload) => {
  host.emit(event, payload)
  if (event === 'trackChanged') {
    const t = (payload as { track: { title: string; artist: string } | null }).track
    log(t ? `▶ ${t.title} · ${t.artist}` : '■ stopped')
  } else if (event === 'error') {
    log(`⚠ ${(payload as { message: string }).message}`)
  } else if (event === 'positionUpdate') {
    const p = payload as { position: number; duration: number }
    logEl.dataset['pos'] = `${p.position.toFixed(1)}/${p.duration.toFixed(1)}`
  }
})

host.onCommand((cmd, payload) => {
  log(`cmd ${cmd}${payload ? ' ' + JSON.stringify(payload).slice(0, 80) : ''}`)
  engine.handle(cmd, payload)
})

host.onFramesWanted((wanted) => engine.setFramesWanted(wanted))

async function boot(): Promise<void> {
  const s = await settings.get()

  const applySession = (session: Session | null): void => {
    engine.setClient(session ? new SubsonicClient(session) : null)
    log(session ? `session for ${session.username}@${session.server}` : 'no session')
  }
  // The client has to exist before restore(), which loads the saved queue paused at its last position.
  applySession(await auth.getSession())
  engine.restore({ volume: s.volume, muted: s.muted, repeat: s.repeat, shuffle: s.shuffle, resume: s.resume })
  auth.onChange(applySession)

  host.emit('hostReady', { ready: true })
  log('host ready')
}

void boot()
