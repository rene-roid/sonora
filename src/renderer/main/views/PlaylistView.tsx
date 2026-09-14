import { Play, Shuffle } from 'lucide-react'
import { formatDuration } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { Cover } from '@renderer/shared/Cover'
import { TrackList } from '../components/TrackList'
import { ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton } from '../components/ui'
import { recentOf, playFrom } from '../recents'
import { useAsync } from '../useAsync'

export function PlaylistView({ id }: { id: string }) {
  const client = useClient()
  const state = useAsync(`playlist:${id}`, () => client?.getPlaylist(id), [client, id])

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const pl = state.data
  const songs = pl.entry
  const total = songs.reduce((s, t) => s + t.duration, 0)
  const origin = recentOf({ name: 'playlist', id }, pl.name, 'Playlist', pl.coverArt ?? songs[0]?.coverArt)

  return (
    <div>
      <PageTitle
        eyebrow="Playlist"
        title={pl.name}
        cover={<Cover id={pl.coverArt ?? songs[0]?.coverArt} size={500} className="h-52 w-52 shadow-2xl" />}
        subtitle={
          <span>
            {pl.owner ? `${pl.owner} · ` : ''}
            {songs.length} song{songs.length === 1 ? '' : 's'}, {formatDuration(total)}
            {pl.comment ? ` · ${pl.comment}` : ''}
          </span>
        }
        actions={
          <>
            <PrimaryButton onClick={() => playFrom(songs, 0, origin)} disabled={!songs.length}>
              <Play size={16} fill="currentColor" /> Play
            </PrimaryButton>
            <GhostButton
              disabled={!songs.length}
              onClick={() => {
                player.setShuffle(true)
                playFrom(songs, Math.floor(Math.random() * songs.length), origin)
              }}
            >
              <Shuffle size={16} /> Shuffle
            </GhostButton>
          </>
        }
      />
      <TrackList
        tracks={songs}
        origin={origin}
        removeLabel="Remove from this playlist"
        onRemove={async (i) => {
          if (!client) return
          await client.updatePlaylist(id, { songIndexToRemove: [i] })
          state.reload()
        }}
      />
    </div>
  )
}
