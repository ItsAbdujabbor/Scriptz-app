const STORAGE_KEY = 'scriptz-milestone-visit-v1'

function keyForChannel(channelId) {
  return `${STORAGE_KEY}:${channelId}`
}

/**
 * @returns {{ subs: number, views: number, t: number } | null}
 */
export function readMilestoneVisitSnapshot(channelId) {
  if (!channelId || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(keyForChannel(channelId))
    if (!raw) return null
    const o = JSON.parse(raw)
    const subs = Number(o?.subs)
    const views = Number(o?.views)
    if (!Number.isFinite(subs) || !Number.isFinite(views)) return null
    return { subs, views, t: Number(o?.t) || 0 }
  } catch {
    return null
  }
}

export function writeMilestoneVisitSnapshot(channelId, subs, views) {
  if (!channelId || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      keyForChannel(channelId),
      JSON.stringify({
        subs: Math.max(0, Math.round(Number(subs) || 0)),
        views: Math.max(0, Math.round(Number(views) || 0)),
        t: Date.now(),
      })
    )
  } catch {
    /* quota / private mode */
  }
}
