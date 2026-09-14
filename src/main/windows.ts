import { BrowserWindow, app, nativeImage, screen, shell, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { is } from '@electron-toolkit/utils'
import type { Rect, WindowName } from '@shared/types'
import { getSettings, updateSettings } from './store'

const windows = new Map<WindowName, BrowserWindow>()

export const WIDGET_SIZE = { width: 340, height: 76 }
export const MINI_SIZE = { width: 340, height: 112 }
export const TOAST_SIZE = { width: 380, height: 112 }
const EDGE = 12

/** Windows/Linux: tool windows are skipped by the taskbar, alt-tab and window lists. */
const OVERLAY_TYPE = process.platform === 'darwin' ? {} : ({ type: 'toolbar' } as const)

export function getWindow(name: WindowName): BrowserWindow | undefined {
  const w = windows.get(name)
  return w && !w.isDestroyed() ? w : undefined
}

export function allWindows(): [WindowName, BrowserWindow][] {
  return [...windows.entries()].filter(([, w]) => !w.isDestroyed())
}

export function windowNameOf(webContentsId: number): WindowName | undefined {
  for (const [name, w] of allWindows()) if (w.webContents.id === webContentsId) return name
  return undefined
}

function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function loadPage(win: BrowserWindow, page: WindowName): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}/index.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
  }
}

/** Resolve an image from resources/ in both dev and packaged builds. */
export function resourceImage(file: string): Electron.NativeImage {
  const candidates = [
    join(process.resourcesPath ?? '', file),
    join(__dirname, '../../resources', file),
    join(app.getAppPath(), 'resources', file)
  ]
  for (const p of candidates) if (p && existsSync(p)) return nativeImage.createFromPath(p)
  return nativeImage.createEmpty()
}

function baseOptions(name: WindowName): BrowserWindowConstructorOptions {
  const icon = resourceImage('icon.png')
  return {
    show: false,
    ...(icon.isEmpty() ? {} : { icon }),
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: [`--sonora-window=${name}`]
    }
  }
}

/** In development, mirror renderer console warnings/errors to the terminal with the window name. */
function forwardConsole(name: WindowName, win: BrowserWindow): void {
  if (!is.dev && !process.env["SONORA_DEBUG"]) return
  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level < 2) return
    const src = sourceId ? ` (${sourceId.split("/").pop()}:${line})` : ""
    console.log(`[${name}] ${message}${src}`)
  })
  win.webContents.on("render-process-gone", (_e, details) => console.error(`[${name}] renderer gone:`, details.reason))
}

function workArea(): Rect {
  return screen.getPrimaryDisplay().workArea
}

function rememberBounds(name: WindowName, win: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined
  const save = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed()) return
      updateSettings({ windowBounds: { [name]: win.getBounds() } })
    }, 300)
  }
  win.on('moved', save)
  win.on('resized', save)
}

function savedBounds(name: WindowName): Rect | undefined {
  const b = getSettings().windowBounds[name]
  if (!b) return undefined
  // Make sure the window is at least partially on a connected display.
  const onScreen = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y < a.y + a.height - 40 && b.y + b.height > a.y + 40
  })
  return onScreen ? b : undefined
}

// ---------------------------------------------------------------------------

export function createHostWindow(): BrowserWindow {
  const existing = getWindow('host')
  if (existing) return existing
  const win = new BrowserWindow({
    ...baseOptions('host'),
    width: 400,
    height: 300,
    skipTaskbar: true,
    webPreferences: {
      ...baseOptions('host').webPreferences,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  windows.set('host', win)
  forwardConsole('host', win)
  win.on('closed', () => windows.delete('host'))
  loadPage(win, 'host')
  return win
}

export function createMainWindow(): BrowserWindow {
  const existing = getWindow('main')
  if (existing) return existing
  const saved = savedBounds('main')
  const win = new BrowserWindow({
    ...baseOptions('main'),
    width: saved?.width ?? 1280,
    height: saved?.height ?? 800,
    x: saved?.x,
    y: saved?.y,
    minWidth: 900,
    minHeight: 600,
    title: 'Sonora',
    backgroundColor: '#0f0f0f',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0f0f0f', symbolColor: '#e5e5e5', height: 36 }
  })
  windows.set('main', win)
  forwardConsole('main', win)
  rememberBounds('main', win)
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => windows.delete('main'))
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  loadPage(win, 'main')
  return win
}

export function createToastWindow(): BrowserWindow {
  const existing = getWindow('toast')
  if (existing) return existing
  const win = new BrowserWindow({
    ...baseOptions('toast'),
    ...TOAST_SIZE,
    ...OVERLAY_TYPE,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false
  })
  windows.set('toast', win)
  forwardConsole('toast', win)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('closed', () => windows.delete('toast'))
  loadPage(win, 'toast')
  return win
}

export function positionToast(): void {
  const win = getWindow('toast')
  if (!win) return
  const a = workArea()
  const widget = getWindow('widget')
  const lift = widget && widget.isVisible() ? WIDGET_SIZE.height + 8 : 0
  win.setBounds({
    x: a.x + a.width - TOAST_SIZE.width - EDGE,
    y: a.y + a.height - TOAST_SIZE.height - EDGE - lift,
    ...TOAST_SIZE
  })
}

export function createMiniWindow(): BrowserWindow {
  const existing = getWindow('mini')
  if (existing) return existing
  const saved = savedBounds('mini')
  const a = workArea()
  const win = new BrowserWindow({
    ...baseOptions('mini'),
    ...MINI_SIZE,
    x: saved?.x ?? a.x + a.width - MINI_SIZE.width - EDGE,
    y: saved?.y ?? a.y + EDGE,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false
  })
  windows.set('mini', win)
  forwardConsole('mini', win)
  win.setAlwaysOnTop(true, 'floating')
  rememberBounds('mini', win)
  win.on('ready-to-show', () => win.showInactive())
  win.on('closed', () => windows.delete('mini'))
  loadPage(win, 'mini')
  return win
}

export function createWidgetWindow(): BrowserWindow {
  const existing = getWindow('widget')
  if (existing) return existing
  const a = workArea()
  const win = new BrowserWindow({
    ...baseOptions('widget'),
    ...WIDGET_SIZE,
    ...OVERLAY_TYPE,
    x: a.x + a.width - WIDGET_SIZE.width - EDGE,
    y: a.y + a.height - WIDGET_SIZE.height - 6,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false
  })
  windows.set('widget', win)
  forwardConsole('widget', win)
  win.setAlwaysOnTop(true, 'floating')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  win.on('ready-to-show', () => win.showInactive())
  win.on('closed', () => windows.delete('widget'))
  loadPage(win, 'widget')
  return win
}

/** Keep the taskbar widget glued to the bottom-right of the work area when displays change. */
export function positionWidget(): void {
  const win = getWindow('widget')
  if (!win) return
  const a = workArea()
  win.setBounds({
    x: a.x + a.width - WIDGET_SIZE.width - EDGE,
    y: a.y + a.height - WIDGET_SIZE.height - 6,
    ...WIDGET_SIZE
  })
}

export function setWidgetEnabled(name: 'mini' | 'widget', enabled: boolean): void {
  const win = getWindow(name)
  if (enabled) {
    if (win) win.showInactive()
    else if (name === 'mini') createMiniWindow()
    else createWidgetWindow()
  } else {
    win?.close()
  }
  updateSettings({ widgets: { ...getSettings().widgets, [name === 'mini' ? 'mini' : 'taskbar']: enabled } })
  positionToast()
}

export function showMainWindow(): void {
  const win = getWindow('main') ?? createMainWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** Send a channel + args to every window except the given webContents id. */
export function broadcast(channel: string, args: unknown[], exceptId?: number, only?: Set<number>): void {
  for (const [, w] of allWindows()) {
    const id = w.webContents.id
    if (id === exceptId) continue
    if (only && !only.has(id)) continue
    w.webContents.send(channel, ...args)
  }
}
