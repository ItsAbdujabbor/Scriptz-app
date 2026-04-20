/**
 * Thumbnails — first-class authenticated screen at `#thumbnails`.
 *
 * Hosts the ThumbnailGenerator chat as a top-level route. Replaces the
 * old CoachChat shell after the AI Coach + Scripts features were retired.
 * Keeps the existing `.coach-page` / `.coach-main-wrap` / `.coach-main`
 * container classes because the chat composer CSS lives under the
 * `coach-` prefix and is reused verbatim by ThumbnailGenerator.
 */
import { useEffect, useState, useMemo } from 'react'
import { useOnboardingStore } from '../stores/onboardingStore'
import { ThumbnailGenerator } from './ThumbnailGenerator'
import './CoachChat.css'

function normalizeHashRoute(value) {
  return String(value || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .trim()
}

function getThumbnailConversationIdFromHash() {
  if (typeof window === 'undefined') return null
  const raw = normalizeHashRoute(window.location.hash)
  if (!raw.startsWith('thumbnails')) return null
  const qIndex = raw.indexOf('?')
  if (qIndex === -1) return null
  const params = new URLSearchParams(raw.slice(qIndex + 1))
  const id = params.get('id')
  return id ? Number(id) : null
}

function setThumbnailConversationHash(conversationId = null) {
  window.location.hash = conversationId ? `#thumbnails?id=${conversationId}` : '#thumbnails'
}

export function Thumbnails() {
  const youtube = useOnboardingStore((s) => s.youtube)
  const channelId = useMemo(
    () => youtube?.channelId || youtube?.channel_id || null,
    [youtube?.channelId, youtube?.channel_id]
  )

  const [conversationId, setConversationId] = useState(getThumbnailConversationIdFromHash)

  useEffect(() => {
    const onHashChange = () => setConversationId(getThumbnailConversationIdFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return (
    <div className="coach-main-wrap">
      <div className="coach-main-body">
        <ThumbnailGenerator
          channelId={channelId}
          conversationId={conversationId}
          onConversationCreated={setThumbnailConversationHash}
        />
      </div>
    </div>
  )
}

export default Thumbnails
