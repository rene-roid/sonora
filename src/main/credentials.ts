import { safeStorage } from 'electron'
import { store } from './store'
import type { Session } from '@shared/types'
import { withServers } from '@shared/auth'

/**
 * Credential storage backed by Electron's safeStorage (DPAPI on Windows, Keychain on macOS,
 * libsecret on Linux). Only the derived Subsonic token + salt are stored, never the password.
 */

/**
 * The decrypted session, kept in memory.
 *
 * Reading it costs a synchronous read of the whole config file plus an OS decrypt call, and the
 * hot callers ask for it per HTTP response and per cover-art hit, so it is resolved once and
 * held. Main is the only writer and the single-instance lock keeps it that way, so the only
 * thing that can invalidate this is a save or a clear right here.
 */
let cached: Session | null = null
let loaded = false

function read(): Session | null {
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

export function loadSession(): Session | null {
  // A signed-out app has no record to read, so cache that answer too rather than re-reading for it.
  if (!loaded) {
    cached = read()
    loaded = true
  }
  return cached
}

export function saveSession(session: Session): void {
  const next = withServers(session)
  const json = JSON.stringify(next)
  if (safeStorage.isEncryptionAvailable()) {
    store.set('credentials', { encrypted: true, data: safeStorage.encryptString(json).toString('base64') })
  } else {
    console.warn('[credentials] OS encryption unavailable; storing derived token unencrypted')
    store.set('credentials', { encrypted: false, data: Buffer.from(json, 'utf8').toString('base64') })
  }
  cached = next
  loaded = true
}

export function clearSession(): void {
  store.delete('credentials')
  cached = null
  loaded = true
}
