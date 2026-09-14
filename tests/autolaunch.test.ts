import { expect, test } from 'bun:test'
import { existsSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock } from 'bun:test'

mock.module('electron', () => ({ app: { isPackaged: true, setLoginItemSettings: () => {} } }))
const { setAutoLaunch } = await import('../src/main/autolaunch')

test('linux autostart entry is written then removed', () => {
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'sonora-'))
  const file = join(process.env.XDG_CONFIG_HOME, 'autostart', 'sonora.desktop')
  setAutoLaunch(true)
  expect(readFileSync(file, 'utf8')).toContain(`Exec="${process.execPath}" --hidden`)
  setAutoLaunch(false)
  expect(existsSync(file)).toBe(false)
  setAutoLaunch(false) // idempotent when already gone
})
