import { useState, useCallback, useRef, useEffect } from 'react'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import { usePersonaStore } from '../stores/personaStore'
import { useStyleStore } from '../stores/styleStore'
import { PersonaSelector } from '../components/PersonaSelector'
import { StyleSelector } from '../components/StyleSelector'
import {
  useSaveThumbnailVariantMutation,
  useThumbnailConversationQuery,
  useThumbnailChatMutation,
} from '../queries/thumbnails/thumbnailQueries'
import { EditThumbnailDialog } from '../components/EditThumbnailDialog'
import { TabBar } from '../components/TabBar'
import { ThumbnailAnalyzePanel } from './ThumbnailAnalyzePanel'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import './ThumbnailGenerator.css'

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

function IconArrowUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19 0-14" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  )
}

function IconEmptyThumbnail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function IconPaperclip() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21.44 11.05-8.49 8.49a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.82-2.83l8.48-8.48" />
    </svg>
  )
}

const THUMBNAIL_LOADING_STEPS = [
  { id: 'analyze', label: 'Analyzing your request' },
  { id: 'generate', label: 'Generating thumbnails' },
  { id: 'done', label: 'Finalizing' },
]

const CONCEPT_COUNTS = [1, 2, 3, 4]

function parseThumbModeFromHash() {
  if (typeof window === 'undefined') return 'prompt'
  const hash = window.location.hash || ''
  const normalized = hash.replace(/^#/, '').replace(/^\/+/, '')
  const [routePart, search = ''] = normalized.split('?')
  if (routePart !== 'coach/thumbnails') return 'prompt'
  const params = new URLSearchParams(search)
  const v = params.get('view')
  if (v === 'recreate' || v === 'analyze' || v === 'edit') return v
  if (v === 'rater') return 'analyze'
  if (v === 'generate') return 'prompt'
  return 'prompt'
}

function pushThumbModeHash(conversationId, mode) {
  const params = new URLSearchParams()
  if (conversationId != null) params.set('id', String(conversationId))
  if (mode !== 'prompt') params.set('view', mode)
  const qs = params.toString()
  const path = qs ? `coach/thumbnails?${qs}` : 'coach/thumbnails'
  const nextHash = `#${path}`
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash
  }
}

const THUMB_GEN_SUB_TABS = [
  {
    id: 'prompt',
    label: 'Prompt',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'recreate',
    label: 'Recreate',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M23 4v6h-6" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    ),
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
  {
    id: 'edit',
    label: 'Edit',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" />
      </svg>
    ),
  },
]

const YOUTUBE_URL_RE = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]+/

function extractYoutubeUrl(text) {
  const m = String(text || '').match(YOUTUBE_URL_RE)
  return m ? m[0] : null
}

const THUMBNAIL_QUICK_ACTIONS = [
  { id: 'productivity', label: 'Productivity tips video', prompt: 'Productivity tips video thumbnail. Clean, professional style.' },
  { id: 'vlog', label: 'Daily vlog thumbnail', prompt: 'Daily vlog about a software developer\'s life. Warm, personal, engaging.' },
  { id: 'tutorial', label: 'Tech tutorial thumbnail', prompt: '"How to learn Python" tutorial. Educational, click-worthy.' },
]

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  )
}
function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" />
    </svg>
  )
}
function IconSparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  )
}
function IconSave() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}
function extractBase64FromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const i = dataUrl.indexOf(';base64,')
  return i >= 0 ? dataUrl.slice(i + 8) : null
}

async function pollJobUntilDone(thumbnailsApi, token, jobId, intervalMs = 2000, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await thumbnailsApi.getJob(token, jobId)
    if (job?.status === 'done') return job
    if (job?.status === 'failed') throw new Error(job?.error || 'Improvement failed')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('Improvement timed out')
}

function getScoreTier(score) {
  if (score == null) return null
  const n = Number(score)
  if (n >= 85) return 'high'
  if (n >= 60) return 'medium'
  return 'low'
}

function ThumbnailBatchCard({
  t,
  index,
  label,
  userRequest,
  msgId,
  onSave,
  onReplaceThumbnail,
  onRegenerate,
  onEdit,
}) {
  const [score, setScore] = useState(null)
  const [ratingId, setRatingId] = useState(null)
  const [loadingScore, setLoadingScore] = useState(false)
  const [scoreError, setScoreError] = useState(null)
  const [fixing, setFixing] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const ratedUrlRef = useRef(null)
  const saveMutation = useSaveThumbnailVariantMutation()

  const fetchScore = useCallback(async () => {
    if (!t?.image_url) return
    setScoreError(null)
    setLoadingScore(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) {
        setScoreError('Sign in to score')
        return
      }
      const base64 = extractBase64FromDataUrl(t.image_url)
      const payload = base64
        ? { thumbnail_image_base64: base64 }
        : { thumbnail_image_url: t.image_url }
      const res = await thumbnailsApi.rate(token, payload)
      setScore(Math.round(res?.overall_score ?? 0))
      setRatingId(res?.rating_id ?? null)
      ratedUrlRef.current = t.image_url
    } catch (err) {
      setScoreError(err?.message || 'Score failed')
      setScore(null)
      setRatingId(null)
    } finally {
      setLoadingScore(false)
    }
  }, [t?.image_url])

  const retryScore = useCallback(() => {
    setScoreError(null)
    ratedUrlRef.current = null
    fetchScore()
  }, [fetchScore])

  useEffect(() => {
    if (!t?.image_url) return
    if (ratedUrlRef.current === t.image_url) return
    fetchScore()
  }, [t?.image_url, fetchScore])

  const handleOneClickFix = async () => {
    if (!ratingId && !t?.image_url) return
    setFixing(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      let rid = ratingId
      if (!rid) {
        const base64 = extractBase64FromDataUrl(t.image_url)
        const payload = base64
          ? { thumbnail_image_base64: base64 }
          : { thumbnail_image_url: t.image_url }
        const rateRes = await thumbnailsApi.rate(token, payload)
        rid = rateRes?.rating_id
        setScore(Math.round(rateRes?.overall_score ?? 0))
        setRatingId(rid)
      }
      if (!rid) throw new Error('Could not rate thumbnail')
      const improveRes = await thumbnailsApi.improve(token, { rating_id: rid })
      const job = await pollJobUntilDone(thumbnailsApi, token, improveRes?.job_id)
      const result = job?.result_json
      const improved = result?.improved_thumbnail || result?.improved
      const imageUrl = improved?.image_url || result?.image_url
      if (imageUrl) {
        ratedUrlRef.current = imageUrl
        const newRating = result?.new_rating
        if (newRating?.overall_score != null) setScore(Math.round(newRating.overall_score))
        onReplaceThumbnail?.(msgId, index, {
          ...t,
          image_url: imageUrl,
          title: label,
        })
      }
    } catch (err) {
      console.error('One-click fix failed', err)
    } finally {
      setFixing(false)
    }
  }

  const handleDownload = () => {
    if (!t?.image_url) return
    const a = document.createElement('a')
    a.href = t.image_url
    a.download = `thumbnail-${label.replace(/\s+/g, '-')}.png`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  const handleSave = async () => {
    if (!t?.image_url) return
    try {
      await saveMutation.mutateAsync({
        image_url: t.image_url,
        user_request: userRequest || '',
        concept_title: label,
        psychology: '',
      })
    } catch (_) {}
  }

  const handleRegenerate = () => {
    onRegenerate?.(userRequest)
  }

  const handleEditDialogApply = useCallback(
    (newImageUrl) => {
      onReplaceThumbnail?.(msgId, index, {
        ...t,
        image_url: newImageUrl,
        title: label,
      })
      ratedUrlRef.current = newImageUrl
      setScore(null)
      setRatingId(null)
    },
    [onReplaceThumbnail, msgId, index, t, label]
  )

  return (
    <div className="thumb-batch-card">
      <div className="thumb-batch-card-inner">
        <div className="thumb-batch-img-wrap">
          <img src={t.image_url} alt={label} className="thumb-batch-img" />
          {(score != null || loadingScore || scoreError) && (
            <div
              className={`thumb-batch-score thumb-batch-score--${scoreError ? 'error' : loadingScore ? 'loading' : getScoreTier(score)}`}
              title={scoreError || 'AI quality score (CTR potential, visual clarity, contrast, emotional impact)'}
            >
              {scoreError ? (
                <span className="thumb-batch-score-retry" onClick={retryScore} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && retryScore()}>⟳</span>
              ) : loadingScore ? (
                <span className="thumb-batch-score-loading">…</span>
              ) : (
                <span className="thumb-batch-score-value">{score}</span>
              )}
            </div>
          )}
          <div className="thumb-batch-actions-card">
          <div className="thumb-batch-actions-row">
            <button
              type="button"
              className="thumb-batch-btn"
              onClick={handleDownload}
              title="Download"
              aria-label="Download"
            >
              <IconDownload />
            </button>
            <button
              type="button"
              className="thumb-batch-btn"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              title="Save to library"
              aria-label="Save to library"
            >
              {saveMutation.isPending ? (
                <span className="thumb-batch-btn-spinner" aria-hidden />
              ) : (
                <IconSave />
              )}
            </button>
            <button
              type="button"
              className="thumb-batch-btn thumb-batch-btn--highlight"
              onClick={handleOneClickFix}
              disabled={fixing}
              title="One-click fix (AI improve)"
              aria-label="One-click fix"
            >
              {fixing ? (
                <span className="thumb-batch-btn-spinner" aria-hidden />
              ) : (
                <IconSparkle />
              )}
            </button>
            <button
              type="button"
              className="thumb-batch-btn"
              onClick={() => setShowEditDialog(true)}
              title="AI Edit – select region to change"
              aria-label="Edit"
            >
              <IconEdit />
            </button>
            <button
              type="button"
              className="thumb-batch-btn"
              onClick={handleRegenerate}
              title="Regenerate"
              aria-label="Regenerate"
            >
              <IconRefresh />
            </button>
          </div>
          </div>
        </div>
      </div>
      {showEditDialog && (
        <EditThumbnailDialog
          imageUrl={t?.image_url}
          onClose={() => setShowEditDialog(false)}
          onApply={handleEditDialogApply}
        />
      )}
    </div>
  )
}

function ThumbnailGridBlock({ thumbnails, userRequest, msgId, onSave, onReplaceThumbnail, onRegenerate, onEdit }) {
  if (!thumbnails?.length) return null
  return (
    <div className="script-gen-content thumb-gen-content">
      <div className="script-gen-block script-gen-block--thumb-batch">
        <div className="script-gen-block-head">
          <span className="script-gen-block-title">Batch {thumbnails.length}x</span>
        </div>
        <div className="script-gen-block-body">
          <div className="thumb-batch-grid">
            {thumbnails.map((t, i) => (
              <ThumbnailBatchCard
                key={i}
                t={t}
                index={i}
                label={`${i + 1}x`}
                userRequest={userRequest}
                msgId={msgId}
                onSave={onSave}
                onReplaceThumbnail={onReplaceThumbnail}
                onRegenerate={onRegenerate}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ThumbnailImageBlock({ imageUrl }) {
  if (!imageUrl) return null
  return (
    <div className="script-gen-content thumb-gen-content">
      <div className="script-gen-block script-gen-block--thumb-img">
        <div className="script-gen-block-head">
          <span className="script-gen-block-title">Generated Thumbnail</span>
        </div>
        <div className="script-gen-block-body">
          <img src={imageUrl} alt="Generated thumbnail" className="thumb-generated-img" />
        </div>
      </div>
    </div>
  )
}

function buildMessagesFromApi(apiMessages = []) {
  return apiMessages.map((m) => {
    const thumbnails = m.role === 'assistant' && m.extra_data?.thumbnails ? m.extra_data.thumbnails : []
    const userRequest = m.role === 'assistant' && m.extra_data?.user_request ? m.extra_data.user_request : ''
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      userRequest,
      thumbnails,
    }
  })
}

export function ThumbnailGenerator({ channelId, onOpenPersonas, onOpenStyles, conversationId, onConversationCreated }) {
  const [thumbMode, setThumbMode] = useState(() => parseThumbModeFromHash())
  const [recreateDraft, setRecreateDraft] = useState('')
  const [analyzeFooterNote, setAnalyzeFooterNote] = useState('')
  const [editUrlInput, setEditUrlInput] = useState('')
  const [editDataUrl, setEditDataUrl] = useState(null)
  const [editDialogUrl, setEditDialogUrl] = useState(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [lastEditedUrl, setLastEditedUrl] = useState(null)
  const [editFooterError, setEditFooterError] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [numThumbnails, setNumThumbnails] = useState(4)
  const [sendError, setSendError] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState(null)
  const [pendingAssistant, setPendingAssistant] = useState(false)
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const [fetchedThumbnailUrl, setFetchedThumbnailUrl] = useState(null)
  const [fetchingThumb, setFetchingThumb] = useState(false)
  const stepIntervalRef = useRef(null)
  const fetchThumbRef = useRef(null)
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId)
  const selectedStyleId = useStyleStore((s) => s.selectedStyleId)
  const threadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const recreateTextareaRef = useRef(null)
  const editTextareaRef = useRef(null)
  const editFileInputRef = useRef(null)

  const conversationQuery = useThumbnailConversationQuery(conversationId)
  const chatMutation = useThumbnailChatMutation(onConversationCreated)

  useEffect(() => {
    const sync = () => setThumbMode(parseThumbModeFromHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const handleThumbModeTab = useCallback(
    (id) => {
      setThumbMode(id)
      pushThumbModeHash(conversationId, id)
    },
    [conversationId]
  )

  useEffect(() => {
    setSendError('')
  }, [thumbMode])

  /** Deep link from dashboard: #coach/thumbnails?prompt=...&prefill=...&focus=battle */
  const thumbDashStableRef = useRef('')
  useEffect(() => {
    const applyFromHash = () => {
      if (conversationId) return
      const hash = (typeof window !== 'undefined' && window.location.hash) || ''
      const normalized = hash.replace(/^#/, '').replace(/^\/+/, '')
      const [routePart, search = ''] = normalized.split('?')
      if (routePart !== 'coach/thumbnails') return
      const params = new URLSearchParams(search)
      const prompt = params.get('prompt')
      const focus = params.get('focus')
      const prefill = params.get('prefill')
      const stableAfter = `${prompt || ''}|${focus || ''}`
      if (thumbDashStableRef.current === stableAfter) return
      if (focus === 'battle') setNumThumbnails(4)
      if (!prefill && !prompt) {
        thumbDashStableRef.current = stableAfter
        return
      }
      let combined = ''
      if (prefill) {
        try {
          combined = decodeURIComponent(prefill)
        } catch {
          combined = prefill
        }
      }
      if (prompt) {
        try {
          const p = decodeURIComponent(prompt.replace(/\+/g, ' '))
          combined = combined ? `${combined}\n\nVideo topic: ${p}` : `Video topic: ${p}`
        } catch {
          combined = combined ? `${combined}\n\nVideo topic: ${prompt}` : `Video topic: ${prompt}`
        }
      }
      if (combined) {
        setDraft(combined)
        if (prefill) stripPrefillFromHash()
        thumbDashStableRef.current = stableAfter
      }
    }
    applyFromHash()
    window.addEventListener('hashchange', applyFromHash)
    return () => window.removeEventListener('hashchange', applyFromHash)
  }, [conversationId])

  useEffect(() => {
    if (conversationId && conversationQuery.data?.messages?.items) {
      setMessages(buildMessagesFromApi(conversationQuery.data.messages.items))
    } else if (!conversationId) {
      setMessages([])
    }
  }, [conversationId, conversationQuery.data])

  const isEmptyScreen = messages.length === 0 && !pendingUserMessage && !pendingAssistant
  const showMainEmpty =
    (thumbMode === 'prompt' && isEmptyScreen) ||
    (thumbMode === 'recreate' && isEmptyScreen)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pendingUserMessage, pendingAssistant, thumbMode])

  useEffect(() => {
    if (!pendingAssistant) {
      setLoadingStepIndex(0)
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current)
        stepIntervalRef.current = null
      }
      return
    }
    setLoadingStepIndex(0)
    const totalSteps = THUMBNAIL_LOADING_STEPS.length
    const intervalMs = 6000
    stepIntervalRef.current = setInterval(() => {
      setLoadingStepIndex((prev) => Math.min(prev + 1, totalSteps - 1))
    }, intervalMs)
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current)
    }
  }, [pendingAssistant])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(28, Math.min(el.scrollHeight, 140))}px`
  }, [draft])

  useEffect(() => {
    const el = recreateTextareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(28, Math.min(el.scrollHeight, 140))}px`
  }, [recreateDraft])

  useEffect(() => {
    const el = editTextareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.max(28, Math.min(el.scrollHeight, 140))}px`
  }, [editUrlInput])

  useEffect(() => {
    const url = extractYoutubeUrl(draft)
    if (!url) {
      setFetchedThumbnailUrl(null)
      return
    }
    if (fetchThumbRef.current) clearTimeout(fetchThumbRef.current)
    fetchThumbRef.current = setTimeout(async () => {
      setFetchingThumb(true)
      setFetchedThumbnailUrl(null)
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return
        const res = await thumbnailsApi.fetchExistingThumbnail(token, url)
        if (res?.thumbnail_url) setFetchedThumbnailUrl(res.thumbnail_url)
      } catch {
        setFetchedThumbnailUrl(null)
      } finally {
        setFetchingThumb(false)
      }
    }, 500)
    return () => {
      if (fetchThumbRef.current) clearTimeout(fetchThumbRef.current)
    }
  }, [draft])

  const handleQuickAction = (prompt) => {
    setDraft(prompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const len = textareaRef.current?.value?.length || 0
      textareaRef.current?.setSelectionRange?.(len, len)
    })
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    const trimmed = String(draft || '').trim()
    if (!trimmed || pendingAssistant) return

    const url = extractYoutubeUrl(trimmed)
    const isRegenerate = !!url

    if (isRegenerate) {
      const context = trimmed.replace(url, '').replace(/\s+/g, ' ').trim()
      const hasPersona = !!selectedPersonaId
      const hasContext = !!context
      if (!hasPersona && !hasContext) {
        setSendError('Select a persona and/or add context (e.g. "more dramatic") in the same input.')
        return
      }
    } else if (trimmed.length < 5) {
      return
    }

    setSendError('')
    setPendingUserMessage(trimmed)
    setPendingAssistant(true)
    setDraft('')

    try {
      const result = await chatMutation.mutateAsync({
        message: trimmed,
        conversation_id: conversationId || undefined,
        num_thumbnails: isRegenerate ? 1 : numThumbnails,
        persona_id: selectedPersonaId || undefined,
        style_id: selectedStyleId || undefined,
        channel_id: channelId || undefined,
      })
      const thumbnails = result?.thumbnails || []
      const assistantMsg = {
        id: result?.message_id ?? `assistant-${Date.now()}`,
        role: 'assistant',
        content: result?.content || (thumbnails.length > 0
          ? `Here are ${thumbnails.length} thumbnail${thumbnails.length !== 1 ? 's' : ''}.`
          : 'Could not generate thumbnails.'),
        userRequest: trimmed,
        thumbnails,
      }
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: trimmed },
        assistantMsg,
      ])
    } catch (err) {
      setSendError(err?.message || 'Could not generate thumbnails.')
      setDraft(trimmed)
    } finally {
      setPendingUserMessage(null)
      setPendingAssistant(false)
    }
  }

  const handleCopyMessage = async (msg) => {
    try {
      let text = msg.content || ''
      if (msg.thumbnails?.length) {
        text += '\n\n' + msg.thumbnails.map((t) => `${t.title}: ${t.image_url?.slice(0, 80)}...`).join('\n\n')
      }
      if (navigator.clipboard?.writeText && text) await navigator.clipboard.writeText(text)
    } catch (_) {}
  }

  const handleReplaceThumbnail = useCallback((msgId, thumbIndex, newThumbnail) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.role === 'assistant'
          ? { ...m, thumbnails: m.thumbnails.map((t, i) => (i === thumbIndex ? newThumbnail : t)) }
          : m
      )
    )
  }, [])

  const handleRegenerateOne = useCallback(
    async (userRequest) => {
      if (!userRequest?.trim() || pendingAssistant) return
      setPendingAssistant(true)
      setPendingUserMessage(userRequest)
      try {
        const result = await chatMutation.mutateAsync({
          message: userRequest,
          conversation_id: conversationId || undefined,
          num_thumbnails: 1,
          persona_id: selectedPersonaId || undefined,
          style_id: selectedStyleId || undefined,
          channel_id: channelId || undefined,
        })
        const thumbnails = result?.thumbnails || []
        const assistantMsg = {
          id: result?.message_id ?? `assistant-${Date.now()}`,
          role: 'assistant',
          content: result?.content || 'Regenerated.',
          userRequest,
          thumbnails,
        }
        setMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: 'user', content: userRequest },
          assistantMsg,
        ])
      } catch (err) {
        setSendError(err?.message || 'Regeneration failed')
      } finally {
        setPendingAssistant(false)
        setPendingUserMessage(null)
      }
    },
    [chatMutation, conversationId, selectedPersonaId, selectedStyleId, channelId, pendingAssistant]
  )

  const handleEditAndRegenerate = useCallback(
    async (userRequest, editInstructions) => {
      const combined = `${userRequest.trim()} ${editInstructions.trim()}`.trim()
      if (!combined || pendingAssistant) return
      await handleRegenerateOne(combined)
    },
    [handleRegenerateOne, pendingAssistant]
  )

  const handleRecreateSubmit = async (e) => {
    e?.preventDefault?.()
    const text = recreateDraft.trim()
    const url = extractYoutubeUrl(text)
    if (!url) {
      setSendError('Include a valid YouTube URL (watch or youtu.be link).')
      return
    }
    const instr = text.replace(url, '').replace(/^\s*[\n\r]+/, '').trim()
    if (!selectedPersonaId && !instr) {
      setSendError('Select a persona and/or add instructions (e.g. “warmer colors, bigger text”).')
      return
    }
    const trimmed = instr ? `${url}\n\n${instr}` : url
    if (pendingAssistant) return
    setSendError('')
    setPendingUserMessage(trimmed)
    setPendingAssistant(true)
    try {
      const result = await chatMutation.mutateAsync({
        message: trimmed,
        conversation_id: conversationId || undefined,
        num_thumbnails: 1,
        persona_id: selectedPersonaId || undefined,
        style_id: selectedStyleId || undefined,
        channel_id: channelId || undefined,
      })
      const thumbnails = result?.thumbnails || []
      const assistantMsg = {
        id: result?.message_id ?? `assistant-${Date.now()}`,
        role: 'assistant',
        content: result?.content || (thumbnails.length > 0 ? 'Here is your recreated thumbnail.' : 'Could not recreate.'),
        userRequest: trimmed,
        thumbnails,
      }
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: trimmed },
        assistantMsg,
      ])
      setRecreateDraft('')
    } catch (err) {
      setSendError(err?.message || 'Could not recreate thumbnail.')
    } finally {
      setPendingUserMessage(null)
      setPendingAssistant(false)
    }
  }

  const handleEditFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      setEditDataUrl(String(reader.result || ''))
      setEditUrlInput('')
      setEditFooterError('')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleEditSubmit = (e) => {
    e.preventDefault()
    setEditFooterError('')
    if (editDataUrl) {
      setEditDialogUrl(editDataUrl)
      setShowEditDialog(true)
      return
    }
    const u = editUrlInput.trim()
    if (u && /^https?:\/\//i.test(u)) {
      setEditDialogUrl(u)
      setShowEditDialog(true)
      return
    }
    setEditFooterError('Upload an image or paste a direct https image URL.')
  }

  const handleAnalyzeFooterSubmit = (e) => {
    e?.preventDefault?.()
    requestAnimationFrame(() => {
      const btn = document.getElementById('thumb-analyze-cta')
      btn?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      btn?.focus?.()
    })
  }

  return (
    <div
      id="coach-panel-thumbnails"
      className={`coach-main ${showMainEmpty ? 'coach-main--empty' : ''}`}
      role="tabpanel"
      aria-labelledby="coach-tab-thumbnails"
    >
      <section className={`coach-chat-shell ${showMainEmpty ? 'coach-chat-shell--empty' : ''}`}>
        <div
          ref={threadRef}
          className={`coach-thread ${showMainEmpty ? 'coach-thread--empty' : ''} ${thumbMode === 'analyze' ? 'coach-thread--thumb-analyze' : ''} ${thumbMode === 'edit' ? 'coach-thread--thumb-edit' : ''}`}
        >
          {thumbMode === 'analyze' && <ThumbnailAnalyzePanel />}
          {thumbMode === 'edit' && (
            <div className="thumb-mode-edit-thread">
              <div className="thumb-edit-intro">
                <p className="thumb-edit-intro-kicker">Region editor</p>
                <h2 className="thumb-edit-intro-title">AI edit — brush or box a region</h2>
                <p className="thumb-edit-intro-copy">
                  Pick an image in the bar below and open the editor. Your request is not posted to the thumbnail chat.
                </p>
                {lastEditedUrl && (
                  <div className="thumb-edit-last">
                    <span className="thumb-edit-last-label">Last export</span>
                    <img src={lastEditedUrl} alt="Last edited thumbnail" className="thumb-edit-last-img" />
                  </div>
                )}
              </div>
            </div>
          )}
          {(thumbMode === 'prompt' || thumbMode === 'recreate') && (
            <>
          {thumbMode === 'prompt' && isEmptyScreen && (
            <div className="coach-empty-state">
              <span className="coach-empty-state-kicker">Thumbnail Generator</span>
              <h1>What thumbnail do you need?</h1>
              <div className="coach-empty-actions" role="group" aria-label="Quick actions">
                {THUMBNAIL_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    className={`coach-empty-action coach-empty-action--${action.id}`}
                    onClick={() => handleQuickAction(action.prompt)}
                  >
                    <span className="coach-empty-action-icon-wrap" aria-hidden>
                      <IconEmptyThumbnail />
                    </span>
                    <span className="coach-empty-action-label">{action.label}</span>
                  </button>
                ))}
              </div>
              {channelId && <p className="script-gen-empty-hint">Using your channel for personalized thumbnails.</p>}
            </div>
          )}
          {thumbMode === 'recreate' && isEmptyScreen && (
            <div className="coach-empty-state thumb-recreate-empty">
              <span className="coach-empty-state-kicker">Recreate</span>
              <h1>Rebuild a YouTube thumbnail</h1>
              <p className="script-gen-empty-hint">
                Paste a video link and describe what should change — lighting, face, text, or style. Uses your persona and outputs one new image.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <article
              key={msg.id}
              className={`coach-message ${msg.role === 'user' ? 'coach-message--user' : 'coach-message--assistant'}`}
            >
              {msg.role === 'user' ? (
                <div className="coach-user-message-stack">
                  <div className="coach-message-bubble">
                    <p>{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div className="coach-message-bubble">
                  {msg.thumbnails?.length > 0 && (
                    <ThumbnailGridBlock
                      thumbnails={msg.thumbnails}
                      userRequest={msg.userRequest}
                      msgId={msg.id}
                      onReplaceThumbnail={handleReplaceThumbnail}
                      onRegenerate={handleRegenerateOne}
                      onEdit={handleEditAndRegenerate}
                    />
                  )}
                </div>
              )}
              {msg.role !== 'assistant' || !msg.thumbnails?.length ? (
                <div className="coach-message-actions">
                  <button
                    type="button"
                    className="coach-message-action"
                    onClick={() => handleCopyMessage(msg)}
                    aria-label="Copy"
                  >
                    <IconCopy />
                  </button>
                </div>
              ) : null}
            </article>
          ))}

          {pendingUserMessage && (
            <article className="coach-message coach-message--user">
              <div className="coach-user-message-stack">
                <div className="coach-message-bubble">
                  <p>{pendingUserMessage}</p>
                </div>
              </div>
            </article>
          )}

          {pendingAssistant && (
            <article className="coach-message coach-message--assistant">
              <div className="coach-message-bubble script-loading-bubble">
                <div className="script-loading-steps" role="status" aria-live="polite" aria-label="Generating thumbnails">
                  <div className="script-loading-header">
                    <div className="script-loading-spinner" aria-hidden />
                    <span className="script-loading-title">Generating thumbnails</span>
                  </div>
                  <ul className="script-loading-list">
                    {THUMBNAIL_LOADING_STEPS.map((step, i) => {
                      const done = i < loadingStepIndex
                      const active = i === loadingStepIndex
                      return (
                        <li
                          key={step.id}
                          className={`script-loading-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
                        >
                          <span className="script-loading-step-icon">
                            {done ? <IconCheck /> : active ? <span className="script-loading-step-dot" /> : <span className="script-loading-step-pending" />}
                          </span>
                          <span className="script-loading-step-label">{step.label}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <footer className={`coach-composer-wrap ${showMainEmpty ? 'coach-composer-wrap--empty' : ''} coach-composer-wrap--thumb-tools`}>
          <div className="thumb-gen-subtabbar-wrap">
            <TabBar
              tabs={THUMB_GEN_SUB_TABS}
              value={thumbMode}
              onChange={handleThumbModeTab}
              ariaLabel="Thumbnail modes"
              variant="minimal"
              className="thumb-gen-subtabbar"
            />
          </div>
          {sendError && (thumbMode === 'prompt' || thumbMode === 'recreate') && (
            <div className="coach-compose-error">{sendError}</div>
          )}
          {editFooterError && thumbMode === 'edit' && (
            <div className="coach-compose-error">{editFooterError}</div>
          )}
          {thumbMode === 'prompt' && (
            <form className="coach-composer script-gen-composer" onSubmit={handleSubmit}>
              <div className="coach-composer-input-wrap">
                {(fetchedThumbnailUrl || fetchingThumb) && (
                  <div className="thumb-input-preview">
                    {fetchingThumb && <span className="thumb-input-status">Fetching thumbnail…</span>}
                    {fetchedThumbnailUrl && !fetchingThumb && (
                      <img src={fetchedThumbnailUrl} alt="Fetched" className="thumb-input-preview-img" />
                    )}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(String(e.target.value).slice(0, 500))}
                  placeholder="Describe your video or paste a YouTube URL for ideas — batch generates up to 4 concepts."
                  rows={1}
                  className="coach-composer-input"
                  maxLength={500}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e)
                    }
                  }}
                />
              </div>
              <div className="coach-composer-actions">
                <div className="coach-composer-actions-left script-gen-actions-left">
                  <PersonaSelector onOpenLibrary={onOpenPersonas} compact />
                  <StyleSelector onOpenLibrary={onOpenStyles} compact />
                  <select
                    className="script-gen-dropdown"
                    value={numThumbnails}
                    onChange={(e) => setNumThumbnails(Number(e.target.value))}
                    aria-label="Number of thumbnails"
                  >
                    {CONCEPT_COUNTS.map((n) => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="coach-composer-send coach-composer-primary-action is-send"
                  disabled={!draft.trim() || pendingAssistant || (!extractYoutubeUrl(draft) && draft.trim().length < 5)}
                  aria-label="Send"
                >
                  <IconArrowUp />
                </button>
              </div>
            </form>
          )}
          {thumbMode === 'recreate' && (
            <form className="coach-composer script-gen-composer" onSubmit={handleRecreateSubmit}>
              <div className="coach-composer-input-wrap">
                <textarea
                  ref={recreateTextareaRef}
                  value={recreateDraft}
                  onChange={(e) => setRecreateDraft(String(e.target.value).slice(0, 600))}
                  placeholder="Paste a YouTube URL, then describe what to change (new lines). Example: https://youtu.be/… then warmer colors, bigger text."
                  rows={1}
                  className="coach-composer-input"
                  maxLength={600}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleRecreateSubmit(e)
                    }
                  }}
                />
              </div>
              <div className="coach-composer-actions">
                <div className="coach-composer-actions-left script-gen-actions-left">
                  <PersonaSelector onOpenLibrary={onOpenPersonas} compact />
                  <StyleSelector onOpenLibrary={onOpenStyles} compact />
                  <select className="script-gen-dropdown" disabled aria-label="Batch size" title="Recreate uses one thumbnail">
                    <option>1×</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="coach-composer-send coach-composer-primary-action is-send"
                  disabled={!extractYoutubeUrl(recreateDraft) || pendingAssistant}
                  aria-label="Recreate thumbnail"
                >
                  <IconArrowUp />
                </button>
              </div>
            </form>
          )}
          {thumbMode === 'analyze' && (
            <form className="coach-composer script-gen-composer" onSubmit={handleAnalyzeFooterSubmit}>
              <div className="coach-composer-input-wrap">
                <textarea
                  value={analyzeFooterNote}
                  onChange={(e) => setAnalyzeFooterNote(String(e.target.value).slice(0, 300))}
                  placeholder="Optional notes. Scroll up to upload or fetch a thumbnail, then run analysis."
                  rows={1}
                  className="coach-composer-input"
                  maxLength={300}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleAnalyzeFooterSubmit(e)
                    }
                  }}
                />
              </div>
              <div className="coach-composer-actions">
                <div className="coach-composer-actions-left script-gen-actions-left">
                  <PersonaSelector onOpenLibrary={onOpenPersonas} compact />
                  <StyleSelector onOpenLibrary={onOpenStyles} compact />
                  <select className="script-gen-dropdown" disabled aria-label="Batch size" title="Not used in Analyze">
                    <option>—</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="coach-composer-send coach-composer-primary-action is-send"
                  aria-label="Go to analysis"
                >
                  <IconArrowUp />
                </button>
              </div>
            </form>
          )}
          {thumbMode === 'edit' && (
            <form className="coach-composer script-gen-composer" onSubmit={handleEditSubmit}>
              <div className="coach-composer-input-wrap">
                {editDataUrl && (
                  <div className="thumb-input-preview">
                    <img src={editDataUrl} alt="" className="thumb-input-preview-img" />
                  </div>
                )}
                <textarea
                  ref={editTextareaRef}
                  value={editUrlInput}
                  onChange={(e) => {
                    setEditUrlInput(e.target.value)
                    setEditDataUrl(null)
                    setEditFooterError('')
                  }}
                  placeholder="Paste a direct https image URL, or tap the attachment button to upload."
                  rows={1}
                  className="coach-composer-input"
                  maxLength={800}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleEditSubmit(e)
                    }
                  }}
                />
              </div>
              <div className="coach-composer-actions">
                <div className="coach-composer-actions-left script-gen-actions-left">
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    className="coach-file-input"
                    onChange={handleEditFileChange}
                  />
                  <button
                    type="button"
                    className="coach-composer-tool coach-composer-tool--circle"
                    onClick={() => editFileInputRef.current?.click()}
                    aria-label="Upload image"
                    title="Upload image"
                  >
                    <IconPaperclip />
                  </button>
                  <PersonaSelector onOpenLibrary={onOpenPersonas} compact />
                  <StyleSelector onOpenLibrary={onOpenStyles} compact />
                </div>
                <button
                  type="submit"
                  className="coach-composer-send coach-composer-primary-action is-send"
                  disabled={!editDataUrl && !editUrlInput.trim()}
                  aria-label="Open editor"
                >
                  <IconArrowUp />
                </button>
              </div>
            </form>
          )}
        </footer>
      </section>
      {showEditDialog && editDialogUrl && (
        <EditThumbnailDialog
          imageUrl={editDialogUrl}
          onClose={() => {
            setShowEditDialog(false)
            setEditDialogUrl(null)
          }}
          onApply={(newUrl) => {
            setLastEditedUrl(newUrl)
            setShowEditDialog(false)
            setEditDialogUrl(null)
          }}
        />
      )}
    </div>
  )
}
