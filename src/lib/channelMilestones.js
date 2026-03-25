/**
 * Creator milestone paths — dense steps (e.g. 100 → 150 → 200 …), then wider tiers.
 * Used for dashboard progress UI only (display).
 */

/** Compact label for counts (subs, views, etc.). */
export function formatMilestoneLabel(n) {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x) || x < 0) return '0'
  if (x < 1000) return String(x)
  if (x < 1_000_000) {
    const k = x / 1000
    if (Math.abs(k - Math.round(k)) < 1e-9) return `${Math.round(k)}k`
    const s = k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')
    return `${s}k`
  }
  if (x < 1_000_000_000) {
    const m = x / 1_000_000
    if (Math.abs(m - Math.round(m)) < 1e-9) return `${Math.round(m)}M`
    const s = m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')
    return `${s}M`
  }
  const b = x / 1_000_000_000
  const s = b >= 10 ? b.toFixed(0) : b.toFixed(1).replace(/\.0$/, '')
  return `${s}B`
}

function buildMilestoneSteps(targets, titleFn) {
  const out = []
  let prev = -1
  for (const t of targets) {
    const target = Math.round(Number(t))
    if (!Number.isFinite(target) || target <= prev) continue
    prev = target
    out.push({
      target,
      label: formatMilestoneLabel(target),
      title: titleFn(target),
    })
  }
  return out
}

function collectSortedTargets(add) {
  const targets = []
  const push = (n) => {
    const v = Math.round(Number(n))
    if (v > 0 && (!targets.length || targets[targets.length - 1] < v)) targets.push(v)
  }
  add(push)
  return targets
}

/** Subscriber milestones — small gaps early (…100, 150, 200…), then scaling bands. */
export const SUBS_STEPS = buildMilestoneSteps(
  collectSortedTargets((push) => {
    ;[1, 5, 10, 25, 50, 75, 100].forEach(push)
    for (let v = 150; v < 500; v += 50) push(v)
    for (let v = 500; v <= 1000; v += 50) push(v)
    for (let v = 1050; v < 5000; v += 50) push(v)
    for (let v = 5000; v <= 10000; v += 250) push(v)
    for (let v = 10250; v < 25000; v += 250) push(v)
    for (let v = 25000; v < 50000; v += 2500) push(v)
    for (let v = 50000; v <= 100000; v += 5000) push(v)
    for (let v = 125000; v <= 500000; v += 25000) push(v)
    for (let v = 525000; v <= 1000000; v += 50000) push(v)
    ;[1000000, 1250000, 1500000, 2000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000].forEach(push)
  }),
  (target) => `${formatMilestoneLabel(target)} subscribers`,
)

/** Published videos on channel (lifetime). */
export const VIDEO_STEPS = [
  { target: 1, label: 'First', title: '1st video live' },
  { target: 5, label: '5', title: '5 videos' },
  { target: 10, label: '10', title: '10 videos' },
  { target: 25, label: '25', title: '25 videos' },
  { target: 50, label: '50', title: '50 videos' },
  { target: 100, label: '100', title: '100 videos' },
]

/** Bigger leap after the core path — “major” tier. */
export const VIDEO_MAJOR_STEPS = [
  { target: 250, label: '250', title: '250 videos' },
  { target: 500, label: '500', title: '500 videos' },
  { target: 1000, label: '1k', title: '1000 videos' },
]

export const SUBS_MAJOR_STEPS = [
  { target: 500000, label: '500k', title: '500k subscribers' },
  { target: 1000000, label: '1M', title: '1M subscribers' },
]

/** Lifetime channel views — dense early rungs, then wider. */
export const VIEWS_STEPS = buildMilestoneSteps(
  collectSortedTargets((push) => {
    ;[100, 250, 500, 750, 1000].forEach(push)
    for (let v = 1500; v <= 10000; v += 500) push(v)
    for (let v = 11000; v < 25000; v += 1000) push(v)
    for (let v = 25000; v <= 100000; v += 2500) push(v)
    for (let v = 125000; v <= 500000; v += 25000) push(v)
    for (let v = 525000; v <= 1000000; v += 50000) push(v)
    for (let v = 1250000; v <= 10000000; v += 250000) push(v)
    ;[10000000, 12500000, 15000000, 20000000, 25000000, 50000000, 75000000, 100000000, 250000000, 500000000, 1000000000].forEach(push)
  }),
  (target) => `${formatMilestoneLabel(target)} lifetime views`,
)

/**
 * @returns {{ completed: number, next: object | null, prevTarget: number, pctToNext: number, isMaxed: boolean }}
 */
export function progressAlongSteps(current, steps) {
  const n = Math.max(0, Number(current) || 0)
  let completed = 0
  for (let i = 0; i < steps.length; i += 1) {
    if (n >= steps[i].target) completed = i + 1
  }
  if (completed >= steps.length) {
    return { completed, next: null, prevTarget: steps[steps.length - 1].target, pctToNext: 1, isMaxed: true }
  }
  const next = steps[completed]
  const prevTarget = completed === 0 ? 0 : steps[completed - 1].target
  const span = next.target - prevTarget
  const pctToNext = span > 0 ? Math.min(1, Math.max(0, (n - prevTarget) / span)) : 1
  return { completed, next, prevTarget, pctToNext, isMaxed: false }
}

/** 0–100 for a smooth progress bar across all steps. */
export function overallBarPercent(current, steps) {
  const { completed, next, pctToNext, isMaxed } = progressAlongSteps(current, steps)
  if (isMaxed || !next || !steps.length) return 100
  const segmentWeight = 100 / steps.length
  return Math.min(100, completed * segmentWeight + pctToNext * segmentWeight)
}

/**
 * Exactly two anchors: latest achieved milestone (if any) and the next target.
 * Bar fill is progress from “achieved floor” (or 0) to the next target.
 * @returns {{ achieved: object | null, next: object | null, barFillPercent: number }}
 */
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
    const span = next.target
    barFillPercent = span > 0 ? Math.min(100, (n / span) * 100) : 0
  } else if (achieved && next) {
    const span = next.target - achieved.target
    barFillPercent = span > 0 ? Math.min(100, Math.max(0, ((n - achieved.target) / span) * 100)) : 100
  } else if (achieved && !next) {
    barFillPercent = 100
  }

  return { achieved, next, barFillPercent }
}
