/** Append AI-ready prefill to hash routes from the dashboard (Thumb / Optimize). */

const MAX = 1200

export function appendPrefillToHash(hashPath, prompt) {
  if (!hashPath || !prompt) return hashPath || ''
  const text = String(prompt).trim().slice(0, MAX)
  if (!text) return hashPath
  const enc = encodeURIComponent(text)
  const sep = hashPath.includes('?') ? '&' : '?'
  return `${hashPath}${sep}prefill=${enc}`
}

/** Route path without leading `#`; returns fragment without `#` (for `location.hash` or `#${…}` hrefs). */
export function hashWithPrefill(baseHash, prefill) {
  if (!baseHash) return ''
  const path = String(baseHash).replace(/^#/, '')
  if (!prefill) return path
  return appendPrefillToHash(path, prefill)
}

/** Remove `prefill` from the current hash (one-shot deep links). Keeps other query params. */
export function stripPrefillFromHash() {
  stripHashQueryParams(['prefill'])
}

/** Remove named query keys from the current hash fragment. */
export function stripHashQueryParams(keys) {
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

/** Thumbnail generator: creative directions */
export function thumbPrefill({ pillar, score, videoTitle }) {
  const t = videoTitle ? `Video: "${videoTitle}". ` : ''
  const s = score != null ? `Audit ${pillar} ${score}/100. ` : ''
  return `${t}${s}Give me 4 contrasting thumbnail directions (layout, face vs text-heavy, color, 3–5 words on-image). Then I'll generate the strongest.`
}

/** Optimize: what to do on existing videos */
export function optimizePrefill(pillar, score) {
  const s = score != null ? ` (${score}/100)` : ''
  return `Prioritize videos to fix for ${pillar}${s}: which 3 to refresh first (title/thumbnail) and why.`
}

/** Map dashboard stat-insight `href` strings to AI-ready prefills */
export function prefillForDashboardHashHref(href) {
  if (!href) return null
  const raw = String(href).replace(/^#/, '')
  const [path] = raw.split('?')
  const base = path.replace(/^\/+/, '')
  if (base === 'optimize') return optimizePrefill('titles & thumbnails', null)
  if (base === 'thumbnails')
    return thumbPrefill({ pillar: 'CTR / packaging', score: null, videoTitle: null })
  return null
}

/** Audit row / fix-line → short prefill for the right tool */
export function getAreaPrefill(areaName, score) {
  const a = String(areaName || '').toLowerCase()
  const s = Number.isFinite(Number(score)) ? Number(score) : null
  if (a.includes('ctr') || a.includes('thumbnail')) {
    return thumbPrefill({ pillar: 'CTR / thumbnails', score: s, videoTitle: null })
  }
  if (a.includes('consistency')) {
    return thumbPrefill({ pillar: 'Consistency', score: s, videoTitle: null })
  }
  if (a.includes('seo')) {
    return optimizePrefill('SEO / titles', s)
  }
  if (a.includes('retention')) {
    return thumbPrefill({ pillar: 'Retention / hook', score: s, videoTitle: null })
  }
  return thumbPrefill({ pillar: 'Channel', score: s, videoTitle: null })
}
