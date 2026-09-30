// Small collection helpers the core and plugins share.

/** Items grouped by key, in first-seen order of the keys; each group in input order. Linear: one push per item. */
export function groupBy<T, K>(items: Iterable<T>, key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = out.get(k)
    if (group) group.push(item)
    else out.set(k, [item])
  }
  return out
}
