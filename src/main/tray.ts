import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { getSettings, onSettingsChange, updateSettings } from './store'
import { getWindow, setWidgetEnabled, showMainWindow } from './windows'
import { playerState, sendCommand } from './ipc'

let tray: Tray | undefined

function trayIcon(): Electron.NativeImage {
  const candidates = [
    join(process.resourcesPath ?? '', 'tray.png'),
    join(__dirname, '../../resources/tray.png'),
    join(app.getAppPath(), 'resources/tray.png')
  ]
  for (const p of candidates) if (p && existsSync(p)) return nativeImage.createFromPath(p)
  return nativeImage.createEmpty()
}

export function rebuildTrayMenu(): void {
  if (!tray) return
  const s = getSettings()
  const track = playerState.track
  const menu = Menu.buildFromTemplate([
    {
      label: track ? `${track.title} — ${track.artist}` : 'Nothing playing',
      enabled: false
    },
    { type: 'separator' },
    { label: playerState.playing ? 'Pause' : 'Play', click: () => sendCommand('toggle'), enabled: Boolean(track) },
    { label: 'Next', click: () => sendCommand('next'), enabled: Boolean(track) },
    { label: 'Previous', click: () => sendCommand('prev'), enabled: Boolean(track) },
    { type: 'separator' },
    { label: 'Show Sonora', click: () => showMainWindow() },
    {
      label: 'Mini player',
      type: 'checkbox',
      checked: s.widgets.mini,
      click: (item) => setWidgetEnabled('mini', item.checked)
    },
    {
      label: 'Taskbar widget',
      type: 'checkbox',
      checked: s.widgets.taskbar,
      click: (item) => setWidgetEnabled('widget', item.checked)
    },
    {
      label: 'Track change toasts',
      type: 'checkbox',
      checked: s.widgets.toast,
      click: (item) => updateSettings({ widgets: { ...getSettings().widgets, toast: item.checked } })
    },
    { type: 'separator' },
    {
      label: 'Quit Sonora',
      click: () => {
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(track ? `Sonora — ${track.title} · ${track.artist}` : 'Sonora')
}

export function createTray(): Tray {
  tray = new Tray(trayIcon())
  tray.on('click', () => {
    const main = getWindow('main')
    if (main?.isVisible() && main.isFocused()) main.hide()
    else showMainWindow()
  })
  rebuildTrayMenu()
  onSettingsChange(() => rebuildTrayMenu())
  return tray
}
