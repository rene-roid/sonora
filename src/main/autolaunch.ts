import { app } from 'electron'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Electron only implements setLoginItemSettings on Windows/macOS, so Linux gets an XDG autostart entry. */
function linuxDesktopFile(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(configHome, 'autostart', 'sonora.desktop')
}

function linuxExec(): string {
  // AppImages are mounted at a temp path; APPIMAGE points at the real, stable file.
  if (process.env.APPIMAGE) return `"${process.env.APPIMAGE}"`
  if (!app.isPackaged) return `"${process.execPath}" "${app.getAppPath()}"`
  return `"${process.execPath}"`
}

export function setAutoLaunch(enabled: boolean): void {
  if (process.platform === 'linux') {
    const file = linuxDesktopFile()
    if (!enabled) {
      rmSync(file, { force: true })
      return
    }
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(
      file,
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Sonora',
        `Exec=${linuxExec()} --hidden`,
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        ''
      ].join('\n')
    )
    return
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
}
