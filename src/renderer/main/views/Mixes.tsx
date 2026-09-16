import { BookmarkCheck, BookmarkPlus, Trash2 } from 'lucide-react'
import type { MixKind, SavedMix } from '@shared/types'
import { capitalize } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { Tile, TileGrid } from '../components/AlbumCard'
import { TagArt, TagArtCover } from '../components/TagArt'
import { TrackPage } from '../components/TrackPage'
import { Empty, GhostButton, PageTitle, SectionHeader } from '../components/ui'
import { buildMix, mixSeeds, type MixSeed } from '../mixes'
import { allAlbums } from '../albumList'
import { nav } from '../nav'
import { recentOf } from '../recents'
import { findSavedMix, savedMixId, savedMixRecent, savedMixes, useSavedMixes } from '../savedMixes'
import { useAsync } from '../useAsync'

/** Tag text arrives lowercased from most taggers; an artist's name is already cased how they want it. */
const mixTitle = (s: MixSeed): string => `${s.kind === 'artist' ? s.value : capitalize(s.value)} Mix`
const mixLabel = (s: MixSeed): string => `${capitalize(s.kind)} mix`
const mixRecent = (s: MixSeed) => recentOf({ name: 'mix', kind: s.kind, value: s.value }, mixTitle(s), mixLabel(s))

const savedOn = (at: number): string => new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' })

/** Home row. Renders nothing until the server has enough play history to seed from. */
export function MixRow() {
  const client = useClient()
  // :2 because the cache is on disk and older builds stored bare genre strings under 'mixes'.
  const state = useAsync('mixes:2', () => (client ? mixSeeds(client) : undefined), [client])
  if (!state.data?.length) return null
  return (
    <section className="mb-8">
      <SectionHeader title="Made for you" />
      <TileGrid>
        {state.data.map((seed) => {
          const title = mixTitle(seed)
          return (
            <Tile
              key={`${seed.kind}:${seed.value}`}
              title={title}
              view={{ name: 'mix', kind: seed.kind, value: seed.value }}
              load={(c) => buildMix(c, seed, allAlbums)}
              recent={mixRecent(seed)}
              art={
                <div className="h-full w-full" title={mixLabel(seed)}>
                  <TagArt art={{ style: 'mix', seed }} name={title} />
                </div>
              }
            />
          )
        })}
      </TileGrid>
    </section>
  )
}

/** The kept lineups. Their songs are already in hand, so the tiles play without touching the server. */
function SavedMixRow({ mixes }: { mixes: SavedMix[] }) {
  return (
    <section className="mb-8">
      <SectionHeader title="My saved mixes" />
      {mixes.length === 0 ? (
        <Empty>
          Nothing saved yet. Open a mix below and hit <span className="text-ink-2">Save mix</span> to keep its lineup
          before tomorrow rolls a new one.
        </Empty>
      ) : (
        <TileGrid>
          {mixes.map((mix) => (
            <Tile
              key={mix.id}
              title={mix.title}
              view={{ name: 'savedMix', id: mix.id }}
              load={async () => mix.tracks}
              recent={savedMixRecent(mix)}
              art={
                <div className="h-full w-full" title={`Saved ${savedOn(mix.savedAt)}`}>
                  <TagArt art={{ style: 'mix', seed: mix.seed }} name={mix.title} />
                </div>
              }
            />
          ))}
        </TileGrid>
      )}
    </section>
  )
}

export function MixesView() {
  const saved = useSavedMixes()
  return (
    <div>
      <PageTitle title="Mixes" subtitle="Daily lineups built from what you actually play, and the ones you kept." />
      <SavedMixRow mixes={saved} />
      <MixRow />
    </div>
  )
}

export function MixView({ value, kind = 'genre' }: { value: string; kind?: MixKind }) {
  const client = useClient()
  const seed: MixSeed = { kind, value }
  const title = mixTitle(seed)
  const saved = useSavedMixes().some((m) => m.id === savedMixId(seed))
  const state = useAsync(
    `mix:${kind}:${value}`,
    () => (client ? buildMix(client, seed, allAlbums) : undefined),
    [client, kind, value]
  )
  return (
    <TrackPage
      eyebrow={mixLabel(seed)}
      title={title}
      state={state}
      origin={mixRecent(seed)}
      cover={<TagArtCover art={{ style: 'mix', seed }} name={title} />}
      actions={
        <GhostButton
          active={saved}
          disabled={!state.data?.length}
          title={saved ? 'This lineup is in My saved mixes' : 'Keep this lineup before tomorrow rolls a new one'}
          onClick={() => savedMixes.save(seed, title, state.data ?? [])}
        >
          {saved ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />} {saved ? 'Saved' : 'Save mix'}
        </GhostButton>
      }
    />
  )
}

/** A kept lineup, played back exactly as it was saved. */
export function SavedMixView({ id }: { id: string }) {
  const mix = findSavedMix(id)
  if (!mix) return <Empty>That saved mix is gone.</Empty>
  return (
    <TrackPage
      eyebrow="Saved mix"
      title={mix.title}
      state={{ data: mix.tracks, error: undefined, loading: false, reload: () => {} }}
      origin={savedMixRecent(mix)}
      cover={<TagArtCover art={{ style: 'mix', seed: mix.seed }} name={mix.title} />}
      actions={
        <GhostButton
          title="Remove this mix from My saved mixes"
          onClick={() => {
            savedMixes.remove(mix.id)
            nav.go({ name: 'mixes' })
          }}
        >
          <Trash2 size={16} /> Remove
        </GhostButton>
      }
    />
  )
}
