import { capitalize } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { CardGrid, TagCard } from '../components/AlbumCard'
import { TrackPage } from '../components/TrackPage'
import { SectionHeader } from '../components/ui'
import { buildMix, mixSeeds } from '../mixes'
import { nav } from '../nav'
import { useAsync } from '../useAsync'

const mixTitle = (value: string): string => `${capitalize(value)} Mix`

/** Home row. Renders nothing until the server has enough play history to seed from. */
export function MixRow() {
  const client = useClient()
  const state = useAsync('mixes', () => (client ? mixSeeds(client) : undefined), [client])
  if (!state.data?.length) return null
  return (
    <section className="mb-8">
      <SectionHeader title="Made for you" />
      <CardGrid>
        {state.data.map((value) => (
          <TagCard
            key={value}
            name={mixTitle(value)}
            subtitle="Refreshed daily"
            onClick={() => nav.go({ name: 'mix', value })}
          />
        ))}
      </CardGrid>
    </section>
  )
}

export function MixView({ value }: { value: string }) {
  const client = useClient()
  const state = useAsync(`mix:${value}`, () => (client ? buildMix(client, value) : undefined), [client, value])
  return <TrackPage eyebrow="Mix" title={mixTitle(value)} state={state} />
}
