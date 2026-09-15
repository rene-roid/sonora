import { BrowserWindow, app, nativeImage, screen, shell, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { release } from 'node:os'
import { is } from '@electron-toolkit/utils'
import {
  OVERLAY_FADE_MS,
  defaultOverlayChrome,
  overlayOpacity,
  supportsNativeAcrylic,
  widgetSize,
  type OverlayAnchor,
  type OverlayChrome,
  type Rect,
  type WindowName
} from '@shared/types'
import { getSettings, updateSettings } from './store'

const windows = new Map<WindowName, BrowserWindow>()

export const MINI_SIZE = { width: 340, height: 112 }
export const TOAST_SIZE = { width: 380, height: 112 }
const EDGE = 12
/** The widget sits closer to the screen edge than the floating windows so it hugs the taskbar. */
const WIDGET_EDGE = 6

/** Windows/Linux: tool windows are skipped by the taskbar, alt-tab and window lists. */
const OVERLAY_TYPE = process.platform === 'darwin' ? {} : ({ type: 'toolbar' } as const)

/** Whether this machine can draw an overlay's acrylic mode as a real system backdrop. */
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
    ...surfaceOptions('toast'),
    frame: false,
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
  // An acrylic toast fades its whole window in and out, so it starts from nothing.
  if (overlays.toast.acrylic) fadeTo('toast', 0, false)
  win.on('closed', () => windows.delete('toast'))
  loadPage(win, 'toast')
  return win
}

/** Show the toast window for a card the page has just rendered, fading the window in if acrylic. */
export function showToast(): void {
  const win = getWindow('toast')
  if (!win) return
  positionToast()
  const st = overlays.toast
  if (st.acrylic) fadeTo('toast', 0, false)
  win.showInactive()
  if (st.acrylic) fadeTo('toast', getSettings().toast.opacity)
}

/**
 * Toast leave, acrylic mode only: the backdrop is painted outside the page, so the card's CSS
 * exit cannot take it along and the window fades instead, over the same duration.
 */
export function fadeToastOut(): void {
  if (overlays.toast.acrylic) fadeTo('toast', 0)
}

export function positionToast(): void {
  const win = getWindow('toast')
  if (!win) return
  const { anchor } = getSettings().toast
  const r = anchoredRect(anchor, TOAST_SIZE, EDGE, EDGE)
  const widget = getWindow('widget')
  const w = widget?.isVisible() ? widgetBounds() : undefined
  // Step over the widget when the two would overlap, away from the edge the toast hangs off.
  if (w && r.x < w.x + w.width && r.x + r.width > w.x && r.y < w.y + w.height && r.y + r.height > w.y) {
    r.y += (anchor.startsWith('top') ? 1 : -1) * (w.height + 8)
  }
  win.setBounds(r)
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
    ...surfaceOptions('mini'),
    frame: false,
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
  win.on('ready-to-show', () => {
    applyOverlayOpacity('mini', false)
    watchPointer('mini')
    win.showInactive()
  })
  win.on('closed', () => {
    windows.delete('mini')
    watchPointer('mini')
  })
  loadPage(win, 'mini')
  return win
}

export function createWidgetWindow(): BrowserWindow {
  const existing = getWindow('widget')
  if (existing) return existing
  const win = new BrowserWindow({
    ...baseOptions('widget'),
    ...widgetBounds(),
    ...OVERLAY_TYPE,
    ...surfaceOptions('widget'),
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
    applyOverlayOpacity('widget', false)
    watchPointer('widget')
    win.showInactive()
  })
  win.on('closed', () => {
    windows.delete('widget')
    watchPointer('widget')
  })
  loadPage(win, 'widget')
  return win
}

// ---- overlay chrome ---------------------------------------------------------
// The widget, the mini player and the toast share one look (`OverlayChrome`) and, with it, the
// same three pieces of main-side machinery: the window surface their background mode needs, a
// window-alpha fade for the acrylic surface, and a cursor watch for hover and click-through.

type OverlayName = 'widget' | 'mini' | 'toast'

interface OverlayState {
  /** Built on the system acrylic backdrop. Fixed at construction; changing it needs a new window. */
  acrylic: boolean
  hovered: boolean
  /** Window alpha currently showing, which is where the next fade starts from. */
  opacity: number
  fadeTimer?: NodeJS.Timeout
  pointerTimer?: NodeJS.Timeout
  /** Last point handed to the page, so a resting cursor costs nothing. `null` means "outside". */
  sent: { x: number; y: number } | null
}

const overlayState = (): OverlayState => ({ acrylic: false, hovered: false, opacity: 1, sent: null })
const overlays: Record<OverlayName, OverlayState> = { widget: overlayState(), mini: overlayState(), toast: overlayState() }

const creators: Record<OverlayName, () => BrowserWindow> = {
  widget: createWidgetWindow,
  mini: createMiniWindow,
  toast: createToastWindow
}

/** The toast has no hover or click-through options; it reads as an overlay that never uses them. */
function chromeOf(name: OverlayName): OverlayChrome {
  const s = getSettings()
  return name === 'widget' ? s.widget : name === 'mini' ? s.mini : { ...defaultOverlayChrome, ...s.toast }
}

function wantsAcrylic(name: OverlayName): boolean {
  return NATIVE_ACRYLIC && chromeOf(name).background === 'acrylic'
}

/**
 * Constructor options for the surface an overlay's background mode needs, recorded so a later
 * change can tell whether the window has to be rebuilt. A solid card wants a per-pixel
 * transparent window so nothing paints outside it. The acrylic backdrop is drawn by the system
 * behind the window, which Windows only does when it is not `transparent`; the fully clear
 * background colour is what lets that backdrop show through.
 */
function surfaceOptions(name: OverlayName): BrowserWindowConstructorOptions {
  const st = overlays[name]
  st.acrylic = wantsAcrylic(name)
  st.opacity = 1
  return st.acrylic
    ? { transparent: false, backgroundColor: '#00000000', backgroundMaterial: 'acrylic' }
    : { transparent: true }
}

/**
 * Ease an overlay's window alpha to `target`, on the same curve and clock as the CSS fade the
 * solid surface uses, so both modes feel the same. A fade already running is simply redirected.
 */
function fadeTo(name: OverlayName, target: number, animate = true): void {
  const st = overlays[name]
  const win = getWindow(name)
  clearInterval(st.fadeTimer)
  st.fadeTimer = undefined
  if (!win) return
  const set = (v: number): void => {
    st.opacity = v
    win.setOpacity(v)
  }
  const from = st.opacity
  if (!animate || Math.abs(target - from) < 0.005) return set(target)
  const start = Date.now()
  st.fadeTimer = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(st.fadeTimer)
    const t = Math.min(1, (Date.now() - start) / OVERLAY_FADE_MS)
    set(from + (target - from) * (1 - (1 - t) ** 2)) // ease-out
    if (t >= 1) {
      clearInterval(st.fadeTimer)
      st.fadeTimer = undefined
    }
  }, 16)
}

/**
 * Acrylic surfaces paint their backdrop outside the page, so CSS cannot fade them and the
 * window's own alpha has to. Solid surfaces keep their fade in CSS: a per-pixel transparent
 * window and layered window alpha do not mix well on Windows, and the card is all there is anyway.
 * The toast is left alone while hidden; `showToast` runs its own fade-in from nothing.
 */
function applyOverlayOpacity(name: OverlayName, animate = true): void {
  const st = overlays[name]
  const win = getWindow(name)
  if (!win || (name === 'toast' && !win.isVisible())) return
  fadeTo(name, st.acrylic ? overlayOpacity(chromeOf(name), st.hovered) : 1, animate)
}

function setHovered(name: OverlayName, hovered: boolean): void {
  const st = overlays[name]
  if (hovered === st.hovered) return
  st.hovered = hovered
  applyOverlayOpacity(name)
  getWindow(name)?.webContents.send('overlay:hover', hovered)
}

/**
 * Cursor watch behind the two get-out-of-the-way options. Neither can learn where the pointer is
 * from the page: click-through leaves the window ignoring the mouse, and Windows then stops
 * sending it move messages at all, forwarding included. Polling the cursor from here costs a
 * couple of microseconds, never gets stuck, and runs only while one of the options is on.
 *
 * The hit test itself still belongs to the page, which is the only side that knows where its
 * controls ended up, so the point is handed over in window coordinates for it to resolve.
 */
function watchPointer(name: OverlayName): void {
  const st = overlays[name]
  clearInterval(st.pointerTimer)
  st.pointerTimer = undefined
  st.sent = null
  const { fadeOnHover, clickThrough } = chromeOf(name)
  if (!getWindow(name) || (!fadeOnHover && !clickThrough)) {
    setHovered(name, false)
    return
  }
  st.pointerTimer = setInterval(() => {
    const win = getWindow(name)
    if (!win) return watchPointer(name)
    const c = screen.getCursorScreenPoint()
    const b = win.getBounds()
    const inside = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height
    setHovered(name, inside)
    if (!chromeOf(name).clickThrough) return
    // Window coordinates are DIP, which is what the page measures its layout in too.
    const point = inside ? { x: c.x - b.x, y: c.y - b.y } : null
    if (point?.x === st.sent?.x && point?.y === st.sent?.y) return
    st.sent = point
    win.webContents.send('overlay:hitTest', point)
  }, 100)
}

/**
 * Swap an overlay onto the surface its background mode needs. `transparent` and
 * `backgroundMaterial` are both fixed at construction, so the window is rebuilt rather than
 * reconfigured. A no-op when the mode did not actually change.
 */
function refreshSurface(name: OverlayName): void {
  const win = getWindow(name)
  if (!win || wantsAcrylic(name) === overlays[name].acrylic) return
  // The mini player's position is saved on a debounce; a drag just before this would be lost.
  if (name === 'mini') updateSettings({ windowBounds: { mini: win.getBounds() } })
  // destroy, not close: the replacement is built in this same tick, before 'closed' would fire.
  win.destroy()
  windows.delete(name)
  setHovered(name, false)
  creators[name]()
}

/** After a settings change: rebuild the surface if the mode changed, then re-fade and re-watch. */
export function applyOverlaySettings(name: OverlayName): void {
  refreshSurface(name)
  applyOverlayOpacity(name)
  watchPointer(name)
}

// ---- geometry ---------------------------------------------------------------

/** A box of `size` glued to `anchor` of the work area, inset by `sideInset` / `edgeInset`. */
function anchoredRect(anchor: OverlayAnchor, size: { width: number; height: number }, sideInset: number, edgeInset: number): Rect {
  const a = workArea()
  const { width, height } = size
  const [edge, side] = anchor.split('-')
  const x =
    side === 'left'
      ? a.x + sideInset
      : side === 'center'
        ? a.x + Math.round((a.width - width) / 2)
        : a.x + a.width - width - sideInset
  const y = edge === 'top' ? a.y + edgeInset : a.y + a.height - height - edgeInset
  return { x, y, width, height }
}

/** Where the taskbar widget belongs right now, from its anchor and its layout options. */
export function widgetBounds(): Rect {
  const o = getSettings().widget
  return anchoredRect(o.anchor, widgetSize(o), EDGE, WIDGET_EDGE)
}

/** Re-anchor and re-size the taskbar widget after a settings change or a display change. */
export function positionWidget(): void {
  const win = getWindow('widget')
  if (!win) return
  // Windows pins maximumSize to the current size while a window is non-resizable, so a
  // compact-mode size change is rejected unless resizing is briefly allowed.
  win.setResizable(true)
  win.setBounds(widgetBounds())
  win.setResizable(false)
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
