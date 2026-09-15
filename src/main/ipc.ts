import { app, ipcMain, shell, type IpcMainEvent } from 'electron'
import {
  initialPlayerState,
  type PlayerCommandName,
  type PlayerCommands,
  type PlayerEventName,
  type PlayerEvents,
  type PlayerState,
  type Session,
  type Settings,
  type SettingsPatch
} from '@shared/types'
import {
  SubsonicClient,
  credentialsFromPassword,
  normalizeServerUrl,
  pickFastestServer,
  probeServers,
  type ServerProbe
} from '@shared/subsonic/client'
import * as audioCache from './audioCache'
import { setAutoLaunch } from './autolaunch'
import { clearSession, loadSession, saveSession } from './credentials'
import { getSettings, updateSettings } from './store'
import {
  applyOverlaySettings,
  broadcast,
  fadeToastOut,
  getWindow,
  positionToast,
  positionWidget,
  setWidgetEnabled,
  showMainWindow,
  showToast,
  windowNameOf
} from './windows'

/** Main-process mirror of the audio host's state so new windows can hydrate instantly. */
export const playerState: PlayerState = { ...initialPlayerState }

/** webContents ids that asked for the high-frequency audioFrame stream. */
const frameSubscribers = new Set<number>()

type Hooks = {
  onTrackChanged?: (payload: PlayerEvents['trackChanged']) => void
  onPlayStateChanged?: (payload: PlayerEvents['playStateChanged']) => void
}

let hooks: Hooks = {}
export function setPlayerHooks(h: Hooks): void {
  hooks = h
}

function applyEvent<K extends PlayerEventName>(event: K, payload: PlayerEvents[K]): void {
  switch (event) {
    case 'hostReady':
      playerState.hostReady = (payload as PlayerEvents['hostReady']).ready
      break
    case 'trackChanged': {
      const p = payload as PlayerEvents['trackChanged']
      playerState.track = p.track
      playerState.index = p.index
      playerState.position = 0
      playerState.duration = p.track?.duration ?? 0
      break
    }
    case 'playStateChanged':
      playerState.playing = (payload as PlayerEvents['playStateChanged']).playing
      break
    case 'positionUpdate': {
      const p = payload as PlayerEvents['positionUpdate']
      playerState.position = p.position
      playerState.duration = p.duration
      break
    }
    case 'queueChanged': {
      const p = payload as PlayerEvents['queueChanged']
      playerState.queue = p.queue
      playerState.index = p.index
      break
    }
    case 'volumeChanged': {
      const p = payload as PlayerEvents['volumeChanged']
      playerState.volume = p.volume
      playerState.muted = p.muted
      updateSettings({ volume: p.volume, muted: p.muted })
      break
    }
    case 'modeChanged': {
      const p = payload as PlayerEvents['modeChanged']
      playerState.repeat = p.repeat
      playerState.shuffle = p.shuffle
      updateSettings({ repeat: p.repeat, shuffle: p.shuffle })
      break
    }
  }
}

export function sendCommand<K extends PlayerCommandName>(cmd: K, payload?: PlayerCommands[K]): void {
  const host = getWindow('host')
  if (!host) {
    console.warn('[ipc] command dropped, no audio host:', cmd)
    return
  }
  host.webContents.send('player:command', cmd, payload)
}

/** Persist a new active server and tell every window, but only when it actually changed. */
function activate(session: Session, server: string): Session {
  if (server === session.server) return session
  const next: Session = { ...session, server }
  saveSession(next)
  broadcast('auth:changed', [next])
  return next
}

/** Ping all candidates and switch to whichever answers first. Keeps the current pick if none do. */
async function reselect(): Promise<Session | null> {
  const session = loadSession()
  if (!session || (session.servers?.length ?? 0) < 2) return session
  try {
    return activate(session, await pickFastestServer(session, session.servers!))
  } catch {
    return session // nothing answered; leave the pick alone so a flaky network is not destructive
  }
}

export function setupIpc(): void {
  // ---- player event bus -----------------------------------------------------
  ipcMain.on('player:emit', (e: IpcMainEvent, event: PlayerEventName, payload: unknown) => {
    if (windowNameOf(e.sender.id) !== 'host') return // only the audio host may emit
    if (event === 'audioFrame') {
      if (frameSubscribers.size === 0) return
      broadcast('player:event:audioFrame', [payload], e.sender.id, frameSubscribers)
      return
    }
    applyEvent(event, payload as never)
    broadcast(`player:event:${event}`, [payload], e.sender.id)
    if (event === 'trackChanged') hooks.onTrackChanged?.(payload as PlayerEvents['trackChanged'])
    if (event === 'playStateChanged') hooks.onPlayStateChanged?.(payload as PlayerEvents['playStateChanged'])
  })

  ipcMain.on('player:command', (_e, cmd: PlayerCommandName, payload?: unknown) => {
    sendCommand(cmd, payload as never)
  })

  ipcMain.handle('player:getState', () => playerState)

  ipcMain.on('player:wantFrames', (e, wanted: boolean) => {
    if (wanted) frameSubscribers.add(e.sender.id)
    else frameSubscribers.delete(e.sender.id)
    e.sender.once('destroyed', () => frameSubscribers.delete(e.sender.id))
    getWindow('host')?.webContents.send('host:framesWanted', frameSubscribers.size > 0)
  })

  // ---- auth ----------------------------------------------------------------
  ipcMain.handle('auth:getSession', (): Session | null => loadSession())

  ipcMain.handle(
    'auth:login',
    async (_e, input: { server: string; username: string; password: string }): Promise<Session> => {
      const server = normalizeServerUrl(input.server)
      const session: Session = {
        server,
        servers: [server],
        username: input.username.trim(),
        ...credentialsFromPassword(input.password)
      }
      const client = new SubsonicClient(session)
      await client.ping() // throws SubsonicError on bad credentials / unreachable server
      const previous = loadSession()
      if (previous?.username !== session.username || previous.server !== session.server) {
        broadcast('settings:changed', [updateSettings({ recents: [] })])
      }
      saveSession(session)
      broadcast('auth:changed', [session])
      return session
    }
  )

  /** Replace the candidate URL list, then re-pick the best one. */
  ipcMain.handle('auth:setServers', async (_e, urls: string[]): Promise<Session | null> => {
    const session = loadSession()
    if (!session) return null
    const servers = [...new Set(urls.map(normalizeServerUrl).filter(Boolean))]
    if (servers.length === 0) return session
    const next: Session = { ...session, servers, server: servers.includes(session.server) ? session.server : servers[0] }
    saveSession(next)
    broadcast('auth:changed', [next])
    return (await reselect()) ?? next
  })

  /** Pin a specific candidate; also how the renderer reports a failover it already performed. */
  ipcMain.handle('auth:selectServer', (_e, server: string): Session | null => {
    const session = loadSession()
    return session ? activate(session, normalizeServerUrl(server)) : null
  })

  ipcMain.handle('auth:reselect', (): Promise<Session | null> => reselect())

  ipcMain.handle('auth:probe', async (): Promise<ServerProbe[]> => {
    const session = loadSession()
    return session ? probeServers(session, session.servers ?? [session.server]) : []
  })

  ipcMain.handle('auth:logout', () => {
    clearSession()
    broadcast('settings:changed', [updateSettings({ recents: [] })])
    sendCommand('stop')
    broadcast('auth:changed', [null])
  })

  // ---- settings ------------------------------------------------------------
  ipcMain.handle('settings:get', (): Settings => getSettings())
  ipcMain.handle('settings:update', (_e, patch: SettingsPatch): Settings => {
    const before = getSettings()
    const next = updateSettings(patch)
    if (patch.widgets) {
      if (patch.widgets.mini !== undefined && patch.widgets.mini !== before.widgets.mini) {
        setWidgetEnabled('mini', patch.widgets.mini)
      }
      if (patch.widgets.taskbar !== undefined && patch.widgets.taskbar !== before.widgets.taskbar) {
        setWidgetEnabled('widget', patch.widgets.taskbar)
      }
    }
    // The anchor and the layout options both change where the widget window belongs, and the
    // background mode decides which kind of window it has to be in the first place.
    if (patch.widget) {
      applyOverlaySettings('widget')
      positionWidget()
      positionToast()
    }
    if (patch.mini) applyOverlaySettings('mini')
    if (patch.toast) {
      applyOverlaySettings('toast')
      positionToast()
    }
    if (patch.autoLaunch !== undefined) {
      setAutoLaunch(patch.autoLaunch)
    }
    // A smaller budget has to take effect now, not at the next download.
    if (patch.cacheMaxGb !== undefined && patch.cacheMaxGb < before.cacheMaxGb) void audioCache.evict()
    broadcast('settings:changed', [next])
    return next
  })

  // ---- song cache ----------------------------------------------------------
  /** Only the audio host may ask, and only for a URL on one of this session's own servers. */
  ipcMain.handle('cache:want', (e, id: string, url: string): Promise<Buffer | null> => {
    const session = loadSession()
    const servers = session ? session.servers ?? [session.server] : []
    if (windowNameOf(e.sender.id) !== 'host' || !servers.some((s) => url.startsWith(`${s}/`))) {
      return Promise.resolve(null)
    }
    return audioCache.bytes(id, url)
  })
  ipcMain.handle('cache:stats', () => audioCache.stats())
  ipcMain.handle('cache:clear', () => audioCache.clear())

  // ---- windows -------------------------------------------------------------
  ipcMain.on('window:control', (e, action: 'minimize' | 'maximize' | 'close' | 'hide' | 'showMain' | 'toastShown' | 'toastLeaving' | 'toastDone') => {
    const name = windowNameOf(e.sender.id)
    const win = name ? getWindow(name) : undefined
    switch (action) {
      case 'minimize':
        win?.minimize()
        break
      case 'maximize':
        if (win?.isMaximized()) win.unmaximize()
        else win?.maximize()
        break
      case 'close':
        win?.close()
        break
      case 'hide':
        win?.hide()
        break
      case 'showMain':
        showMainWindow()
        break
      case 'toastShown':
        showToast()
        break
      case 'toastLeaving':
        fadeToastOut()
        break
      case 'toastDone':
        getWindow('toast')?.hide()
        break
    }
  })

  ipcMain.on('window:setIgnoreMouse', (e, ignore: boolean) => {
    const name = windowNameOf(e.sender.id)
    const win = name ? getWindow(name) : undefined
    win?.setIgnoreMouseEvents(ignore, { forward: true })
  })


  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }))
  ipcMain.on('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}
