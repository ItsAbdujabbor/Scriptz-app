/**
 * Channel Milestones — meaningful creator achievement tiers.
 *
 * Each milestone is a real achievement worth celebrating.
 * Steps get exponentially bigger as channels grow.
 */

export function formatMilestoneLabel(n) {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x) || x < 0) return '0'
  if (x < 1000) return String(x)
  if (x < 1_000_000) {
    const k = x / 1000
    return k === Math.round(k)
      ? `${Math.round(k)}k`
      : `${k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')}k`
  }
  if (x < 1_000_000_000) {
    const m = x / 1_000_000
    return m === Math.round(m)
      ? `${Math.round(m)}M`
      : `${m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')}M`
  }
  const b = x / 1_000_000_000
  return `${b >= 10 ? b.toFixed(0) : b.toFixed(1).replace(/\.0$/, '')}B`
}

/**
 * Subscriber milestones — big, meaningful jumps.
 * Each one is a real creator achievement with a name.
 */
export const SUBS_STEPS = [
  { target: 1, label: '1', title: 'First subscriber', tier: 'seed' },
  { target: 10, label: '10', title: 'First fans', tier: 'seed' },
  { target: 50, label: '50', title: 'Growing community', tier: 'sprout' },
  { target: 100, label: '100', title: 'Triple digits', tier: 'sprout' },
  { target: 250, label: '250', title: 'Quarter thousand', tier: 'sprout' },
  { target: 500, label: '500', title: 'Halfway to 1k', tier: 'rising' },
  { target: 1_000, label: '1k', title: 'Thousand club', tier: 'rising' },
  { target: 2_500, label: '2.5k', title: 'Building momentum', tier: 'rising' },
  { target: 5_000, label: '5k', title: 'Five thousand strong', tier: 'established' },
  { target: 10_000, label: '10k', title: 'Ten thousand', tier: 'established' },
  { target: 25_000, label: '25k', title: 'Quarter of 100k', tier: 'established' },
  { target: 50_000, label: '50k', title: 'Halfway to 100k', tier: 'notable' },
  { target: 100_000, label: '100k', title: 'Silver Play Button', tier: 'notable' },
  { target: 250_000, label: '250k', title: 'Quarter million', tier: 'notable' },
  { target: 500_000, label: '500k', title: 'Half a million', tier: 'star' },
  { target: 1_000_000, label: '1M', title: 'Gold Play Button', tier: 'star' },
  { target: 2_500_000, label: '2.5M', title: 'Multi-million', tier: 'star' },
  { target: 5_000_000, label: '5M', title: 'Five million', tier: 'legend' },
  { target: 10_000_000, label: '10M', title: 'Diamond Play Button', tier: 'legend' },
  { target: 50_000_000, label: '50M', title: 'Fifty million', tier: 'legend' },
  { target: 100_000_000, label: '100M', title: 'Red Diamond', tier: 'legend' },
]

/**
 * Views milestones — lifetime total views.
 */
export const VIEWS_STEPS = [
  { target: 100, label: '100', title: 'First hundred views', tier: 'seed' },
  { target: 500, label: '500', title: 'Getting noticed', tier: 'seed' },
  { target: 1_000, label: '1k', title: 'Thousand views', tier: 'sprout' },
  { target: 5_000, label: '5k', title: 'Five thousand', tier: 'sprout' },
  { target: 10_000, label: '10k', title: 'Ten thousand views', tier: 'sprout' },
  { target: 50_000, label: '50k', title: 'Fifty thousand', tier: 'rising' },
  { target: 100_000, label: '100k', title: 'Hundred thousand', tier: 'rising' },
  { target: 500_000, label: '500k', title: 'Half a million', tier: 'rising' },
  { target: 1_000_000, label: '1M', title: 'One million views', tier: 'established' },
  { target: 5_000_000, label: '5M', title: 'Five million', tier: 'established' },
  { target: 10_000_000, label: '10M', title: 'Ten million', tier: 'notable' },
  { target: 50_000_000, label: '50M', title: 'Fifty million', tier: 'notable' },
  { target: 100_000_000, label: '100M', title: 'Hundred million', tier: 'star' },
  { target: 500_000_000, label: '500M', title: 'Half a billion', tier: 'star' },
  { target: 1_000_000_000, label: '1B', title: 'Billion views', tier: 'legend' },
]

export const VIDEO_STEPS = [
  { target: 1, label: '1', title: 'First video' },
  { target: 5, label: '5', title: '5 videos' },
  { target: 10, label: '10', title: '10 videos' },
  { target: 25, label: '25', title: '25 videos' },
  { target: 50, label: '50', title: '50 videos' },
  { target: 100, label: '100', title: '100 videos' },
]

export const VIDEO_MAJOR_STEPS = [
  { target: 250, label: '250', title: '250 videos' },
  { target: 500, label: '500', title: '500 videos' },
  { target: 1000, label: '1k', title: '1000 videos' },
]

export const SUBS_MAJOR_STEPS = [
  { target: 500000, label: '500k', title: '500k subscribers' },
  { target: 1000000, label: '1M', title: '1M subscribers' },
]

export function progressAlongSteps(current, steps) {
  const n = Math.max(0, Number(current) || 0)
  let completed = 0
  for (let i = 0; i < steps.length; i += 1) {
    if (n >= steps[i].target) completed = i + 1
  }
  if (completed >= steps.length) {
    return {
      completed,
      next: null,
      prevTarget: steps[steps.length - 1].target,
      pctToNext: 1,
      isMaxed: true,
    }
  }
  const next = steps[completed]
  const prevTarget = completed === 0 ? 0 : steps[completed - 1].target
  const span = next.target - prevTarget
  const pctToNext = span > 0 ? Math.min(1, Math.max(0, (n - prevTarget) / span)) : 1
  return { completed, next, prevTarget, pctToNext, isMaxed: false }
}

export function overallBarPercent(current, steps) {
  const { completed, next, pctToNext, isMaxed } = progressAlongSteps(current, steps)
  if (isMaxed || !next || !steps.length) return 100
  const segmentWeight = 100 / steps.length
  return Math.min(100, completed * segmentWeight + pctToNext * segmentWeight)
}

export function getMilestonePair(current, steps) {
  const n = Math.max(0, Number(current) || 0)
  if (!Array.isArray(steps) || steps.length === 0) {
    return { achieved: null, next: null, barFillPercent: 0 }
  }
  let lastIdx = -1
  for (let i = 0; i < steps.length; i += 1) {
    if (n >= steps[i].target) lastIdx = i
  }
  const achieved = lastIdx >= 0 ? steps[lastIdx] : null
  const next = lastIdx < steps.length - 1 ? steps[lastIdx + 1] : null
  let barFillPercent = 0
  if (!achieved && next) {
    barFillPercent = next.target > 0 ? Math.min(100, (n / next.target) * 100) : 0
  } else if (achieved && next) {
    const span = next.target - achieved.target
    barFillPercent =
      span > 0 ? Math.min(100, Math.max(0, ((n - achieved.target) / span) * 100)) : 100
  } else if (achieved && !next) {
    barFillPercent = 100
  }
  return { achieved, next, barFillPercent }
}
