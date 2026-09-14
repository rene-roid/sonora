import { safeStorage } from 'electron'
import { store } from './store'
import type { Session } from '@shared/types'

/**
 * Credential storage backed by Electron's safeStorage (DPAPI on Windows, Keychain on macOS,
 * libsecret on Linux). Only the derived Subsonic token + salt are stored, never the password.
 */

/** Keep the candidate list a deduped superset that always contains the active server. */
function withServers(s: Session): Session {
  return { ...s, servers: [...new Set([s.server, ...(s.servers ?? [])])] }
}

export function loadSession(): Session | null {
  const rec = store.get('credentials')
  if (!rec) return null
  try {
    const json = rec.encrypted
      ? safeStorage.decryptString(Buffer.from(rec.data, 'base64'))
      : Buffer.from(rec.data, 'base64').toString('utf8')
    const s = JSON.parse(json) as Session
    if (!s.server || !s.username || !s.token || !s.salt) return null
    return withServers(s)
  } catch (err) {
    console.error('[credentials] failed to read session', err)
    return null
  }
}

export function saveSession(session: Session): void {
  const json = JSON.stringify(withServers(session))
  if (safeStorage.isEncryptionAvailable()) {
    store.set('credentials', { encrypted: true, data: safeStorage.encryptString(json).toString('base64') })
  } else {
    console.warn('[credentials] OS encryption unavailable; storing derived token unencrypted')
    store.set('credentials', { encrypted: false, data: Buffer.from(json, 'utf8').toString('base64') })
  }
}

export function clearSession(): void {
  store.delete('credentials')
}
