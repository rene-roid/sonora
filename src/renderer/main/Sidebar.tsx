import { Disc3, Film, Heart, Home, ListMusic, Mic2, Plus, Settings, Smile, Sparkles, Tags } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { SubsonicClient } from '@shared/subsonic/client'
import { useClient, useSessionStore } from '@renderer/shared/sessionStore'
import { nav, useNav, type View } from './nav'
import { playlists, usePlaylistsRevision } from './playlists'
import { useAsync } from './useAsync'

/** How often the server is pinged to refresh the connectivity dot. */
const PING_MS = 30_000

/** true = server answered, false = unreachable, undefined = not checked yet. */
function useServerStatus(client: SubsonicClient | null): boolean | undefined {
  const [ok, setOk] = useState<boolean>()

  useEffect(() => {
    setOk(undefined)
    if (!client) return
    let cancelled = false
    const check = (): void => {
      void client.ping().then(
        () => !cancelled && setOk(true),
        () => !cancelled && setOk(false)
      )
    }
    const offline = (): void => setOk(false)
    check()
    const id = setInterval(check, PING_MS)
    window.addEventListener('online', check)
    window.addEventListener('offline', offline)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('online', check)
      window.removeEventListener('offline', offline)
    }
  }, [client])

  return ok
}

function StatusDot({ ok }: { ok: boolean | undefined }) {
  const label = ok === undefined ? 'Checking server…' : ok ? 'Connected' : 'Server unreachable'
  return (
    <span className="group/dot relative flex items-center">
      <span
        aria-label={label}
        role="status"
        className={`h-2 w-2 shrink-0 rounded-full ${
          ok === undefined ? 'bg-white/40' : ok ? 'bg-green-400' : 'bg-red-400'
        }`}
      />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden max-w-[200px] -translate-x-1/2 truncate rounded-md border border-stroke bg-surface-3 px-2 py-1 text-[11px] whitespace-nowrap text-ink shadow-lg group-hover/dot:block">
        {label}
      </span>
    </span>
  )
}

function NavItem({ view, icon, before, label }: { view: View; icon: ReactNode; before?: ReactNode; label: string }) {
  const current = useNav((s) => s.view)
  const active =
    current.name === view.name && (view.name !== 'playlist' || (current as { id?: string }).id === (view as { id?: string }).id)
  return (
    <button
      onClick={() => nav.go(view)}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-[13px] transition ${
        active ? 'bg-white/10 font-semibold text-ink' : 'text-ink-2 hover:bg-white/[0.06] hover:text-ink'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex min-w-0 items-center gap-2">
        {before}
        <span className="truncate">{label}</span>
      </span>
    </button>
  )
}

/** `asPage`: rendered as the phone's Library view instead of a desktop side column. */
export function Sidebar({ asPage = false }: { asPage?: boolean }) {
  const client = useClient()
  const session = useSessionStore((s) => s.session)
  const revision = usePlaylistsRevision()
  const list = useAsync('playlists', () => client?.getPlaylists(), [client, revision])
  const online = useServerStatus(client)

  return (
    <aside className={asPage ? 'flex w-full flex-col' : 'hidden w-[232px] shrink-0 flex-col border-r border-stroke bg-surface md:flex'}>
      <nav className="space-y-0.5 p-2 pt-1">
        <NavItem view={{ name: 'home' }} icon={<Home size={16} />} label="Home" />
        <NavItem view={{ name: 'albums' }} icon={<Disc3 size={16} />} label="Albums" />
        <NavItem view={{ name: 'soundtracks' }} icon={<Film size={16} />} label="Soundtracks" />
        <NavItem view={{ name: 'artists' }} icon={<Mic2 size={16} />} label="Artists" />
        <NavItem view={{ name: 'mixes' }} icon={<Sparkles size={16} />} label="Mixes" />
        <NavItem view={{ name: 'genres' }} icon={<Tags size={16} />} label="Genres" />
        <NavItem view={{ name: 'moods' }} icon={<Smile size={16} />} label="Moods" />
        <NavItem view={{ name: 'favorites' }} icon={<Heart size={16} />} label="Favorites" />
      </nav>
      <div className="mx-4 my-1 border-t border-stroke" />
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Playlists</span>
        <button
          className="icon-btn h-6 w-6"
          title="New playlist"
          disabled={!client}
          onClick={() => playlists.newPlaylist()}
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.loading && <div className="px-3 py-2 text-xs text-ink-3">Loading…</div>}
        {list.error && (
          <div className="px-3 py-2 text-xs text-red-300">
            <div>{list.error}</div>
            <button
              className="mt-1.5 rounded-md bg-white/10 px-2 py-1 text-ink hover:bg-white/15"
              onClick={list.reload}
            >
              Retry
            </button>
          </div>
        )}
        {list.data?.length === 0 && <div className="px-3 py-2 text-xs text-ink-3">No playlists yet</div>}
        {list.data?.map((p) => (
          <NavItem key={p.id} view={{ name: 'playlist', id: p.id }} icon={<ListMusic size={15} />} label={p.name} />
        ))}
      </div>
      <div className="border-t border-stroke p-2">
        <NavItem
          view={{ name: 'settings' }}
          icon={<Settings size={16} />}
          before={<StatusDot ok={online} />}
          label={session?.username ?? 'Settings'}
        />
      </div>
    </aside>
  )
}
