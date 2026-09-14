import { create } from 'zustand'
import type { Session, Settings } from '@shared/types'
import { defaultSettings } from '@shared/types'
import { SubsonicClient } from '@shared/subsonic/client'
import { setCacheScope } from './cache'

interface SessionState {
  loaded: boolean
  session: Session | null
  client: SubsonicClient | null
  settings: Settings
}

export const useSessionStore = create<SessionState>(() => ({
  loaded: false,
  session: null,
  client: null,
  settings: defaultSettings
}))

let initialised = false

export function initSessionBridge(): void {
  if (initialised) return
  initialised = true
  const set = useSessionStore.setState
  const apply = (session: Session | null): void => {
    // Scoped to the first candidate, not the active one, so failing over keeps the cached views warm.
    setCacheScope(session ? `${session.servers?.[0] ?? session.server}|${session.username}` : '')
    set({
      loaded: true,
      session,
      // A failover inside the client is reported back so main persists the new active server.
      client: session ? new SubsonicClient(session, undefined, (s) => void window.sonora.auth.selectServer(s)) : null
    })
  }

  void window.sonora.auth.getSession().then((session) => {
    apply(session)
    // More than one candidate URL: find the quickest one now rather than on the first failure.
    if ((session?.servers?.length ?? 0) > 1) void window.sonora.auth.reselect()
  })
  window.sonora.auth.onChange(apply)
  void window.sonora.settings.get().then((settings) => set({ settings }))
  window.sonora.settings.onChange((settings) => set({ settings }))
}

export function useClient(): SubsonicClient | null {
  return useSessionStore((s) => s.client)
}

export function useSettings(): Settings {
  return useSessionStore((s) => s.settings)
}

export function coverUrl(client: SubsonicClient | null, id: string | undefined, size = 300): string | undefined {
  return client?.coverArtUrl(id, size)
}
