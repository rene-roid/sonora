import { Music2 } from 'lucide-react'
import { useState } from 'react'
import { useClient } from './sessionStore'

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
  const client = useClient()
  const [failed, setFailed] = useState(false)
  const url = !failed ? client?.coverArtUrl(id, size) : undefined
  return (
    <div className={`relative shrink-0 overflow-hidden bg-surface-3 ${rounded} ${className}`}>
      {url ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-3">
          <Music2 className="h-1/3 w-1/3" />
        </div>
      )}
    </div>
  )
}
