import type { Session } from './types'
import { SubsonicClient, credentialsFromPassword, normalizeServerUrl, pickFastestServer } from './subsonic/client'

/**
 * Session transforms with no persistence in them. Main wraps these with safeStorage and IPC
 * broadcasts; the mobile bridge wraps them with Preferences.
 */

/** Keep the candidate list a deduped superset that always contains the active server. */
export function withServers(s: Session): Session {
  return { ...s, servers: [...new Set([s.server, ...(s.servers ?? [])])] }
}

/** Build and verify a session from a login form. Throws SubsonicError on bad credentials / unreachable server. */
export async function loginSession(input: { server: string; username: string; password: string }): Promise<Session> {
  const server = normalizeServerUrl(input.server)
  const session: Session = {
    server,
    servers: [server],
    username: input.username.trim(),
    ...credentialsFromPassword(input.password)
  }
  await new SubsonicClient(session).ping()
  return session
}

/** Same account? Recents, saved mixes and picked backgrounds belong to the one that left otherwise. */
export function sameAccount(a: Session | null, b: Session): boolean {
  return a?.username === b.username && a.server === b.server
}

/** Replace the candidate URL list, keeping the active pick when it is still listed. Null when the list is empty. */
export function withServerList(session: Session, urls: string[]): Session | null {
  const servers = [...new Set(urls.map(normalizeServerUrl).filter(Boolean))]
  if (servers.length === 0) return null
  return { ...session, servers, server: servers.includes(session.server) ? session.server : servers[0] }
}

/** Ping all candidates and switch to whichever answers first. Keeps the current pick if none do. */
export async function reselectServer(session: Session): Promise<Session> {
  if ((session.servers?.length ?? 0) < 2) return session
  try {
    const server = await pickFastestServer(session, session.servers!)
    return server === session.server ? session : { ...session, server }
  } catch {
    return session // nothing answered; leave the pick alone so a flaky network is not destructive
  }
}
