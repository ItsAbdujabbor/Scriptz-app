const STORAGE_KEY = 'clixa-milestone-visit-v1'
const LEGACY_STORAGE_KEY = 'scriptz-milestone-visit-v1'

function keyForChannel(channelId) {
  return `${STORAGE_KEY}:${channelId}`
}

function legacyKeyForChannel(channelId) {
  return `${LEGACY_STORAGE_KEY}:${channelId}`
}

/**
 * @returns {{ subs: number, views: number, t: number } | null}
 */
export function readMilestoneVisitSnapshot(channelId) {
  if (!channelId || typeof localStorage === 'undefined') return null
  try {
    // One-shot migration from the legacy "scriptz-*" key for this channel.
    let raw = localStorage.getItem(keyForChannel(channelId))
    if (!raw) {
      const legacy = localStorage.getItem(legacyKeyForChannel(channelId))
      if (legacy) {
        localStorage.setItem(keyForChannel(channelId), legacy)
        raw = legacy
      }
      localStorage.removeItem(legacyKeyForChannel(channelId))
    }
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
      }),
    )
  } catch {
    /* quota / private mode */
  }
}
