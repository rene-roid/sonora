import { useState, type FormEvent } from 'react'
import { Spinner } from './components/ui'

export function Login() {
  const [server, setServer] = useState('http://localhost:4533')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await window.sonora.auth.login({ server, username, password })
      setPassword('')
    } catch (err) {
      const msg = (err as Error).message ?? String(err)
      setError(msg.replace(/^Error invoking remote method '[^']+': (SubsonicError|Error): /, ''))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:bg-white/[0.08]'

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="drag h-9 shrink-0" />
      <div className="flex flex-1 items-center justify-center">
        <form onSubmit={submit} className="w-[380px] rounded-xl border border-stroke bg-surface-2 p-8 shadow-2xl">
          <div className="mb-6">
            <div className="text-2xl font-extrabold tracking-tight">Sonora</div>
            <div className="mt-1 text-sm text-ink-2">Connect to your Navidrome server</div>
          </div>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold text-ink-2">Server URL</span>
            <input className={field} value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://music.example.com" autoFocus />
          </label>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold text-ink-2">Username</span>
            <input className={field} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="mb-5 block">
            <span className="mb-1 block text-xs font-semibold text-ink-2">Password</span>
            <input
              className={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
          <button
            type="submit"
            disabled={busy || !server || !username || !password}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? <Spinner className="h-4 w-4 border-black/20 border-t-black" /> : 'Sign in'}
          </button>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
            Your password is used once to derive a salted Subsonic token. Only that token is stored, encrypted with the
            Windows credential store.
          </p>
        </form>
      </div>
    </div>
  )
}
