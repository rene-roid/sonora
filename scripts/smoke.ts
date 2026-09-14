/**
 * End-to-end smoke test driven over the Chrome DevTools Protocol.
 *
 * 1. Start the mock server:   bun run scripts/mock-server.ts
 * 2. Start Sonora with CDP:    bun run build && ./node_modules/.bin/electron . --remote-debugging-port=9222
 *    (sign in to http://localhost:4599 with any username/password)
 * 3. Run this script:          bun run scripts/smoke.ts
 *
 * It queues random songs from the main window, then verifies through a *different* window
 * (the taskbar widget) that the shared player state reports playback and advancing position,
 * which proves the host -> main -> subscribers IPC path.
 */

export {}

const CDP = process.env.SONORA_CDP ?? "http://127.0.0.1:9222"
const SERVER = process.env.SONORA_SERVER ?? "http://localhost:4599"
const USER = process.env.SONORA_USER ?? "admin"
const PASS = process.env.SONORA_PASS ?? "secret"
const KEEP = process.argv.includes("--keep")

interface Target {
  id: string
  title: string
  url: string
  webSocketDebuggerUrl: string
}

async function targets(): Promise<Target[]> {
  const res = await fetch(`${CDP}/json/list`)
  return (await res.json()) as Target[]
}

class Page {
  private ws!: WebSocket
  private seq = 0
  private pending = new Map<number, (v: unknown) => void>()

  static async connect(t: Target): Promise<Page> {
    const p = new Page()
    p.ws = new WebSocket(t.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      p.ws.onopen = () => resolve()
      p.ws.onerror = (e) => reject(e)
    })
    p.ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: unknown }
      if (msg.id && p.pending.has(msg.id)) {
        p.pending.get(msg.id)!(msg.error ? { error: msg.error } : msg.result)
        p.pending.delete(msg.id)
      }
    }
    return p
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.seq
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve) => this.pending.set(id, resolve))
  }

  async eval<T>(expression: string): Promise<T> {
    const r = (await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
      result?: { value: T }
      exceptionDetails?: { text: string; exception?: { description?: string } }
      error?: unknown
    }
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    if (r.error) throw new Error(JSON.stringify(r.error))
    return r.result!.value
  }

  close(): void {
    this.ws.close()
  }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`ASSERT: ${msg}`)
  console.log(`  ok  ${msg}`)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const all = await targets()
const find = (name: string) => all.find((t) => t.url.includes(`/${name}/index.html`))
const mainT = find('main')
const widgetT = find('widget')
const hostT = find('host')
const toastT = find('toast')
assert(mainT, 'main window target found')
assert(hostT, 'audio host target found')
assert(widgetT, 'taskbar widget target found')
assert(toastT, 'toast window target found')

const main = await Page.connect(mainT!)
const widget = await Page.connect(widgetT!)
const host = await Page.connect(hostT!)

let session = await main.eval<{ server: string; username: string } | null>("window.sonora.auth.getSession()")
let signedInHere = false
if (!session) {
  session = await main.eval(`window.sonora.auth.login(${JSON.stringify({ server: SERVER, username: USER, password: PASS })})`)
  signedInHere = true
  await sleep(800)
}
assert(session, `signed-in session (${session?.username}@${session?.server})`)

const hostState = await main.eval<{ hostReady: boolean }>('window.sonora.player.getState()')
assert(hostState.hostReady, 'audio host reported ready')

// Queue random songs straight through the bridge API (no UI clicks needed).
await main.eval(`(async () => {
  const s = await window.sonora.auth.getSession()
  const p = new URLSearchParams({ u: s.username, t: s.token, s: s.salt, v: '1.16.1', c: 'smoke', f: 'json', size: '5' })
  const r = await fetch(s.server + '/rest/getRandomSongs?' + p).then(r => r.json())
  const songs = r['subsonic-response'].randomSongs.song.map(c => ({
    id: c.id, title: c.title, artist: c.artist, artistId: c.artistId, album: c.album, albumId: c.albumId,
    duration: c.duration || 0, coverArt: c.coverArt || c.albumId
  }))
  window.sonora.player.command('setQueue', { tracks: songs, index: 0, autoplay: true })
  return songs.length
})()`)

await sleep(2500)
const s1 = await widget.eval<{ playing: boolean; position: number; track: { title: string } | null; queue: unknown[] }>(
  'window.sonora.player.getState()'
)
assert(s1.track, `widget sees current track "${s1.track?.title}"`)
assert(s1.playing, 'widget sees playing=true')
assert(s1.queue.length === 5, 'queue has 5 tracks')
const p1 = s1.position
await sleep(1500)
const s2 = await widget.eval<{ position: number }>('window.sonora.player.getState()')
assert(s2.position > p1, `position advances (${p1.toFixed(2)} -> ${s2.position.toFixed(2)})`)

const hostLog = await host.eval<string>('document.getElementById("log").textContent')
assert(/▶ /.test(hostLog), 'host log shows a track started')

// Live frame stream: subscribe from the main window and count frames for a second.
const frames = await main.eval<number>(`new Promise((resolve) => {
  let n = 0
  window.sonora.player.wantFrames(true)
  const off = window.sonora.player.on('audioFrame', ({ bins, level }) => { if (bins && bins.length) n++ })
  setTimeout(() => { off(); window.sonora.player.wantFrames(false); resolve(n) }, 1000)
})`)
assert(frames >= 10, `received ${frames} audioFrame events in 1s (expected ~30)`)

// Commands from a widget window reach the host.
await widget.eval('window.sonora.player.command("pause")')
await sleep(400)
const s3 = await main.eval<{ playing: boolean }>('window.sonora.player.getState()')
assert(!s3.playing, 'pause from widget reflected in main window')

await widget.eval('window.sonora.player.command("next")')
await sleep(800)
const s4 = await main.eval<{ index: number; playing: boolean; track: { title: string } }>('window.sonora.player.getState()')
assert(s4.index === 1, `next from widget advanced to index 1 ("${s4.track?.title}")`)

// Seek and check that lyrics parsing works for the current track.
const lyricsLines = await main.eval<number>(`(async () => {
  const s = await window.sonora.auth.getSession()
  const st = await window.sonora.player.getState()
  const p = new URLSearchParams({ u: s.username, t: s.token, s: s.salt, v: '1.16.1', c: 'smoke', f: 'json', id: st.track.id })
  const r = await fetch(s.server + '/rest/getLyricsBySongId?' + p).then(r => r.json())
  return (r['subsonic-response'].lyricsList.structuredLyrics?.[0]?.line ?? []).length
})()`)
assert(lyricsLines > 0, `server returned ${lyricsLines} synced lyric lines for the current track`)

await main.eval('window.sonora.player.command("stop")')
await sleep(300)
const s5 = await main.eval<{ track: unknown; queue: unknown[] }>('window.sonora.player.getState()')
assert(!s5.track && s5.queue.length === 0, 'stop clears track and queue')

if (signedInHere && !KEEP) {
  await main.eval('window.sonora.auth.logout()')
  console.log('  (signed out again; pass --keep to stay signed in)')
}

main.close()
widget.close()
host.close()
console.log('\nsmoke test passed')
