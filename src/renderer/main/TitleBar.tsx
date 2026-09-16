import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { nav, useNav } from './nav'

export function TitleBar() {
  const cursor = useNav((s) => s.cursor)
  const historyLength = useNav((s) => s.history.length)
  const view = useNav((s) => s.view)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (view.name !== 'search') setQuery('')
  }, [view])

  useEffect(() => {
    if (!query.trim()) return
    const t = window.setTimeout(() => {
      const current = useNav.getState().view
      if (current.name === 'search') {
        useNav.setState((s) => {
          const history = [...s.history]
          history[s.cursor] = { name: 'search', query: query.trim() }
          return { history, view: history[s.cursor] }
        })
      } else {
        nav.go({ name: 'search', query: query.trim() })
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [query])

  return (
    <header className="drag flex h-11 shrink-0 items-center gap-2 bg-surface px-3 text-sm md:h-9 md:pr-[140px]">
      <div className="mr-2 hidden text-[13px] font-bold tracking-tight md:block">Sonora</div>
      <div className="no-drag flex items-center gap-0.5">
        <button className="icon-btn h-7 w-7" onClick={nav.back} disabled={cursor === 0} title="Back">
          <ChevronLeft size={16} />
        </button>
        <button className="icon-btn hidden h-7 w-7 md:inline-flex" onClick={nav.forward} disabled={cursor >= historyLength - 1} title="Forward">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="no-drag relative ml-2 min-w-0 flex-1 md:w-[320px] md:flex-none">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="Search songs, albums, artists"
          className="h-7 w-full rounded-full border border-white/10 bg-white/[0.06] pr-7 pl-8 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
        {query && (
          <button className="absolute top-1/2 right-1.5 -translate-y-1/2 text-ink-3 hover:text-ink" onClick={() => setQuery('')}>
            <X size={13} />
          </button>
        )}
      </div>
    </header>
  )
}
