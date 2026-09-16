import { Music2 } from 'lucide-react'
import { useState } from 'react'
import { localArtUrl } from '@shared/art'
import { useClient, useSettings } from './sessionStore'

/**
 * Where a cover is loaded from: Sonora's own copy over `sonora-art://` while the image cache has a
 * budget, and straight off the server when it is turned off. The cached path is why a second visit
 * to a page paints instantly -- main keeps the file, so nothing goes over the network again.
 */
export function useCoverUrl(id: string | undefined, size = 300): string | undefined {
  const client = useClient()
  const cached = useSettings().artCacheMaxMb > 0
  return cached ? localArtUrl(id) : client?.coverArtUrl(id, size)
}

export function Cover({
  id,
  size = 300,
  className = '',
  rounded = 'rounded-md'
}: {
  id?: string
  size?: number
  className?: string
  rounded?: string
}) {
  const [failed, setFailed] = useState(false)
  const source = useCoverUrl(id, size)
  const url = failed ? undefined : source
  return (
    <div className={`relative shrink-0 overflow-hidden bg-surface-3 ${rounded} ${className}`}>
      {url ? (
        // A track list or an artist grid is thousands of these, and the server is asked for every
        // one it decodes: lazy keeps that to what has been scrolled to, async keeps the decode off
        // the main thread so a long list still scrolls while its covers arrive.
        <img
          src={url}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-3">
          <Music2 className="h-1/3 w-1/3" />
        </div>
      )}
    </div>
  )
}
