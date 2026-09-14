/**
 * One command to get Sonora running: mock server + electron-vite dev.
 *
 *   bun run go            # mock server on :4599 + dev app
 *   bun run go --no-mock  # dev app only (you have a real Navidrome)
 *
 * Also strips ELECTRON_RUN_AS_NODE, which editors like VS Code / T3 Code leak into
 * their terminals and which makes Electron boot as plain Node with no window.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const children: ChildProcess[] = []
const run = (cmd: string, args: string[]): ChildProcess => {
  const child = spawn(cmd, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
  children.push(child)
  return child
}

if (!process.argv.includes('--no-mock')) run('bun', ['run', 'scripts/mock-server.ts'])

const dev = run('bun', ['x', 'electron-vite', 'dev'])
dev.on('exit', (code) => {
  for (const c of children) if (c !== dev) c.kill()
  process.exit(code ?? 0)
})
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    for (const c of children) c.kill(sig)
  })
}
