import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { ListMusic } from 'lucide-react'
import type { Track } from '@shared/types'
import { useClient } from '@renderer/shared/sessionStore'
import { nav } from '../nav'
import { playlists, usePlaylists } from '../playlists'
import { GhostButton, PrimaryButton, Spinner } from './ui'

/** Mounted once by the shell; opens whenever something calls `playlists.newPlaylist()`. */
export function NewPlaylistDialog() {
  const draft = usePlaylists((s) => s.draft)
  if (!draft) return null
  // Remounts on every open, because the store drops the draft on close, so the form starts clean.
  return <Dialog tracks={draft} />
}

function Dialog({ tracks }: { tracks: Track[] }) {
  const client = useClient()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') playlists.closeDialog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!client || !trimmed || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const id = await client.createPlaylist(
        trimmed,
        tracks.map((t) => t.id)
      )
      playlists.changed()
      playlists.closeDialog()
      nav.go({ name: 'playlist', id })
    } catch (err) {
      setError((err as Error).message ?? String(err))
      setBusy(false)
    }
  }

  const seeded =
    tracks.length === 0
      ? 'Starts out empty. Add songs from any track menu.'
      : tracks.length === 1
        ? `Starts with "${tracks[0].title}".`
        : `Starts with ${tracks.length} songs.`

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
      onPointerDown={(e) => e.target === e.currentTarget && playlists.closeDialog()}
    >
      <form onSubmit={submit} className="w-[380px] rounded-xl border border-stroke bg-surface-2 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-ink-2">
            <ListMusic size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-lg font-bold tracking-tight">New playlist</div>
            <div className="truncate text-xs text-ink-3">{seeded}</div>
          </div>
        </div>
        <label className="mb-5 block">
          <span className="mb-1 block text-xs font-semibold text-ink-2">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My playlist"
            maxLength={120}
            className="w-full rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:bg-white/[0.08]"
          />
        </label>
        {error && <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
        <div className="flex justify-end gap-2">
          <GhostButton onClick={playlists.closeDialog} disabled={busy}>
            Cancel
          </GhostButton>
          <PrimaryButton type="submit" disabled={!client || !name.trim() || busy}>
            {busy ? <Spinner className="h-4 w-4 border-black/20 border-t-black" /> : 'Create'}
          </PrimaryButton>
        </div>
      </form>
    </div>,
    document.body
  )
}
