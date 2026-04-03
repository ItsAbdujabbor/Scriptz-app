/** Append AI-ready prefill to hash routes from the dashboard (Coach / Script / Thumb / Optimize). */

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

/** Coach: planning / diagnosis */
export function coachPrefill(pillar, score, ask) {
  const s = score != null ? ` (${score}/100)` : ''
  return `[From dashboard] Focus: ${pillar}${s}.\n\n${ask}`
}

/** Thumbnail generator: creative directions */
export function thumbPrefill({ pillar, score, videoTitle }) {
  const t = videoTitle ? `Video: "${videoTitle}". ` : ''
  const s = score != null ? `Audit ${pillar} ${score}/100. ` : ''
  return `${t}${s}Give me 4 contrasting thumbnail directions (layout, face vs text-heavy, color, 3–5 words on-image). Then I'll generate the strongest.`
}

/** Script generator: outline + hook */
export function scriptPrefill({ concept, pillar, score }) {
  const c = concept ? `Concept: "${concept}". ` : ''
  const s = score != null ? `${pillar} ${score}/100. ` : ''
  return `${c}${s}Outline the video + write the first 60s (hook + pattern interrupt). Optimize for retention.`
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
  const [path, qs = ''] = raw.split('?')
  const base = path.replace(/^\/+/, '')
  const params = new URLSearchParams(qs)
  if (base === 'optimize') return optimizePrefill('titles & thumbnails', null)
  if (base === 'coach/thumbnails')
    return thumbPrefill({ pillar: 'CTR / packaging', score: null, videoTitle: null })
  if (base === 'coach/scripts') {
    const focus = params.get('focus')
    if (focus === 'pacing' || focus === 'hook') {
      return scriptPrefill({
        concept: null,
        pillar: focus === 'hook' ? 'Hook' : 'Pacing / retention',
        score: null,
      })
    }
    return scriptPrefill({ concept: null, pillar: 'Next video', score: null })
  }
  if (base === 'coach') {
    const topic = params.get('topic') || ''
    const t = topic.toLowerCase()
    if (t.includes('cta'))
      return coachPrefill(
        'Retention',
        null,
        'Stronger subscribe CTA placement — mid-video after value, not only at the end.'
      )
    if (t.includes('schedule'))
      return coachPrefill('Consistency', null, 'Realistic weekly upload rhythm I can sustain.')
    return coachPrefill(
      'Channel',
      null,
      'What should I prioritize this week based on my dashboard?'
    )
  }
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
    return coachPrefill(
      'Consistency',
      s,
      'Minimal viable weekly plan I can keep — days, times, 2 video ideas.'
    )
  }
  if (a.includes('seo')) {
    return optimizePrefill('SEO / titles', s)
  }
  if (a.includes('retention')) {
    return scriptPrefill({ concept: null, pillar: 'Retention / hook', score: s })
  }
  return coachPrefill('Channel', s, 'Top 3 fixes for my channel this week, in order.')
}
