import { Heart, Home, Library, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { nav, useNav, type View } from './nav'

const TABS: { view: View; icon: ReactNode; label: string }[] = [
  { view: { name: 'home' }, icon: <Home size={20} />, label: 'Home' },
  { view: { name: 'library' }, icon: <Library size={20} />, label: 'Library' },
  { view: { name: 'favorites' }, icon: <Heart size={20} />, label: 'Favorites' },
  { view: { name: 'settings' }, icon: <Settings size={20} />, label: 'Settings' }
]

/** Phone navigation; the sidebar's job below the md breakpoint. */
export function BottomTabs() {
  const current = useNav((s) => s.view.name)
  return (
    <nav className="flex h-14 shrink-0 items-stretch border-t border-stroke bg-surface md:hidden">
      {TABS.map(({ view, icon, label }) => (
        <button
          key={view.name}
          onClick={() => nav.go(view)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
            current === view.name ? 'text-accent' : 'text-ink-2'
          }`}
        >
          {icon}
          {label}
        </button>
      ))}
    </nav>
  )
}
