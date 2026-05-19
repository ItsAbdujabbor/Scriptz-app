/** One-shot prefill cleanup for hash deep-links (Thumbnail generator). */

/** Remove named query keys from the current hash fragment. */
function stripHashQueryParams(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return
  try {
    const hash = window.location.hash || ''
    const normalized = hash.replace(/^#/, '').replace(/^\/+/, '')
    const [path, qs = ''] = normalized.split('?')
    if (!qs) return
    const params = new URLSearchParams(qs)
    let changed = false
    for (const k of keys) {
      if (params.has(k)) {
        params.delete(k)
        changed = true
      }
    }
    if (!changed) return
    const next = params.toString() ? `${path}?${params.toString()}` : path
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#${next}`
    )
  } catch {
    /* ignore */
  }
}

/** Remove `prefill` from the current hash (one-shot deep links). Keeps other query params. */
export function stripPrefillFromHash() {
  stripHashQueryParams(['prefill'])
}
