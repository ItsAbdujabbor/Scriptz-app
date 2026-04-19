/**
 * Scriptz AI — command center: scores and roadmap from real channel audit + ideas.
 * Estimates are channel-health proxies until a script/thumbnail payload is scored server-side.
 */

/**
 * @param {object|null} idea — dashboard insight item
 */
export function normalizeNextBestVideo(idea) {
  if (!idea || typeof idea !== 'object') return null
  const title = String(idea.idea_title ?? idea.title ?? '').trim() || 'Your next video'
  const hook = String(
    idea.hook_concept ?? idea.short_script ?? idea.script ?? idea.description ?? ''
  ).trim()
  const angle = String(idea.angle ?? '').trim()
  const targetEmotion = String(idea.target_emotion ?? '').trim()
  const audience = String(idea.expected_audience ?? '').trim()
  return {
    title,
    hook: hook || null,
    angle: angle || null,
    tags: [angle, targetEmotion, audience].filter(Boolean),
  }
}

function scoreByName(scores, needle) {
  const n = needle.toLowerCase()
  const row = (scores || []).find((s) =>
    String(s?.name ?? s?.label ?? '')
      .toLowerCase()
      .includes(n)
  )
  return row != null ? Number(row.score) : null
}

/**
 * Pre-publish pack score: channel audit overall (title + packaging + rhythm proxy).
 */
export function computePrePublishScore(audit) {
  const overall = Number(audit?.overall_score ?? 0)
  const tier = overall >= 72 ? 'strong' : overall >= 48 ? 'mixed' : 'risky'
  const label =
    tier === 'strong'
      ? 'Ready with minor polish'
      : tier === 'mixed'
        ? 'Solid base — tighten hook + thumbnail'
        : 'Fix packaging or cadence first'

  return {
    score: Math.min(100, Math.max(0, Math.round(overall))),
    tier,
    label,
  }
}

/**
 * Script performance estimate from audit dimensions (not full script NLP).
 */
export function computeScriptPerformanceEstimate(audit) {
  const scores = Array.isArray(audit?.scores) ? audit.scores : []
  const retention = scoreByName(scores, 'retention') ?? 50
  const seo = scoreByName(scores, 'seo') ?? 50
  const ctr = scoreByName(scores, 'ctr') ?? 50
  const consistency = scoreByName(scores, 'consistency') ?? 50

  const hookStrength = Math.round((ctr + seo) / 2)
  const retentionScore = Math.round(retention)
  const overall = Math.round((retentionScore + hookStrength + consistency) / 3)

  const dims = [
    { key: 'Retention', value: retentionScore },
    { key: 'Hook + title', value: hookStrength },
    { key: 'Cadence', value: Math.round(consistency) },
  ]
  const sorted = [...dims].sort((a, b) => a.value - b.value)
  const weakPoints = sorted.slice(0, 2).map((d) => ({
    label: d.key,
    score: d.value,
  }))

  return {
    overall,
    retention: retentionScore,
    hookStrength,
    weakPoints,
    disclaimer: 'Estimated from your channel audit (not a full script read).',
  }
}

/**
 * Single biggest growth bottleneck from audit + optional velocity.
 */
export function computeGrowthBottleneck(audit, growth) {
  const scores = Array.isArray(audit?.scores) ? audit.scores : []
  let weakest = null
  for (const row of scores) {
    const sc = Number(row?.score ?? 0)
    if (!weakest || sc < Number(weakest.score ?? 100)) {
      weakest = { name: String(row?.name ?? row?.label ?? 'Unknown'), score: sc, label: row?.label }
    }
  }

  const v30 = growth?.views_velocity_30d != null ? Number(growth.views_velocity_30d) : null
  let reason = ''
  if (weakest && Number(weakest.score) < 45) {
    reason = `${weakest.name} is lowest (${Math.round(weakest.score)}/100) — fix this before the rest.`
  } else if (v30 != null && v30 < 2 && Number(audit?.overall_score ?? 0) < 60) {
    reason = 'View velocity is flat — packaging + cadence will move more than new topics alone.'
  } else if (weakest) {
    reason = `${weakest.name} is the current drag — small wins here should stack fastest.`
  } else {
    reason = 'Keep measuring after each upload — bottleneck detection needs a bit more signal.'
  }

  return {
    pillar: weakest?.name ?? 'Channel',
    score: weakest != null ? Math.round(weakest.score) : null,
    reason,
  }
}

/**
 * Structured mini-roadmap from the top ideas (series feel, not random one-offs).
 */
export function buildContentStrategyRoadmap(ideas, limit = 3) {
  const list = Array.isArray(ideas) ? ideas.filter(Boolean).slice(0, limit) : []
  return list.map((idea, i) => {
    const title = String(idea.idea_title ?? idea.title ?? `Episode ${i + 1}`).trim()
    const beat = String(idea.angle ?? idea.hook_concept ?? '').trim()
    return {
      episode: i + 1,
      title,
      beat: beat || 'Carry the same promise into the next upload.',
    }
  })
}

export function thumbnailBattleHref(promptTitle) {
  const base = 'thumbnails'
  if (!promptTitle) return `${base}?focus=battle`
  return `${base}?prompt=${encodeURIComponent(promptTitle)}&focus=battle`
}
