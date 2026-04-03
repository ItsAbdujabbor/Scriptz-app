/**
 * Action-driven dashboard copy and deep links — uses real channel metrics only.
 * No fake AI; benchmarks used when scores imply generic gaps.
 */

import {
  coachPrefill,
  getAreaPrefill,
  optimizePrefill,
  scriptPrefill,
  thumbPrefill,
} from './dashboardActionPayload'

function hashLink(route) {
  return (e) => {
    e.preventDefault()
    window.location.hash = route
  }
}

/** Map audit area → default tool + query hint */
export function getAreaAction(areaName) {
  const a = String(areaName || '').toLowerCase()
  if (a.includes('ctr') || a.includes('thumbnail')) {
    return {
      label: 'Open Thumbnail Generator',
      hash: 'coach/thumbnails?focus=packaging',
    }
  }
  if (a.includes('consistency')) {
    return {
      label: 'Plan a video this week',
      hash: 'coach?topic=upload%20schedule',
    }
  }
  if (a.includes('seo')) {
    return {
      label: 'Open Optimize',
      hash: 'optimize',
    }
  }
  if (a.includes('retention')) {
    return {
      label: 'Ask AI Coach',
      hash: 'coach?topic=retention%20hook',
    }
  }
  return {
    label: 'Open AI Coach',
    hash: 'coach',
  }
}

/**
 * Diagnosis + action for each audit dimension (name = SEO, CTR, …).
 */
export function getAuditAreaGuidance(name, score, label) {
  const n = Number(score)
  const s = !Number.isFinite(n) ? 50 : n
  const nm = String(name || '')

  if (s >= 70) {
    return {
      diagnosis: `${nm} is solid right now.`,
      action: 'Keep testing, not rewriting.',
      href: null,
      tone: 'ok',
    }
  }

  if (nm === 'CTR' || nm.toLowerCase().includes('ctr')) {
    return {
      diagnosis: 'CTR is behind — impressions are not turning into enough clicks.',
      action: 'Test 2 thumbnails: one face-led, one bold text-led.',
      href: 'coach/thumbnails?focus=ctr',
      tone: 'warn',
    }
  }
  if (nm === 'Consistency') {
    return {
      diagnosis: 'Upload rhythm is weak — viewers do not know when to expect you.',
      action: 'Lock one upload slot this week and repeat it.',
      href: 'coach?topic=posting%20schedule',
      tone: 'warn',
    }
  }
  if (nm === 'Thumbnails') {
    return {
      diagnosis: 'Thumbnail signal is weak — the packaging is not matching your niche yet.',
      action: 'Remix a winning layout from your best videos.',
      href: 'coach/thumbnails?focus=style',
      tone: 'warn',
    }
  }
  if (nm === 'SEO') {
    return {
      diagnosis: 'Titles and metadata are underperforming in search and suggested.',
      action: 'Rewrite the title around one keyword and one curiosity angle.',
      href: 'optimize',
      tone: 'warn',
    }
  }
  if (nm === 'Retention' || label?.toLowerCase().includes('engagement')) {
    return {
      diagnosis: 'Viewers may be dropping early or not engaging enough.',
      action: 'Front-load payoff in the first 30 seconds.',
      href: 'coach/scripts?focus=hook',
      tone: 'warn',
    }
  }

  return {
    diagnosis: `${label || nm} needs attention (score ${Math.round(s)}).`,
    action: 'Improve one video, ship it, then measure.',
    href: 'optimize',
    tone: 'warn',
  }
}

/**
 * Single prioritized next step from weakest audit + growth signals.
 */
export function computeNextBestAction({ audit, growth, snapshot }) {
  const scores = Array.isArray(audit?.scores) ? audit.scores : []
  let weakest = null
  for (const row of scores) {
    const sc = Number(row?.score ?? 0)
    if (!weakest || sc < Number(weakest.score ?? 100)) {
      weakest = { ...row, score: sc }
    }
  }

  const consistency = scores.find((x) => String(x?.name || '').toLowerCase() === 'consistency')
  const ctr = scores.find((x) => String(x?.name || '').toLowerCase() === 'ctr')
  const thumbs = scores.find((x) => String(x?.name || '').toLowerCase() === 'thumbnails')

  // Priority: consistency 0 or very low → publishing beats everything
  if (consistency && Number(consistency.score) <= 15) {
    return {
      headline: 'Next best action',
      title: 'Lock a weekly upload slot',
      diagnosis:
        'Your channel has no reliable posting rhythm yet, so viewers are not learning when to come back.',
      action: 'Publish one video this week, then book the same day and time again for next week.',
      ctaLabel: 'Build weekly plan',
      hash: 'coach?topic=weekly%20upload%20plan',
      prefillPrompt: coachPrefill(
        'Consistency',
        Number(consistency.score),
        '2-week schedule: upload days + times + 3 video ideas. Keep it realistic.'
      ),
      impact: 'A simple weekly rhythm is the smallest habit that compounds.',
    }
  }

  if (ctr && Number(ctr.score) < 55) {
    const g = getAuditAreaGuidance('CTR', ctr.score, ctr.label)
    return {
      headline: 'Next best action',
      title: 'Fix packaging first',
      diagnosis: g.diagnosis,
      action: g.action,
      ctaLabel: 'Open Thumbnail Generator',
      hash: 'coach/thumbnails?focus=ctr',
      prefillPrompt: thumbPrefill({ pillar: 'CTR', score: Number(ctr.score), videoTitle: null }),
      impact: 'Better CTR multiplies the impressions you already earn.',
    }
  }

  if (thumbs && Number(thumbs.score) < 50) {
    const g = getAuditAreaGuidance('Thumbnails', thumbs.score, thumbs.label)
    return {
      headline: 'Next best action',
      title: 'Upgrade thumbnails',
      diagnosis: g.diagnosis,
      action: g.action,
      ctaLabel: 'Create thumbnails',
      hash: 'coach/thumbnails?focus=style',
      prefillPrompt: thumbPrefill({
        pillar: 'Thumbnails',
        score: Number(thumbs.score),
        videoTitle: null,
      }),
      impact: 'Thumbnails move results before anyone presses play.',
    }
  }

  if (weakest && Number(weakest.score) < 65) {
    const g = getAuditAreaGuidance(weakest.name, weakest.score, weakest.label)
    const act = getAreaAction(weakest.name)
    return {
      headline: 'Next best action',
      title: `Improve ${weakest.name}`,
      diagnosis: g.diagnosis,
      action: g.action,
      ctaLabel: act.label,
      hash: act.hash,
      prefillPrompt: getAreaPrefill(weakest.name, weakest.score),
      impact: 'Fix one weak point, then measure the next upload.',
    }
  }

  const v30 = growth?.views_velocity_30d != null ? Number(growth.views_velocity_30d) : null
  const proj = growth?.projected_views_30d != null ? Number(growth.projected_views_30d) : null
  if (v30 != null && v30 < 5 && proj != null && proj < 200) {
    return {
      headline: 'Next best action',
      title: 'Increase output or packaging',
      diagnosis: 'View velocity is flat — you’re not compounding reach yet.',
      action:
        'Pair one stronger thumbnail test with your next upload, or add a Short to feed the funnel.',
      ctaLabel: 'Generate a script',
      hash: 'coach/scripts',
      prefillPrompt: `${scriptPrefill({ concept: null, pillar: 'Growth', score: null })} (≈${Math.round(proj)} views / 30d projected — pick one packaging test + one new video).`,
      impact: `At this pace you’re on track for ~${Math.round(proj)} views in 30 days — packaging wins move it first.`,
    }
  }

  const views = snapshot?.current_period?.views
  if (views != null && snapshot?.previous_period?.views != null) {
    const d = Number(views) - Number(snapshot.previous_period.views)
    if (d < 0) {
      return {
        headline: 'Next best action',
        title: 'Stop the slide',
        diagnosis: '30-day views are down vs the prior period.',
        action:
          'Refresh titles/thumbnails on last week’s uploads in Optimize, then ship one new video.',
        ctaLabel: 'Open Optimize',
        hash: 'optimize',
        prefillPrompt: optimizePrefill('recent uploads', audit?.overall_score ?? null),
        impact: 'Refreshing old assets is faster than waiting for a push.',
      }
    }
  }

  return {
    headline: 'Next best action',
    title: 'Keep the flywheel turning',
    diagnosis: 'Nothing is on fire — keep compounding what worked.',
    action: 'Take the best idea below, script it, then package it.',
    ctaLabel: 'Browse ideas',
    hash: 'coach/scripts',
    prefillPrompt: scriptPrefill({ concept: null, pillar: 'Next video', score: null }),
    impact: 'Consistency beats one-off spikes.',
  }
}

/** Rough scenario band — not a promise; compares inertia vs modest cadence lift */
export function getGrowthScenarioMessage(growth) {
  let proj = growth?.projected_views_30d != null ? Number(growth.projected_views_30d) : null
  const v = growth?.views_velocity_30d != null ? Number(growth.views_velocity_30d) : null
  if ((!Number.isFinite(proj) || proj <= 0) && Number.isFinite(v) && v > 0) {
    proj = Math.round(v * 30)
  }
  if (!Number.isFinite(proj) || proj <= 0) return null

  const low = Math.round(proj * 1.5)
  const high = Math.round(proj * 3.5)
  const lever =
    Number.isFinite(v) && v > 0
      ? '1 upload/week + stronger titles/thumbnails'
      : 'Start weekly + tighten titles/thumbnails'

  return {
    baseline: `~${Math.round(proj).toLocaleString()} views / 30d (current pace)`,
    opportunity: `${low.toLocaleString()}–${high.toLocaleString()} views / 30d`,
    lever,
  }
}

export function getSnapshotStatInsight(key, snapshot) {
  const cur = snapshot?.current_period
  const prev = snapshot?.previous_period
  if (!cur) return null

  if (key === 'views') {
    const v = cur.views
    const pv = prev?.views
    if (v != null && pv != null) {
      const d = Number(v) - Number(pv)
      if (d < 0) {
        return {
          tip: 'Down vs last period · refresh thumbnails or ship a stronger video.',
          href: 'optimize',
          cta: 'Open',
        }
      }
      if (d > 0) {
        return {
          tip: 'Up vs last period · double down on what worked.',
          href: 'coach/scripts',
          cta: 'Open',
        }
      }
    }
    return {
      tip: 'Flat? Test titles & thumbnails before spending on ads.',
      href: 'optimize',
      cta: 'Open',
    }
  }

  if (key === 'watch_time_hours') {
    return {
      tip: 'Retention beats clicks · low vs views? Tighten hooks & pacing.',
      href: 'coach/scripts?focus=pacing',
      cta: 'Open',
    }
  }

  if (key === 'video_count') {
    const n = cur.video_count
    if (n != null && Number(n) <= 1) {
      return {
        tip: 'Thin sample · publish more to read trends clearly.',
        href: 'coach',
        cta: 'Open',
      }
    }
    return {
      tip: 'Pick a weekly cadence you can sustain.',
      href: 'coach?topic=schedule',
      cta: 'Open',
    }
  }

  if (key === 'views_per_video') {
    return {
      tip: 'Vs your niche: low = sharpen angle; high = sequels.',
      href: 'coach/scripts',
      cta: 'Open',
    }
  }

  return null
}

export function getGrowthStatInsight(key) {
  if (key === 'subs') {
    return {
      tip: 'Ask for the sub after value (mid-roll), not only at the outro.',
      href: 'coach?topic=cta',
      cta: 'Go',
    }
  }
  if (key === 'v7') {
    return {
      tip: '7-day pulse · quick check on momentum.',
      href: 'coach/thumbnails',
      cta: 'Go',
    }
  }
  if (key === 'v30') {
    return {
      tip: '30-day trend line · smoother than weekly noise.',
      href: 'coach/thumbnails',
      cta: 'Go',
    }
  }
  if (key === 'proj') {
    return {
      tip: 'Trajectory follows pace · thumbnails + uploads move it.',
      href: 'optimize',
      cta: 'Go',
    }
  }
  return null
}

/** Total uploads represented in hourly bars (for hiding noisy chart). */
export function countBestTimeUploads(barChartData) {
  if (!Array.isArray(barChartData)) return 0
  return barChartData.reduce((acc, b) => acc + (Number(b?.uploads) || 0), 0)
}

export function fixLineToAction(line, area) {
  const t = String(line || '').toLowerCase()
  const a = String(area || '').toLowerCase()
  if (t.includes('thumbnail') || a.includes('ctr') || a.includes('thumbnail')) {
    return {
      label: 'Thumbnails',
      hash: 'coach/thumbnails?focus=ctr',
      prefill: thumbPrefill({ pillar: 'CTR', score: null, videoTitle: null }),
    }
  }
  if (t.includes('upload') || t.includes('schedule') || a.includes('consistency')) {
    return {
      label: 'Coach',
      hash: 'coach?topic=schedule',
      prefill: coachPrefill(
        'Consistency',
        null,
        'Weekly plan I can stick to — days, times, 2 ideas.'
      ),
    }
  }
  if (t.includes('title') || t.includes('description') || t.includes('seo')) {
    return {
      label: 'Optimize',
      hash: 'optimize',
      prefill: optimizePrefill('SEO / titles', null),
    }
  }
  if (t.includes('hook') || t.includes('script')) {
    return {
      label: 'Script',
      hash: 'coach/scripts',
      prefill: scriptPrefill({ concept: null, pillar: 'Hook', score: null }),
    }
  }
  return {
    label: 'Coach',
    hash: 'coach',
    prefill: getAreaPrefill(area || 'Channel', null),
  }
}

export { hashLink }
