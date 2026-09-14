import { useState } from 'react'
import {
  ArrowLeft,
  Disc3,
  Heart,
  HeartOff,
  ListEnd,
  ListMusic,
  ListPlus,
  Mic2,
  Play,
  Plus,
  Trash2,
  Volume2
} from 'lucide-react'
import type { RecentItem, Track } from '@shared/types'
import { formatTime } from '@shared/format'
import { Cover } from '@renderer/shared/Cover'
import { player, usePlayerState } from '@renderer/shared/playerStore'
import { useClient } from '@renderer/shared/sessionStore'
import { nav } from '../nav'
import { playFrom } from '../recents'
import { useAsync } from '../useAsync'
import { ContextMenu, MenuItem, MenuLabel, MenuSeparator, useContextMenu } from './ContextMenu'

export function TrackList({
  tracks,
  showAlbum = true,
  showCover = true,
  numbered = false,
  discs = false,
  onRemove,
  removeLabel = 'Remove',
  origin
}: {
  tracks: Track[]
  showAlbum?: boolean
  showCover?: boolean
  numbered?: boolean
  /** Insert a "Disc N" heading per disc. Ignored when the tracks all sit on one disc. */
  discs?: boolean
  /** Given, the context menu offers a removal entry for the row at `index`. */
  onRemove?: (index: number) => void
  removeLabel?: string
  /** The page these rows belong to, for Home's shelf. Omitted, a row counts as a song on its own. */
  origin?: RecentItem | null
}) {
  const currentId = usePlayerState((s) => s.track?.id)
  const playing = usePlayerState((s) => s.playing)
  const client = useClient()
  const menu = useContextMenu()
  const [menuIndex, setMenuIndex] = useState(0)
  // Server state only refreshes on reload, so remember toggles made here.
  const [starred, setStarred] = useState<Record<string, boolean>>({})
  const isStarred = (t: Track): boolean => starred[t.id] ?? Boolean(t.starred)

  const toggleStar = async (t: Track): Promise<void> => {
    if (!client) return
    const next = !isStarred(t)
    setStarred((s) => ({ ...s, [t.id]: next }))
    try {
      await (next ? client.star(t.id) : client.unstar(t.id))
    } catch {
      setStarred((s) => ({ ...s, [t.id]: !next }))
    }
  }

  if (!tracks.length) return <div className="py-10 text-center text-sm text-ink-3">No tracks</div>

  const multiDisc = discs && new Set(tracks.map((t) => t.disc ?? 1)).size > 1

  return (
    <div className="text-sm">
      <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-stroke px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-3 md:grid-cols-[40px_1fr_1fr_110px_60px]">
        <div className="text-center">#</div>
        <div>Title</div>
        {showAlbum ? <div className="hidden md:block">Album</div> : <div className="hidden md:block" />}
        <div className="hidden md:block" />
        <div className="text-right">Time</div>
      </div>
      {tracks.map((t, i) => {
        const isCurrent = t.id === currentId
        const fav = isStarred(t)
        const disc = t.disc ?? 1
        const row = (
          <div
            key={`${t.id}-${i}`}
            onDoubleClick={() => playFrom(tracks, i, origin)}
            onContextMenu={(e) => {
              setMenuIndex(i)
              menu.open(e)
            }}
            className={`group grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-md px-3 py-1.5 hover:bg-white/[0.06] md:grid-cols-[40px_1fr_1fr_110px_60px] ${
              isCurrent ? 'text-accent' : ''
            }`}
          >
            <div className="flex items-center justify-center text-ink-3">
              <span className="group-hover:hidden">
                {isCurrent && playing ? <Volume2 size={14} className="text-accent" /> : numbered ? (t.track ?? i + 1) : i + 1}
              </span>
              <button className="hidden text-ink group-hover:block" onClick={() => playFrom(tracks, i, origin)} title="Play">
                <Play size={14} fill="currentColor" />
              </button>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              {showCover && <Cover id={t.coverArt} size={80} className="h-10 w-10" />}
              <div className="min-w-0">
                <div className={`truncate font-medium ${isCurrent ? 'text-accent' : 'text-ink'}`}>{t.title}</div>
                <div className="truncate text-xs text-ink-2">
                  {t.artistId ? (
                    <button className="hover:underline" onClick={() => nav.go({ name: 'artist', id: t.artistId! })}>
                      {t.artist}
                    </button>
                  ) : (
                    t.artist
                  )}
                </div>
              </div>
            </div>
            {showAlbum ? (
              <div className="hidden truncate text-ink-2 md:block">
                {t.albumId ? (
                  <button className="truncate hover:underline" onClick={() => nav.go({ name: 'album', id: t.albumId! })}>
                    {t.album}
                  </button>
                ) : (
                  t.album
                )}
              </div>
            ) : (
              <div className="hidden md:block" />
            )}
            <div className="hidden items-center justify-end gap-1 md:flex">
              <button
                className={`icon-btn h-7 w-7 ${fav ? 'text-accent hover:text-accent' : 'opacity-0 group-hover:opacity-100'}`}
                title={fav ? 'Remove from favorites' : 'Add to favorites'}
                disabled={!client}
                onClick={() => void toggleStar(t)}
              >
                <Heart size={14} fill={fav ? 'currentColor' : 'none'} />
              </button>
              <button
                className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100"
                title="Play next"
                onClick={() => player.addToQueue([t], true)}
              >
                <ListEnd size={15} />
              </button>
              <button
                className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100"
                title="Add to queue"
                onClick={() => player.addToQueue([t])}
              >
                <ListPlus size={15} />
              </button>
            </div>
            <div className="text-right tabular-nums text-ink-2">{formatTime(t.duration)}</div>
          </div>
        )
        if (!multiDisc || (i > 0 && (tracks[i - 1].disc ?? 1) === disc)) return row
        return (
          <div key={`disc-${disc}-${i}`}>
            <div className={`flex items-center gap-2 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-3 ${i > 0 ? 'mt-5 border-t border-stroke pt-4' : 'pt-3'}`}>
              <Disc3 size={13} /> Disc {disc}
            </div>
            {row}
          </div>
        )
      })}
      {menu.pos && tracks[menuIndex] && (
        <TrackMenu
          pos={menu.pos}
          track={tracks[menuIndex]}
          starred={isStarred(tracks[menuIndex])}
          onClose={menu.close}
          onPlay={() => playFrom(tracks, menuIndex, origin)}
          onToggleStar={() => void toggleStar(tracks[menuIndex])}
          onRemove={onRemove && (() => onRemove(menuIndex))}
          removeLabel={removeLabel}
        />
      )}
    </div>
  )
}

/** Row menu, also used by the now-playing bar. */
export function TrackMenu({
  pos,
  track,
  starred,
  onClose,
  onPlay,
  onToggleStar,
  onRemove,
  removeLabel = 'Remove'
}: {
  pos: { x: number; y: number }
  track: Track
  starred: boolean
  onClose: () => void
  onPlay: () => void
  onToggleStar: () => void
  onRemove?: () => void
  removeLabel?: string
}) {
  const client = useClient()
  const [picking, setPicking] = useState(false)
  // Already warm from the sidebar's copy of the same key, so the picker opens without a wait.
  const playlists = useAsync('playlists', () => (picking ? client?.getPlaylists() : undefined), [client, picking])

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const addTo = (id: string): void => {
    void client?.updatePlaylist(id, { songIdToAdd: [track.id] })
    onClose()
  }

  return (
    <ContextMenu pos={pos} onClose={onClose}>
      {picking ? (
        <>
          <MenuItem icon={<ArrowLeft size={14} />} onClick={() => setPicking(false)}>
            Add to playlist
          </MenuItem>
          <MenuSeparator />
          {playlists.loading && <MenuLabel>Loading…</MenuLabel>}
          {playlists.error && <MenuLabel>{playlists.error}</MenuLabel>}
          {playlists.data?.length === 0 && <MenuLabel>No playlists</MenuLabel>}
          {playlists.data?.map((p) => (
            <MenuItem key={p.id} icon={<ListMusic size={14} />} onClick={() => addTo(p.id)}>
              {p.name}
            </MenuItem>
          ))}
        </>
      ) : (
        <>
          <MenuLabel>{track.title}</MenuLabel>
          <MenuItem icon={<Play size={14} />} onClick={run(onPlay)}>
            Play
          </MenuItem>
          <MenuItem icon={<ListEnd size={14} />} onClick={run(() => player.addToQueue([track], true))}>
            Play next
          </MenuItem>
          <MenuItem icon={<ListPlus size={14} />} onClick={run(() => player.addToQueue([track]))}>
            Add to queue
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Plus size={14} />} onClick={() => setPicking(true)} disabled={!client} hint="›">
            Add to playlist
          </MenuItem>
          <MenuItem
            icon={starred ? <HeartOff size={14} /> : <Heart size={14} />}
            onClick={run(onToggleStar)}
            disabled={!client}
          >
            {starred ? 'Remove from favorites' : 'Add to favorites'}
          </MenuItem>
          {(track.albumId || track.artistId) && <MenuSeparator />}
          {track.albumId && (
            <MenuItem icon={<Disc3 size={14} />} onClick={run(() => nav.go({ name: 'album', id: track.albumId! }))}>
              Go to album
            </MenuItem>
          )}
          {track.artistId && (
            <MenuItem icon={<Mic2 size={14} />} onClick={run(() => nav.go({ name: 'artist', id: track.artistId! }))}>
              Go to artist
            </MenuItem>
          )}
          {onRemove && (
            <>
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={14} />} onClick={run(onRemove)} danger>
                {removeLabel}
              </MenuItem>
            </>
          )}
        </>
      )}
    </ContextMenu>
  )
}
