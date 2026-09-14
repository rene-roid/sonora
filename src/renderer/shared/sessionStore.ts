import { create } from 'zustand'
import type { Session, Settings } from '@shared/types'
import { defaultSettings } from '@shared/types'
import { SubsonicClient } from '@shared/subsonic/client'

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
  const apply = (session: Session | null): void =>
    set({ loaded: true, session, client: session ? new SubsonicClient(session) : null })

  void window.sonora.auth.getSession().then(apply)
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
