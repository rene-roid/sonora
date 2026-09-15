import { BrowserWindow, app, nativeImage, screen, shell, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { release } from 'node:os'
import { is } from '@electron-toolkit/utils'
import { supportsNativeAcrylic, widgetOpacity, widgetSize, type Rect, type WindowName } from '@shared/types'
import { getSettings, updateSettings } from './store'

const windows = new Map<WindowName, BrowserWindow>()

export const MINI_SIZE = { width: 340, height: 112 }
export const TOAST_SIZE = { width: 380, height: 112 }
const EDGE = 12
/** The widget sits closer to the screen edge than the floating windows so it hugs the taskbar. */
const WIDGET_EDGE = 6

/** Windows/Linux: tool windows are skipped by the taskbar, alt-tab and window lists. */
const OVERLAY_TYPE = process.platform === 'darwin' ? {} : ({ type: 'toolbar' } as const)

/** Whether this machine can draw the widget's acrylic mode as a real system backdrop. */
export const NATIVE_ACRYLIC = supportsNativeAcrylic(process.platform, release())

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
  const x = a.x + a.width - TOAST_SIZE.width - EDGE
  const widget = getWindow('widget')
  // Only step over the widget when it actually sits under the toast's bottom-right slot.
  const w = widget?.isVisible() ? widgetBounds() : undefined
  const overlaps = w && w.y + w.height > a.y + a.height - TOAST_SIZE.height - EDGE && w.x + w.width > x
  win.setBounds({
    x,
    y: a.y + a.height - TOAST_SIZE.height - EDGE - (overlaps ? w.height + 8 : 0),
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

/** Whether the widget should be sitting on the system's acrylic backdrop right now. */
function wantsAcrylicSurface(): boolean {
  return NATIVE_ACRYLIC && getSettings().widget.background === 'acrylic'
}

/** Surface the live widget window was built on; changing it needs a whole new window. */
let onAcrylicSurface = false

export function createWidgetWindow(): BrowserWindow {
  const existing = getWindow('widget')
  if (existing) return existing
  onAcrylicSurface = wantsAcrylicSurface()
  const win = new BrowserWindow({
    ...baseOptions('widget'),
    ...widgetBounds(),
    ...OVERLAY_TYPE,
    // A solid card wants a per-pixel transparent window so nothing paints outside it. The acrylic
    // backdrop is drawn by the system behind the window, which Windows only does when it is not
    // `transparent`; the fully clear background colour is what lets that backdrop show through.
    ...(onAcrylicSurface
      ? { transparent: false, backgroundColor: '#00000000', backgroundMaterial: 'acrylic' as const }
      : { transparent: true }),
    frame: false,
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
  win.on('ready-to-show', () => {
    applyWidgetOpacity()
    watchWidgetPointer()
    win.showInactive()
  })
  win.on('closed', () => {
    windows.delete('widget')
    watchWidgetPointer()
  })
  loadPage(win, 'widget')
  return win
}

/** True while the pointer is inside the widget's bounds. */
let widgetHovered = false
let pointerTimer: NodeJS.Timeout | undefined
/** Last point handed to the page, so a resting cursor costs nothing. `null` means "outside". */
let sentPoint: { x: number; y: number } | null = null

/**
 * Cursor watch behind the widget's two get-out-of-the-way options. Neither can learn where the
 * pointer is from the page: click-through leaves the window ignoring the mouse, and Windows then
 * stops sending it move messages at all, forwarding included. Polling the cursor from here costs
 * a couple of microseconds, never gets stuck, and runs only while one of the options is on.
 *
 * The hit test itself still belongs to the page, which is the only side that knows where its
 * buttons ended up, so the point is handed over in window coordinates for it to resolve.
 */
function watchWidgetPointer(): void {
  clearInterval(pointerTimer)
  pointerTimer = undefined
  sentPoint = null
  const { fadeOnHover, clickThrough } = getSettings().widget
  if (!getWindow('widget') || (!fadeOnHover && !clickThrough)) {
    setWidgetHovered(false)
    return
  }
  pointerTimer = setInterval(() => {
    const win = getWindow('widget')
    if (!win) return watchWidgetPointer()
    const c = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const inside = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height
    setWidgetHovered(inside)
    if (!getSettings().widget.clickThrough) return
    // Window coordinates are DIP, which is what the page measures its layout in too.
    const point = inside ? { x: c.x - b.x, y: c.y - b.y } : null
    if (point?.x === sentPoint?.x && point?.y === sentPoint?.y) return
    sentPoint = point
    win.webContents.send('widget:hitTest', point)
  }, 100)
}

function setWidgetHovered(hovered: boolean): void {
  if (hovered === widgetHovered) return
  widgetHovered = hovered
  applyWidgetOpacity()
  getWindow('widget')?.webContents.send('widget:hover', hovered)
}

/**
 * Acrylic mode paints its backdrop outside the page, so CSS cannot fade it and the window's own
 * alpha has to. Solid mode keeps its fade in CSS: a per-pixel transparent window and layered
 * window alpha do not mix well on Windows, and the card there is the only thing on screen anyway.
 */
function applyWidgetOpacity(): void {
  const win = getWindow('widget')
  if (!win) return
  win.setOpacity(onAcrylicSurface ? widgetOpacity(getSettings().widget, widgetHovered) : 1)
}

/**
 * Swap the widget onto the surface its background mode needs. `transparent` and
 * `backgroundMaterial` are both fixed at construction, so the window is rebuilt rather than
 * reconfigured. A no-op when the mode did not actually change.
 */
export function refreshWidgetSurface(): void {
  const win = getWindow('widget')
  if (!win || wantsAcrylicSurface() === onAcrylicSurface) return
  // destroy, not close: the replacement is built in this same tick, before 'closed' would fire.
  win.destroy()
  windows.delete('widget')
  setWidgetHovered(false)
  createWidgetWindow()
}

/** Where the taskbar widget belongs right now, from its anchor and its layout options. */
export function widgetBounds(): Rect {
  const a = workArea()
  const o = getSettings().widget
  const { width, height } = widgetSize(o)
  const [edge, side] = o.anchor.split('-')
  const x =
    side === 'left'
      ? a.x + EDGE
      : side === 'center'
        ? a.x + Math.round((a.width - width) / 2)
        : a.x + a.width - width - EDGE
  const y = edge === 'top' ? a.y + WIDGET_EDGE : a.y + a.height - height - WIDGET_EDGE
  return { x, y, width, height }
}

/** Re-anchor, re-size and re-fade the taskbar widget after a settings or display change. */
export function positionWidget(): void {
  const win = getWindow('widget')
  if (!win) return
  // Windows pins maximumSize to the current size while a window is non-resizable, so a
  // compact-mode size change is rejected unless resizing is briefly allowed.
  win.setResizable(true)
  win.setBounds(widgetBounds())
  win.setResizable(false)
  applyWidgetOpacity()
  watchWidgetPointer()
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
