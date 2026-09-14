import { app, BrowserWindow, globalShortcut, screen, session } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { setupIpc, setPlayerHooks, sendCommand, playerState } from './ipc'
import { getSettings, onSettingsChange, updateSettings } from './store'
import { sanitizeResume } from '@shared/types'
import { loadSession } from './credentials'
import { createTray, rebuildTrayMenu } from './tray'
import {
  createHostWindow,
  createMainWindow,
  createMiniWindow,
  createToastWindow,
  createWidgetWindow,
  getWindow,
  positionToast,
  positionWidget
} from './windows'

let quitting = false

// Only one Sonora at a time; a second launch focuses the existing main window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const main = getWindow('main') ?? createMainWindow()
    if (main.isMinimized()) main.restore()
    main.show()
    main.focus()
  })
}

/**
 * The audio host taps the <audio> element into a Web Audio AnalyserNode, which requires the
 * stream response to be CORS-readable. Navidrome allows all origins on /rest, but other
 * Subsonic servers may not, so we normalise the CORS header for the configured server only.
 */
function installCorsShim(): void {
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
    const server = loadSession()?.server
    if (!server || !details.url.startsWith(server)) {
      callback({})
      return
    }
    const headers = { ...(details.responseHeaders ?? {}) }
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'access-control-allow-origin') delete headers[key]
    }
    headers['Access-Control-Allow-Origin'] = ['*']
    callback({ responseHeaders: headers })
  })
}

function registerMediaKeys(enabled: boolean): void {
  globalShortcut.unregisterAll()
  if (!enabled) return
  globalShortcut.register('MediaPlayPause', () => sendCommand('toggle'))
  globalShortcut.register('MediaNextTrack', () => sendCommand('next'))
  globalShortcut.register('MediaPreviousTrack', () => sendCommand('prev'))
  globalShortcut.register('MediaStop', () => sendCommand('pause'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.sonora.app')

  // Close-to-tray for the main window (registered before any window exists).
  app.on('browser-window-created', (_e, win) => {
    optimizer.watchWindowShortcuts(win)
    win.on('close', (event) => {
      if (quitting) return
      if (win === getWindow('main') && getSettings().closeToTray) {
        event.preventDefault()
        win.hide()
      }
    })
  })

  installCorsShim()
  setupIpc()

  const settings = getSettings()
  const startHidden = process.argv.includes('--hidden')

  createHostWindow()
  createToastWindow()
  if (!startHidden) createMainWindow()
  if (settings.widgets.taskbar) createWidgetWindow()
  if (settings.widgets.mini) createMiniWindow()
  createTray()
  registerMediaKeys(settings.mediaKeys)

  let mediaKeys = settings.mediaKeys
  onSettingsChange((s) => {
    if (s.mediaKeys !== mediaKeys) {
      mediaKeys = s.mediaKeys
      registerMediaKeys(mediaKeys)
    }
  })

  setPlayerHooks({
    onTrackChanged: ({ track }) => {
      rebuildTrayMenu()
      // hostReady is still false while the audio host restores the saved queue, so a resume does not toast.
      if (track && playerState.hostReady && getSettings().widgets.toast) {
        const toast = getWindow('toast')
        if (toast) {
          positionToast()
          toast.webContents.send('toast:show', { track, durationMs: getSettings().toastDurationMs })
        }
      }
    },
    onPlayStateChanged: () => rebuildTrayMenu()
  })

  screen.on('display-metrics-changed', () => {
    positionWidget()
    positionToast()
  })
  screen.on('display-added', positionWidget)
  screen.on('display-removed', positionWidget)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

let lastResume = ''

/** Snapshot the resume point, skipping the write when nothing moved since the last one. */
function saveResume(): void {
  // Before the host finishes restoring, the queue is still empty and a write would erase the saved one.
  if (!playerState.hostReady) return
  const { queue, index, position } = playerState
  const resume = sanitizeResume({ queue, index, position })
  const key = JSON.stringify(resume)
  if (key === lastResume) return
  lastResume = key
  updateSettings({ resume })
}

// A kill -9 or a crash never reaches before-quit, so checkpoint while running too.
setInterval(saveResume, 10_000)

app.on('before-quit', () => {
  quitting = true
  saveResume()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  // Keep running in the tray; the hidden audio host normally keeps this from firing.
  if (quitting) app.quit()
})
