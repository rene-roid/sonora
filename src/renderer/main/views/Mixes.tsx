import { Sparkles } from 'lucide-react'
import { capitalize } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { Tile, TileGrid, gradient } from '../components/AlbumCard'
import { TrackPage } from '../components/TrackPage'
import { SectionHeader } from '../components/ui'
import { buildMix, mixSeeds } from '../mixes'
import { recentOf } from '../recents'
import { useAsync } from '../useAsync'

const mixTitle = (value: string): string => `${capitalize(value)} Mix`
const mixRecent = (value: string) => recentOf({ name: 'mix', value }, mixTitle(value), 'Mix')

/** Home row. Renders nothing until the server has enough play history to seed from. */
export function MixRow() {
  const client = useClient()
  const state = useAsync('mixes', () => (client ? mixSeeds(client) : undefined), [client])
  if (!state.data?.length) return null
  return (
    <section className="mb-8">
      <SectionHeader title="Made for you" />
      <TileGrid>
        {state.data.map((value) => (
          <Tile
            key={value}
            title={mixTitle(value)}
            view={{ name: 'mix', value }}
            load={(c) => buildMix(c, value)}
            recent={mixRecent(value)}
            art={
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ background: gradient(mixTitle(value)) }}
              >
                <Sparkles size={22} />
              </div>
            }
          />
        ))}
      </TileGrid>
    </section>
  )
}

export function MixView({ value }: { value: string }) {
  const client = useClient()
  const state = useAsync(`mix:${value}`, () => (client ? buildMix(client, value) : undefined), [client, value])
  return <TrackPage eyebrow="Mix" title={mixTitle(value)} state={state} origin={mixRecent(value)} />
}
