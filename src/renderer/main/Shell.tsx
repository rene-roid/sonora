import { useEffect } from 'react'
import { useNav } from './nav'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { NowPlayingBar } from './NowPlayingBar'
import { QueuePanel } from './views/QueuePanel'
import { LyricsView } from './views/LyricsView'
import { Home } from './views/Home'
import { Albums } from './views/Albums'
import { Soundtracks } from './views/Soundtracks'
import { Artists } from './views/Artists'
import { Genres, GenreView } from './views/Genres'
import { Moods, MoodView } from './views/Moods'
import { MixView } from './views/Mixes'
import { ArtistView } from './views/ArtistView'
import { AlbumView } from './views/AlbumView'
import { PlaylistView } from './views/PlaylistView'
import { NewPlaylistDialog } from './components/NewPlaylistDialog'
import { SearchView } from './views/SearchView'
import { Favorites } from './views/Favorites'
import { SettingsView } from './views/SettingsView'
import { player, usePlayerStore } from '@renderer/shared/playerStore'

function Content() {
  const view = useNav((s) => s.view)
  switch (view.name) {
    case 'home':
      return <Home />
    case 'albums':
      return <Albums />
    case 'soundtracks':
      return <Soundtracks />
    case 'artists':
      return <Artists />
    case 'genres':
      return <Genres />
    case 'genre':
      return <GenreView value={view.value} />
    case 'moods':
      return <Moods />
    case 'mood':
      return <MoodView value={view.value} />
    case 'mix':
      return <MixView value={view.value} kind={view.kind} />
    case 'artist':
      return <ArtistView id={view.id} />
    case 'album':
      return <AlbumView id={view.id} discIds={view.discIds} />
    case 'playlist':
      return <PlaylistView id={view.id} />
    case 'search':
      return <SearchView query={view.query} />
    case 'favorites':
      return <Favorites />
    case 'settings':
      return <SettingsView />
  }
}

export function Shell() {
  const showQueue = useNav((s) => s.showQueue)
  const showLyrics = useNav((s) => s.showLyrics)
  const view = useNav((s) => s.view)

  // Space toggles playback unless typing in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.code === 'Space') {
        e.preventDefault()
        player.toggle()
      } else if (e.ctrlKey && e.code === 'ArrowRight') player.next()
      else if (e.ctrlKey && e.code === 'ArrowLeft') player.prev()
      else if (e.ctrlKey && e.code === 'ArrowUp') player.setVolume(Math.min(1, usePlayerStore.getState().volume + 0.05))
      else if (e.ctrlKey && e.code === 'ArrowDown') player.setVolume(Math.max(0, usePlayerStore.getState().volume - 0.05))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col bg-surface">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden bg-gradient-to-b from-surface-2 to-surface">
          <div key={JSON.stringify(view)} className="h-full overflow-y-auto p-6 pb-10">
            <Content />
          </div>
          {showLyrics && <LyricsView />}
        </main>
        {showQueue && <QueuePanel />}
      </div>
      <NowPlayingBar />
      <NewPlaylistDialog />
    </div>
  )
}
