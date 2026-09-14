import { Play, Shuffle } from 'lucide-react'
import { formatDuration } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { Cover } from '@renderer/shared/Cover'
import { TrackList } from '../components/TrackList'
import { ErrorBox, GhostButton, Loading, PageTitle, PrimaryButton } from '../components/ui'
import { useAsync } from '../useAsync'
import { useRecent } from '../recents'

export function PlaylistView({ id }: { id: string }) {
  const client = useClient()
  const state = useAsync(`playlist:${id}`, () => client?.getPlaylist(id), [client, id])
  useRecent(
    state.data && {
      key: `playlist:${id}`,
      view: { name: 'playlist', id },
      title: state.data.name,
      coverArt: state.data.coverArt ?? state.data.entry[0]?.coverArt
    }
  )

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const pl = state.data
  const songs = pl.entry
  const total = songs.reduce((s, t) => s + t.duration, 0)

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
            <PrimaryButton onClick={() => player.setQueue(songs, 0, true)} disabled={!songs.length}>
              <Play size={16} fill="currentColor" /> Play
            </PrimaryButton>
            <GhostButton
              disabled={!songs.length}
              onClick={() => {
                player.setShuffle(true)
                player.setQueue(songs, Math.floor(Math.random() * songs.length), true)
              }}
            >
              <Shuffle size={16} /> Shuffle
            </GhostButton>
          </>
        }
      />
      <TrackList
        tracks={songs}
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
