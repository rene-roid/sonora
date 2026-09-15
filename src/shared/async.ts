/**
 * Run `fn` over `items` with at most `limit` of them in flight, resolving to the results in the
 * order the items came in.
 *
 * A plain `Promise.all` over a mapped list opens every request at once, which for the places that
 * fan out over albums -- a mood with three hundred of them, an artist's whole catalogue -- is a
 * burst the server has to absorb in one go and the connection pool then serialises anyway. A
 * window keeps the pipe full without the stampede.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length <= 1 || limit <= 1) {
    const out: R[] = []
    for (let i = 0; i < items.length; i++) out.push(await fn(items[i], i))
    return out
  }
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
