import { Disc3, Heart, Home, ListMusic, Mic2, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useClient, useSessionStore } from '@renderer/shared/sessionStore'
import { nav, useNav, type View } from './nav'
import { useAsync } from './useAsync'

function NavItem({ view, icon, label }: { view: View; icon: ReactNode; label: string }) {
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
      <span className="truncate">{label}</span>
    </button>
  )
}

export function Sidebar() {
  const client = useClient()
  const session = useSessionStore((s) => s.session)
  const playlists = useAsync('playlists', () => client?.getPlaylists(), [client])

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-stroke bg-surface">
      <nav className="space-y-0.5 p-2 pt-1">
        <NavItem view={{ name: 'home' }} icon={<Home size={16} />} label="Home" />
        <NavItem view={{ name: 'albums' }} icon={<Disc3 size={16} />} label="Albums" />
        <NavItem view={{ name: 'artists' }} icon={<Mic2 size={16} />} label="Artists" />
        <NavItem view={{ name: 'favorites' }} icon={<Heart size={16} />} label="Favorites" />
      </nav>
      <div className="mx-4 my-1 border-t border-stroke" />
      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Playlists</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {playlists.loading && <div className="px-3 py-2 text-xs text-ink-3">Loading…</div>}
        {playlists.error && (
          <div className="px-3 py-2 text-xs text-red-300">
            <div>{playlists.error}</div>
            <button
              className="mt-1.5 rounded-md bg-white/10 px-2 py-1 text-ink hover:bg-white/15"
              onClick={playlists.reload}
            >
              Retry
            </button>
          </div>
        )}
        {playlists.data?.length === 0 && <div className="px-3 py-2 text-xs text-ink-3">No playlists yet</div>}
        {playlists.data?.map((p) => (
          <NavItem key={p.id} view={{ name: 'playlist', id: p.id }} icon={<ListMusic size={15} />} label={p.name} />
        ))}
      </div>
      <div className="border-t border-stroke p-2">
        <NavItem view={{ name: 'settings' }} icon={<Settings size={16} />} label={session?.username ?? 'Settings'} />
      </div>
    </aside>
  )
}
