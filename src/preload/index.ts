import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  PlayerCommandName,
  PlayerCommands,
  PlayerEventName,
  PlayerEvents,
  PlayerState,
  Session,
  Settings,
  Track,
  WindowName
} from '@shared/types'
import type { ServerProbe } from '@shared/subsonic/client'

const windowName = ((): WindowName => {
  const arg = process.argv.find((a) => a.startsWith('--sonora-window='))
  return (arg?.split('=')[1] as WindowName) ?? 'main'
})()

type Unsubscribe = () => void

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  windowName,

  player: {
    on<K extends PlayerEventName>(event: K, cb: (payload: PlayerEvents[K]) => void): Unsubscribe {
      return subscribe(`player:event:${event}`, cb)
    },
    command<K extends PlayerCommandName>(cmd: K, payload?: PlayerCommands[K]): void {
      ipcRenderer.send('player:command', cmd, payload)
    },
    getState(): Promise<PlayerState> {
      return ipcRenderer.invoke('player:getState')
    },
    wantFrames(wanted: boolean): void {
      ipcRenderer.send('player:wantFrames', wanted)
    }
  },

  /** Used exclusively by the hidden audio host renderer. */
  host: {
    emit<K extends PlayerEventName>(event: K, payload: PlayerEvents[K]): void {
      ipcRenderer.send('player:emit', event, payload)
    },
    onCommand(cb: <K extends PlayerCommandName>(cmd: K, payload: PlayerCommands[K]) => void): Unsubscribe {
      const handler = (_e: IpcRendererEvent, cmd: PlayerCommandName, payload: unknown): void =>
        cb(cmd, payload as never)
      ipcRenderer.on('player:command', handler)
      return () => ipcRenderer.removeListener('player:command', handler)
    },
    onFramesWanted(cb: (wanted: boolean) => void): Unsubscribe {
      return subscribe('host:framesWanted', cb)
    }
  },

  auth: {
    getSession(): Promise<Session | null> {
      return ipcRenderer.invoke('auth:getSession')
    },
    login(input: { server: string; username: string; password: string }): Promise<Session> {
      return ipcRenderer.invoke('auth:login', input)
    },
    logout(): Promise<void> {
      return ipcRenderer.invoke('auth:logout')
    },
    /** Replace the alternate-URL list for the current library; re-picks the best one. */
    setServers(servers: string[]): Promise<Session | null> {
      return ipcRenderer.invoke('auth:setServers', servers)
    },
    selectServer(server: string): Promise<Session | null> {
      return ipcRenderer.invoke('auth:selectServer', server)
    },
    reselect(): Promise<Session | null> {
      return ipcRenderer.invoke('auth:reselect')
    },
    probe(): Promise<ServerProbe[]> {
      return ipcRenderer.invoke('auth:probe')
    },
    onChange(cb: (session: Session | null) => void): Unsubscribe {
      return subscribe('auth:changed', cb)
    }
  },

  settings: {
    get(): Promise<Settings> {
      return ipcRenderer.invoke('settings:get')
    },
    update(patch: Partial<Settings>): Promise<Settings> {
      return ipcRenderer.invoke('settings:update', patch)
    },
    onChange(cb: (settings: Settings) => void): Unsubscribe {
      return subscribe('settings:changed', cb)
    }
  },

  /** On-disk song cache. `want` is the audio host's; the rest drive the settings panel. */
  cache: {
    want(id: string, url: string): Promise<Uint8Array | null> {
      return ipcRenderer.invoke('cache:want', id, url)
    },
    stats(): Promise<{ bytes: number; count: number }> {
      return ipcRenderer.invoke('cache:stats')
    },
    clear(): Promise<void> {
      return ipcRenderer.invoke('cache:clear')
    }
  },

  window: {
    minimize: (): void => ipcRenderer.send('window:control', 'minimize'),
    maximize: (): void => ipcRenderer.send('window:control', 'maximize'),
    close: (): void => ipcRenderer.send('window:control', 'close'),
    hide: (): void => ipcRenderer.send('window:control', 'hide'),
    showMain: (): void => ipcRenderer.send('window:control', 'showMain'),
    setIgnoreMouse: (ignore: boolean): void => ipcRenderer.send('window:setIgnoreMouse', ignore)
  },

  toast: {
    onShow(cb: (payload: { track: Track; durationMs: number }) => void): Unsubscribe {
      return subscribe('toast:show', cb)
    },
    shown: (): void => ipcRenderer.send('window:control', 'toastShown'),
    done: (): void => ipcRenderer.send('window:control', 'toastDone')
  },

  app: {
    info(): Promise<{ version: string; platform: string }> {
      return ipcRenderer.invoke('app:info')
    },
    openExternal(url: string): void {
      ipcRenderer.send('app:openExternal', url)
    }
  }
}

export type SonoraApi = typeof api

contextBridge.exposeInMainWorld('sonora', api)
