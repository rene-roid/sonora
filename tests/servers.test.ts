import { describe, expect, test } from 'bun:test'
import { SubsonicClient, pickFastestServer, probeServers } from '../src/shared/subsonic/client'
import type { Session } from '../src/shared/types'

const FAST = 'http://fast'
const SLOW = 'http://slow'
const DEAD = 'http://dead'

const session: Session = { server: DEAD, servers: [DEAD, SLOW, FAST], username: 'u', token: 't', salt: 's' }

const ok = (): Response => new Response(JSON.stringify({ 'subsonic-response': { status: 'ok' } }))

/** DEAD refuses connections, SLOW answers late, FAST answers immediately. */
async function fakeFetch(url: string): Promise<Response> {
  if (url.startsWith(DEAD)) throw new TypeError('fetch failed')
  if (url.startsWith(SLOW)) await new Promise((r) => setTimeout(r, 50))
  return ok()
}

describe('multiple connections', () => {
  test('picks the first candidate that answers', async () => {
    expect(await pickFastestServer(session, [DEAD, SLOW, FAST], fakeFetch)).toBe(FAST)
  })

  test('rejects when every candidate is down', async () => {
    expect(pickFastestServer(session, [DEAD], fakeFetch)).rejects.toThrow()
  })

  test('probes report reachability per server', async () => {
    const probes = await probeServers(session, [DEAD, FAST], fakeFetch)
    expect(probes.map((p) => [p.server, p.ok])).toEqual([
      [DEAD, false],
      [FAST, true]
    ])
  })

  test('a call fails over to a working server and reports the switch', async () => {
    const switched: string[] = []
    const client = new SubsonicClient(session, fakeFetch, (s) => switched.push(s))
    await client.getArtists().catch(() => undefined) // body is empty, only the transport matters here
    expect(client.server).toBe(FAST)
    expect(switched).toEqual([FAST])
  })

  test('concurrent failures share one failover round', async () => {
    let pings = 0
    const counting = (url: string): Promise<Response> => {
      if (url.includes('ping')) pings++
      return fakeFetch(url)
    }
    const client = new SubsonicClient(session, counting)
    await Promise.all([client.getGenres(), client.getGenres(), client.getGenres()].map((p) => p.catch(() => undefined)))
    expect(pings).toBe(2) // SLOW and FAST pinged once between them, not once per failed call
  })

  test('does not fail over on an HTTP error from a reachable server', async () => {
    const client = new SubsonicClient({ ...session, server: FAST }, async (url) =>
      url.startsWith(FAST) ? new Response('nope', { status: 500 }) : ok()
    )
    expect(client.getGenres()).rejects.toThrow('HTTP 500')
    expect(client.server).toBe(FAST)
  })
})
