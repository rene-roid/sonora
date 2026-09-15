import type { MixKind } from '@shared/types'
import { capitalize } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { Tile, TileGrid } from '../components/AlbumCard'
import { TagArt } from '../components/TagArt'
import { TrackPage } from '../components/TrackPage'
import { SectionHeader } from '../components/ui'
import { buildMix, mixSeeds, type MixSeed } from '../mixes'
import { recentOf } from '../recents'
import { useAsync } from '../useAsync'

/** Tag text arrives lowercased from most taggers; an artist's name is already cased how they want it. */
const mixTitle = (s: MixSeed): string => `${s.kind === 'artist' ? s.value : capitalize(s.value)} Mix`
const mixLabel = (s: MixSeed): string => `${capitalize(s.kind)} mix`
const mixRecent = (s: MixSeed) => recentOf({ name: 'mix', kind: s.kind, value: s.value }, mixTitle(s), mixLabel(s))

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
              load={(c) => buildMix(c, seed)}
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

export function MixView({ value, kind = 'genre' }: { value: string; kind?: MixKind }) {
  const client = useClient()
  const seed: MixSeed = { kind, value }
  const state = useAsync(
    `mix:${kind}:${value}`,
    () => (client ? buildMix(client, seed) : undefined),
    [client, kind, value]
  )
  return <TrackPage eyebrow={mixLabel(seed)} title={mixTitle(seed)} state={state} origin={mixRecent(seed)} />
}
