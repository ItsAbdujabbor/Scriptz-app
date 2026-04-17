/**
 * Parse coach / scripts / thumbnails hash (shared by CoachChat and route loading shell).
 */
export function getCoachHashState() {
  const hash = (typeof window !== 'undefined' && window.location.hash) || '#coach'
  const normalized = hash.replace(/^#/, '').replace(/^\/+/, '')
  const [routePart, search = ''] = normalized.split('?')
  const params = new URLSearchParams(search)
  const rawId = params.get('id')
  const conversationId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null
  const prefillRaw = params.get('prefill')
  let dashboardPrefill = null
  if (prefillRaw) {
    try {
      dashboardPrefill = decodeURIComponent(prefillRaw)
    } catch {
      dashboardPrefill = null
    }
  }

  let activeTab = 'coach'
  if (routePart === 'coach/scripts') activeTab = 'scripts'
  else if (routePart === 'thumbnails') activeTab = 'thumbnails'

  const coachConversationId = activeTab === 'coach' && routePart === 'coach' ? conversationId : null
  const scriptConversationId =
    activeTab === 'scripts' && routePart === 'coach/scripts' ? conversationId : null
  const thumbnailConversationId =
    activeTab === 'thumbnails' && routePart === 'thumbnails' ? conversationId : null

  return {
    route: routePart,
    conversationId,
    activeTab,
    coachConversationId,
    scriptConversationId,
    thumbnailConversationId,
    dashboardPrefill,
  }
}
