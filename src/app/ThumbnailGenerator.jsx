import { useState, useCallback, useRef, useEffect } from 'react'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import { usePersonaStore } from '../stores/personaStore'
import { useStyleStore } from '../stores/styleStore'
import { PersonaSelector } from '../components/PersonaSelector'
import { StyleSelector } from '../components/StyleSelector'
import {
  useThumbnailConversationQuery,
  useThumbnailChatMutation,
} from '../queries/thumbnails/thumbnailQueries'
import { EditThumbnailDialog } from '../components/EditThumbnailDialog'
import { TabBar } from '../components/TabBar'
import { ChatHistoryLoading } from '../components/ChatHistoryLoading'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import { extractYoutubeUrl } from '../lib/youtubeUrl'
import './ScriptGenerator.css'
import './ThumbnailGenerator.css'

function IconCopy() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

function IconArrowUp() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 19 0-14" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function IconPaperclip() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.44 11.05-8.49 8.49a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.82-2.83l8.48-8.48" />
    </svg>
  )
}

const THUMBNAIL_LOADING_STEPS = [
  { id: 'analyze', label: 'Analyzing your request' },
  { id: 'generate', label: 'Generating thumbnails' },
  { id: 'done', label: 'Finalizing' },
]

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
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 'recreate',
    label: 'Recreate',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M23 4v6h-6" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    ),
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
  {
    id: 'edit',
    label: 'Edit',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 20h9" />
        <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" />
      </svg>
    ),
  },
]

function IconYoutubeStrip() {
  return (
    <svg
      className="thumb-youtube-strip-logo"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden
    >
      <defs>
        <linearGradient id="thumbYtStripGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff5f52" />
          <stop offset="100%" stopColor="#b71c1c" />
        </linearGradient>
      </defs>
      <rect x="2" y="5" width="20" height="14" rx="3.5" fill="url(#thumbYtStripGrad)" />
      <path
        fill="#fff"
        d="M10 9.3v5.4c0 .42.45.68.82.48l4.2-2.55a.52.52 0 0 0 0-.9l-4.2-2.55c-.37-.22-.82.04-.82.47Z"
      />
    </svg>
  )
}

function ThumbBatchCirclePicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', onDoc)
      return () => document.removeEventListener('click', onDoc)
    }
  }, [open])

  return (
    <div ref={ref} className={`thumb-batch-circle-picker ${disabled ? 'is-disabled' : ''}`}>
      <button
        type="button"
        className="thumb-batch-circle-trigger"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Concepts: ${value}`}
        title={disabled ? 'Batch size' : 'How many concepts to generate'}
      >
        <span className="thumb-batch-circle-trigger-badge thumb-batch-circle-trigger-badge--solo">
          {value}×
        </span>
      </button>
      {open && !disabled && (
        <div className="thumb-batch-circle-popover" role="listbox" aria-label="Concept count">
          <p className="thumb-batch-circle-popover-title">Concepts per run</p>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              className={`thumb-batch-circle-option ${n === value ? 'is-active' : ''}`}
              aria-selected={n === value}
              onClick={() => {
                onChange(n)
                setOpen(false)
              }}
            >
              <span className="thumb-batch-circle-option-n">{n}×</span>
              <span className="thumb-batch-circle-option-hint">
                {n === 1 ? 'Single idea' : `${n} variations`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function IconDownload() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function IconRefresh() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  )
}
function IconEdit() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" />
    </svg>
  )
}
function IconSparkle() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  )
}
function extractBase64FromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const i = dataUrl.indexOf(';base64,')
  return i >= 0 ? dataUrl.slice(i + 8) : null
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

async function createFullMaskBase64(imageUrl) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not prepare image mask'))
    el.src = imageUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png').split(',')[1]
}

function buildSelectionHint(selectedPersona, selectedStyle) {
  const hints = []
  if (selectedPersona?.name) hints.push(`Use persona inspiration: ${selectedPersona.name}.`)
  if (selectedStyle?.name) hints.push(`Match visual style: ${selectedStyle.name}.`)
  return hints.join(' ')
}

function buildAnalyzeSummary(rating, videoTitle) {
  const tier = rating?.tier ? `${rating.tier} ` : ''
  const score = Math.round(rating?.overall_score ?? 0)
  const strengths = Array.isArray(rating?.strengths) ? rating.strengths.slice(0, 2) : []
  const fixes = Array.isArray(rating?.recommendations) ? rating.recommendations.slice(0, 3) : []
  const bits = [
    `${videoTitle ? `${videoTitle}: ` : ''}${tier}thumbnail score ${score}/100.`,
    strengths.length ? `Strengths: ${strengths.join('; ')}.` : '',
    fixes.length ? `Next fixes: ${fixes.join('; ')}.` : '',
  ].filter(Boolean)
  return bits.join(' ')
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
  onReplaceThumbnail,
  onRegenerate,
  onViewImage,
}) {
  const [score, setScore] = useState(null)
  const [ratingId, setRatingId] = useState(null)
  const [loadingScore, setLoadingScore] = useState(false)
  const [scoreError, setScoreError] = useState(null)
  const [fixing, setFixing] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const ratedUrlRef = useRef(null)

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
    <div className="thumb-batch-card" data-thumb-slot={index}>
      <div className="thumb-batch-card-inner">
        <div
          className="thumb-batch-img-wrap thumb-batch-img-wrap--viewable"
          role="button"
          tabIndex={0}
          onClick={() => onViewImage?.(t.image_url, label)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onViewImage?.(t.image_url, label)
            }
          }}
          aria-label={`View ${label} full size`}
        >
          <img src={t.image_url} alt={label} className="thumb-batch-img" />
          {(score != null || loadingScore || scoreError) && (
            <div
              className={`thumb-batch-score thumb-batch-score--${scoreError ? 'error' : loadingScore ? 'loading' : getScoreTier(score)}`}
              title={
                scoreError ||
                'AI quality score (CTR potential, visual clarity, contrast, emotional impact)'
              }
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {scoreError ? (
                <span
                  className="thumb-batch-score-retry"
                  onClick={retryScore}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && retryScore()}
                >
                  ⟳
                </span>
              ) : loadingScore ? (
                <span className="thumb-batch-score-loading">…</span>
              ) : (
                <span className="thumb-batch-score-value">{score}</span>
              )}
            </div>
          )}
          <div
            className="thumb-batch-actions-card"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
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

function ThumbnailGridBlock({
  thumbnails,
  userRequest,
  msgId,
  onReplaceThumbnail,
  onRegenerate,
  onViewImage,
}) {
  if (!thumbnails?.length) return null
  return (
    <div className="script-gen-content thumb-gen-content">
      <div className="script-gen-block script-gen-block--thumb-batch">
        <div className="script-gen-block-head">
          <span className="script-gen-block-title">Batch {thumbnails.length}x</span>
          <span className="script-gen-block-subtitle">Tap an image to view full size</span>
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
                onReplaceThumbnail={onReplaceThumbnail}
                onRegenerate={onRegenerate}
                onViewImage={onViewImage}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ThumbnailImageBlock({ imageUrl, onViewImage }) {
  if (!imageUrl) return null
  return (
    <div className="script-gen-content thumb-gen-content" data-thumb-slot={0}>
      <div className="script-gen-block script-gen-block--thumb-img">
        <div className="script-gen-block-head">
          <span className="script-gen-block-title">Generated Thumbnail</span>
        </div>
        <div className="script-gen-block-body">
          <button
            type="button"
            className="thumb-generated-img-btn"
            onClick={() => onViewImage?.(imageUrl, 'Generated')}
            aria-label="View thumbnail full size"
          >
            <img src={imageUrl} alt="Generated thumbnail" className="thumb-generated-img" />
          </button>
        </div>
      </div>
    </div>
  )
}

function buildMessagesFromApi(apiMessages = []) {
  return apiMessages.map((m) => {
    const thumbnails =
      m.role === 'assistant' && m.extra_data?.thumbnails ? m.extra_data.thumbnails : []
    const imageUrl =
      m.role === 'assistant' && m.extra_data?.image_url ? m.extra_data.image_url : null
    const userRequest =
      m.role === 'assistant' && m.extra_data?.user_request ? m.extra_data.user_request : ''
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      userRequest,
      thumbnails,
      imageUrl,
    }
  })
}

function ThumbnailLightbox({ url, title, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!url) return null
  return (
    <div
      className="thumb-gen-lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Thumbnail preview"
    >
      <div className="thumb-gen-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <div className="thumb-gen-lightbox-chrome">
          <span className="thumb-gen-lightbox-title">{title || 'Thumbnail'}</span>
          <button
            type="button"
            className="thumb-gen-lightbox-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="thumb-gen-lightbox-stage">
          <img src={url} alt="" className="thumb-gen-lightbox-img" />
        </div>
      </div>
    </div>
  )
}

export function ThumbnailGenerator({
  channelId,
  onOpenPersonas,
  onOpenStyles,
  conversationId,
  onConversationCreated,
}) {
  const [lightbox, setLightbox] = useState(null)
  const [thumbMode, setThumbMode] = useState(() => parseThumbModeFromHash())
  const [recreateDraft, setRecreateDraft] = useState('')
  const [recreateSourceMode, setRecreateSourceMode] = useState('youtube')
  const [recreateUrlInput, setRecreateUrlInput] = useState('')
  const [recreateSourceImage, setRecreateSourceImage] = useState(null)
  const [recreatePreviewUrl, setRecreatePreviewUrl] = useState(null)
  const [recreateFetchingPreview, setRecreateFetchingPreview] = useState(false)
  const [analyzeTitle, setAnalyzeTitle] = useState('')
  const [analyzeSourceMode, setAnalyzeSourceMode] = useState('youtube')
  const [analyzeUrlInput, setAnalyzeUrlInput] = useState('')
  const [analyzeSourceImage, setAnalyzeSourceImage] = useState(null)
  const [analyzePreviewUrl, setAnalyzePreviewUrl] = useState(null)
  const [analyzeFetchingPreview, setAnalyzeFetchingPreview] = useState(false)
  const [editSourceMode, setEditSourceMode] = useState('upload')
  const [editUrlInput, setEditUrlInput] = useState('')
  const [editDataUrl, setEditDataUrl] = useState(null)
  const [editPreviewUrl, setEditPreviewUrl] = useState(null)
  const [editFetchingPreview, setEditFetchingPreview] = useState(false)
  const [promptImageDataUrl, setPromptImageDataUrl] = useState(null)
  const [editDialogUrl, setEditDialogUrl] = useState(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editFooterError, setEditFooterError] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [numThumbnails, setNumThumbnails] = useState(1)
  const [sendError, setSendError] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState(null)
  const [pendingAssistant, setPendingAssistant] = useState(false)
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const stepIntervalRef = useRef(null)
  const promptFileInputRef = useRef(null)
  const recreateFileInputRef = useRef(null)
  const analyzeFileInputRef = useRef(null)
  const recreateFetchRef = useRef(null)
  const analyzeFetchRef = useRef(null)
  const editFetchRef = useRef(null)
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId)
  const selectedPersona = usePersonaStore((s) => s.selectedPersona)
  const selectedStyleId = useStyleStore((s) => s.selectedStyleId)
  const selectedStyle = useStyleStore((s) => s.selectedStyle)
  const threadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const recreateTextareaRef = useRef(null)
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
    if (!conversationId) {
      setMessages([])
      return
    }
    if (conversationQuery.data?.messages?.items) {
      setMessages(buildMessagesFromApi(conversationQuery.data.messages.items))
    } else {
      setMessages([])
    }
  }, [conversationId, conversationQuery.data])

  const isHistoryLoading =
    conversationId != null && (conversationQuery.isPending || conversationQuery.isPlaceholderData)
  const isEmptyScreen =
    !isHistoryLoading && messages.length === 0 && !pendingUserMessage && !pendingAssistant
  const layoutCentered = isEmptyScreen || isHistoryLoading

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pendingUserMessage, pendingAssistant, thumbMode])

  const openThumbLightbox = useCallback((url, title) => {
    if (!url) return
    setLightbox({ url, title: title || 'Thumbnail' })
  }, [])

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
    const intervalMs = 2200
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
    if (recreateSourceMode !== 'youtube') {
      setRecreatePreviewUrl(null)
      setRecreateFetchingPreview(false)
      return
    }
    const url = extractYoutubeUrl(recreateUrlInput)
    if (!url) {
      setRecreatePreviewUrl(null)
      return
    }
    if (recreateFetchRef.current) clearTimeout(recreateFetchRef.current)
    recreateFetchRef.current = setTimeout(async () => {
      setRecreateFetchingPreview(true)
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return
        const res = await thumbnailsApi.fetchExistingThumbnail(token, url)
        setRecreatePreviewUrl(res?.thumbnail_url || null)
      } catch {
        setRecreatePreviewUrl(null)
      } finally {
        setRecreateFetchingPreview(false)
      }
    }, 350)
    return () => {
      if (recreateFetchRef.current) clearTimeout(recreateFetchRef.current)
    }
  }, [recreateSourceMode, recreateUrlInput])

  useEffect(() => {
    if (analyzeSourceMode !== 'youtube') {
      setAnalyzePreviewUrl(null)
      setAnalyzeFetchingPreview(false)
      return
    }
    const url = extractYoutubeUrl(analyzeUrlInput)
    if (!url) {
      setAnalyzePreviewUrl(null)
      return
    }
    if (analyzeFetchRef.current) clearTimeout(analyzeFetchRef.current)
    analyzeFetchRef.current = setTimeout(async () => {
      setAnalyzeFetchingPreview(true)
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return
        const res = await thumbnailsApi.fetchExistingThumbnail(token, url)
        setAnalyzePreviewUrl(res?.thumbnail_url || null)
      } catch {
        setAnalyzePreviewUrl(null)
      } finally {
        setAnalyzeFetchingPreview(false)
      }
    }, 350)
    return () => {
      if (analyzeFetchRef.current) clearTimeout(analyzeFetchRef.current)
    }
  }, [analyzeSourceMode, analyzeUrlInput])

  useEffect(() => {
    if (editSourceMode !== 'url') {
      setEditPreviewUrl(editDataUrl || null)
      setEditFetchingPreview(false)
      return
    }
    const url = editUrlInput.trim()
    if (!url) {
      setEditPreviewUrl(null)
      return
    }
    if (editFetchRef.current) clearTimeout(editFetchRef.current)
    editFetchRef.current = setTimeout(async () => {
      setEditFetchingPreview(true)
      try {
        const token = await getAccessTokenOrNull()
        if (extractYoutubeUrl(url)) {
          if (!token) return
          const res = await thumbnailsApi.fetchExistingThumbnail(token, extractYoutubeUrl(url))
          setEditPreviewUrl(res?.thumbnail_url || null)
        } else {
          setEditPreviewUrl(/^https?:\/\//i.test(url) ? url : null)
        }
      } catch {
        setEditPreviewUrl(null)
      } finally {
        setEditFetchingPreview(false)
      }
    }, 300)
    return () => {
      if (editFetchRef.current) clearTimeout(editFetchRef.current)
    }
  }, [editSourceMode, editUrlInput, editDataUrl])

  const pushLocalAssistantMessage = useCallback((userContent, assistant) => {
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: userContent },
      {
        id: assistant.id ?? `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistant.content || '',
        thumbnails: assistant.thumbnails || [],
        imageUrl: assistant.imageUrl || null,
        userRequest: assistant.userRequest || userContent,
      },
    ])
  }, [])

  const runWholeImageEdit = useCallback(async ({ imageUrl, prompt }) => {
    const token = await getAccessTokenOrNull()
    if (!token) throw new Error('Not authenticated')
    const base64 = extractBase64FromDataUrl(imageUrl)
    const payload = {
      mask_base64: await createFullMaskBase64(imageUrl),
      edit_prompt: prompt,
      ...(base64 ? { thumbnail_image_base64: base64 } : { thumbnail_image_url: imageUrl }),
    }
    const res = await thumbnailsApi.editRegion(token, payload)
    if (!res?.image_url) throw new Error('No edited image returned')
    return res.image_url
  }, [])

  const handlePromptImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setPromptImageDataUrl(await readFileAsDataUrl(file))
    e.target.value = ''
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    const combined = draft.trim()
    if (!combined || pendingAssistant) return
    if (!promptImageDataUrl && combined.length < 5) {
      return
    }

    setSendError('')
    setPendingUserMessage(combined)
    setPendingAssistant(true)
    setDraft('')

    try {
      if (promptImageDataUrl) {
        const imageUrl = await runWholeImageEdit({
          imageUrl: promptImageDataUrl,
          prompt: `${combined} ${buildSelectionHint(selectedPersona, selectedStyle)}`.trim(),
        })
        pushLocalAssistantMessage(combined, {
          content: 'Created a thumbnail variation from your uploaded reference.',
          imageUrl,
        })
        setPromptImageDataUrl(null)
      } else {
        const result = await chatMutation.mutateAsync({
          message: combined,
          conversation_id: conversationId || undefined,
          num_thumbnails: numThumbnails,
          persona_id: selectedPersonaId || undefined,
          style_id: selectedStyleId || undefined,
          channel_id: channelId || undefined,
        })
        const thumbs = result?.thumbnails || []
        pushLocalAssistantMessage(combined, {
          id: result?.message_id,
          content:
            result?.content ||
            (thumbs.length > 0
              ? `Here are ${thumbs.length} thumbnail${thumbs.length !== 1 ? 's' : ''}.`
              : 'Could not generate thumbnails.'),
          thumbnails: thumbs,
          userRequest: combined,
        })
      }
    } catch (err) {
      setSendError(err?.message || 'Could not generate thumbnails.')
      setDraft(combined)
    } finally {
      setPendingUserMessage(null)
      setPendingAssistant(false)
    }
  }

  const handleCopyMessage = async (msg) => {
    try {
      let text = msg.content || ''
      if (msg.thumbnails?.length) {
        text +=
          '\n\n' +
          msg.thumbnails.map((t) => `${t.title}: ${t.image_url?.slice(0, 80)}...`).join('\n\n')
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

  const handleRecreateFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setRecreateSourceImage(await readFileAsDataUrl(file))
    setRecreatePreviewUrl(null)
    e.target.value = ''
  }

  const handleRecreateSubmit = async (e) => {
    e?.preventDefault?.()
    if (pendingAssistant) return
    const instructions = recreateDraft.trim()
    const sourceImageUrl =
      recreateSourceMode === 'upload' ? recreateSourceImage : recreatePreviewUrl
    if (!sourceImageUrl) {
      setSendError('Add the thumbnail to recreate first, then describe what should change.')
      return
    }
    if (!instructions && !selectedPersonaId && !selectedStyleId) {
      setSendError('Add what should change, or pick a persona or style.')
      return
    }
    const selectionHint = buildSelectionHint(selectedPersona, selectedStyle)
    const userText = `Recreate this thumbnail. ${instructions}`.trim()
    setSendError('')
    setPendingUserMessage(userText)
    setPendingAssistant(true)
    try {
      const imageUrl = await runWholeImageEdit({
        imageUrl: sourceImageUrl,
        prompt: [`Recreate this thumbnail for YouTube.`, instructions, selectionHint]
          .filter(Boolean)
          .join(' '),
      })
      pushLocalAssistantMessage(userText, {
        content: 'Here is the recreated thumbnail.',
        imageUrl,
      })
      setRecreateDraft('')
      setRecreateSourceImage(null)
      setRecreateUrlInput('')
      setRecreatePreviewUrl(null)
    } catch (err) {
      setSendError(err?.message || 'Could not recreate thumbnail.')
    } finally {
      setPendingUserMessage(null)
      setPendingAssistant(false)
    }
  }

  const handleAnalyzeFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setAnalyzeSourceImage(await readFileAsDataUrl(file))
    setAnalyzePreviewUrl(null)
    e.target.value = ''
  }

  const handleEditFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setEditDataUrl(await readFileAsDataUrl(file))
    setEditPreviewUrl(null)
    setEditUrlInput('')
    setEditFooterError('')
    e.target.value = ''
  }

  const handleEditSubmit = (e) => {
    e.preventDefault()
    setEditFooterError('')
    if (editSourceMode === 'upload' && editDataUrl) {
      setEditDialogUrl(editDataUrl)
      setShowEditDialog(true)
      return
    }
    if (editSourceMode === 'url' && editPreviewUrl) {
      setEditDialogUrl(editPreviewUrl)
      setShowEditDialog(true)
      return
    }
    setEditFooterError('Upload an image, or paste a YouTube/direct image link.')
  }

  const handleOpenEditFromFooter = () => {
    setEditFooterError('')
    if (editSourceMode === 'upload' && editDataUrl) {
      setEditDialogUrl(editDataUrl)
      setShowEditDialog(true)
      return
    }
    if (editSourceMode === 'url' && editPreviewUrl) {
      setEditDialogUrl(editPreviewUrl)
      setShowEditDialog(true)
      return
    }
    setEditFooterError('Upload an image, or paste a YouTube/direct image link.')
  }

  const handleAnalyzeFooterSubmit = async (e) => {
    e?.preventDefault?.()
    if (pendingAssistant) return
    const imageUrl = analyzeSourceMode === 'upload' ? analyzeSourceImage : analyzePreviewUrl
    if (!imageUrl) {
      setSendError('Add an image or YouTube link to analyze.')
      return
    }
    const userText = `Analyze this thumbnail${analyzeTitle.trim() ? ` for "${analyzeTitle.trim()}"` : ''}.`
    setSendError('')
    setPendingUserMessage(userText)
    setPendingAssistant(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const base64 = extractBase64FromDataUrl(imageUrl)
      const rating = await thumbnailsApi.rate(token, {
        ...(base64 ? { thumbnail_image_base64: base64 } : { thumbnail_image_url: imageUrl }),
        video_title: analyzeTitle.trim() || undefined,
      })
      pushLocalAssistantMessage(userText, {
        content: buildAnalyzeSummary(rating, analyzeTitle.trim()),
        imageUrl,
      })
      setAnalyzeTitle('')
      setAnalyzeSourceImage(null)
      setAnalyzeUrlInput('')
      setAnalyzePreviewUrl(null)
    } catch (err) {
      setSendError(err?.message || 'Could not analyze thumbnail.')
    } finally {
      setPendingAssistant(false)
      setPendingUserMessage(null)
    }
  }

  return (
    <div
      id="coach-panel-thumbnails"
      className={`coach-main ${layoutCentered ? 'coach-main--empty' : ''}`}
      role="tabpanel"
      aria-labelledby="coach-tab-thumbnails"
    >
      <section className={`coach-chat-shell ${layoutCentered ? 'coach-chat-shell--empty' : ''}`}>
        <div
          ref={threadRef}
          className={`coach-thread ${layoutCentered ? 'coach-thread--empty' : ''} coach-thread--thumb-panel ${isHistoryLoading ? 'coach-thread--history-loading' : ''}`}
        >
          {isHistoryLoading && (
            <ChatHistoryLoading
              kicker="Thumbnail Generator"
              label="Loading your thumbnail chat…"
              subtitle="Fetching generations and references."
            />
          )}

          {isEmptyScreen && (
            <div className="coach-empty-state">
              <span className="coach-empty-state-kicker">Thumbnail Generator</span>
              <h1>What thumbnail do you need?</h1>
            </div>
          )}

          {!isHistoryLoading &&
            messages.map((msg) => (
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
                    {msg.content ? <p>{msg.content}</p> : null}
                    {msg.imageUrl ? (
                      <ThumbnailImageBlock
                        imageUrl={msg.imageUrl}
                        onViewImage={openThumbLightbox}
                      />
                    ) : null}
                    {msg.thumbnails?.length > 0 && (
                      <ThumbnailGridBlock
                        thumbnails={msg.thumbnails}
                        userRequest={msg.userRequest}
                        msgId={msg.id}
                        onReplaceThumbnail={handleReplaceThumbnail}
                        onRegenerate={handleRegenerateOne}
                        onViewImage={openThumbLightbox}
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
                <div
                  className="script-loading-steps"
                  role="status"
                  aria-live="polite"
                  aria-label="Generating thumbnails"
                >
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
                            {done ? (
                              <IconCheck />
                            ) : active ? (
                              <span className="script-loading-step-dot" />
                            ) : (
                              <span className="script-loading-step-pending" />
                            )}
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
        </div>

        <footer
          className={`coach-composer-wrap ${layoutCentered ? 'coach-composer-wrap--empty' : ''} coach-composer-wrap--thumb-tools`}
        >
          <div className="thumb-gen-footer-chrome">
            <div className="thumb-gen-subtabbar-wrap">
              <TabBar
                tabs={THUMB_GEN_SUB_TABS}
                value={thumbMode}
                onChange={handleThumbModeTab}
                ariaLabel="Thumbnail modes"
                variant="segmented"
                className="thumb-gen-subtabbar"
              />
            </div>
            {(sendError || (thumbMode === 'edit' && editFooterError)) && (
              <div className="coach-compose-error thumb-gen-footer-error">
                {sendError || editFooterError}
              </div>
            )}
            {thumbMode === 'prompt' && (
              <form
                className="coach-composer script-gen-composer coach-composer--thumb-merged thumb-gen-mode-pane"
                onSubmit={handleSubmit}
              >
                <div className="coach-composer-input-wrap thumb-prompt-input-wrap">
                  {promptImageDataUrl && (
                    <div className="thumb-source-preview-strip">
                      <img
                        src={promptImageDataUrl}
                        alt=""
                        className="thumb-source-preview-strip-img"
                      />
                      <button
                        type="button"
                        className="thumb-source-preview-strip-clear"
                        onClick={() => setPromptImageDataUrl(null)}
                      >
                        Remove image
                      </button>
                    </div>
                  )}
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(String(e.target.value).slice(0, 500))}
                    placeholder="Describe your thumbnail — topic, mood, text on image, colors…"
                    rows={1}
                    className="coach-composer-input thumb-prompt-textarea"
                    maxLength={500}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSubmit(e)
                      }
                    }}
                  />
                </div>
                <div className="coach-composer-actions thumb-gen-toolbar">
                  <div className="thumb-gen-toolbar-tools">
                    <input
                      ref={promptFileInputRef}
                      type="file"
                      accept="image/*"
                      className="coach-file-input"
                      onChange={handlePromptImageChange}
                    />
                    <button
                      type="button"
                      className="coach-composer-tool coach-composer-tool--circle thumb-gen-toolbar-attach"
                      onClick={() => promptFileInputRef.current?.click()}
                      aria-label="Add image"
                      title="Add image"
                    >
                      <IconPaperclip />
                    </button>
                    <PersonaSelector onOpenLibrary={onOpenPersonas} variant="glassCircle" />
                    <StyleSelector onOpenLibrary={onOpenStyles} variant="glassCircle" />
                    <ThumbBatchCirclePicker
                      value={numThumbnails}
                      onChange={setNumThumbnails}
                      disabled={pendingAssistant}
                    />
                  </div>
                  <button
                    type="submit"
                    className="coach-composer-send coach-composer-primary-action is-send"
                    disabled={pendingAssistant || (!draft.trim() && !promptImageDataUrl)}
                    aria-label="Generate thumbnails"
                  >
                    <IconArrowUp />
                  </button>
                </div>
              </form>
            )}
            {thumbMode === 'recreate' && (
              <form
                className="coach-composer script-gen-composer coach-composer--thumb-merged thumb-gen-mode-pane"
                onSubmit={handleRecreateSubmit}
              >
                <div className="thumb-source-block">
                  <div
                    className="thumb-source-mode-tabs"
                    role="tablist"
                    aria-label="Recreate source"
                  >
                    <button
                      type="button"
                      className={`thumb-source-mode-tab ${recreateSourceMode === 'youtube' ? 'is-active' : ''}`}
                      onClick={() => setRecreateSourceMode('youtube')}
                    >
                      YouTube link
                    </button>
                    <button
                      type="button"
                      className={`thumb-source-mode-tab ${recreateSourceMode === 'upload' ? 'is-active' : ''}`}
                      onClick={() => setRecreateSourceMode('upload')}
                    >
                      Upload
                    </button>
                  </div>
                  {recreateSourceMode === 'youtube' ? (
                    <div className="thumb-source-row">
                      <IconYoutubeStrip />
                      <input
                        type="url"
                        className="thumb-source-input"
                        placeholder="https://youtube.com/watch?v=…"
                        value={recreateUrlInput}
                        onChange={(e) => setRecreateUrlInput(e.target.value.slice(0, 280))}
                      />
                      <div
                        className="thumb-source-preview"
                        aria-hidden={!recreateFetchingPreview && !recreatePreviewUrl}
                      >
                        {recreateFetchingPreview ? (
                          <span className="thumb-youtube-preview-skel" />
                        ) : recreatePreviewUrl ? (
                          <img
                            src={recreatePreviewUrl}
                            alt=""
                            className="thumb-youtube-preview-img"
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="thumb-source-row">
                      <input
                        ref={recreateFileInputRef}
                        type="file"
                        accept="image/*"
                        className="coach-file-input"
                        onChange={handleRecreateFileChange}
                      />
                      <button
                        type="button"
                        className="thumb-source-upload-btn"
                        onClick={() => recreateFileInputRef.current?.click()}
                      >
                        Add image
                      </button>
                      {recreateSourceImage ? (
                        <div className="thumb-source-preview">
                          <img
                            src={recreateSourceImage}
                            alt=""
                            className="thumb-youtube-preview-img"
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="coach-composer-input-wrap thumb-prompt-input-wrap">
                  <textarea
                    ref={recreateTextareaRef}
                    value={recreateDraft}
                    onChange={(e) => setRecreateDraft(String(e.target.value).slice(0, 600))}
                    placeholder="What should be recreated or changed?"
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
                <div className="coach-composer-actions thumb-gen-toolbar">
                  <div className="thumb-gen-toolbar-tools">
                    <PersonaSelector onOpenLibrary={onOpenPersonas} variant="glassCircle" />
                    <StyleSelector onOpenLibrary={onOpenStyles} variant="glassCircle" />
                    <ThumbBatchCirclePicker value={1} onChange={() => {}} disabled />
                  </div>
                  <button
                    type="submit"
                    className="coach-composer-send coach-composer-primary-action is-send"
                    disabled={
                      pendingAssistant ||
                      !(recreateSourceMode === 'upload' ? recreateSourceImage : recreatePreviewUrl)
                    }
                    aria-label="Recreate thumbnail"
                  >
                    <IconArrowUp />
                  </button>
                </div>
              </form>
            )}
            {thumbMode === 'analyze' && (
              <form
                className="coach-composer script-gen-composer coach-composer--thumb-merged thumb-gen-mode-pane"
                onSubmit={handleAnalyzeFooterSubmit}
              >
                <div className="thumb-source-block">
                  <div
                    className="thumb-source-mode-tabs"
                    role="tablist"
                    aria-label="Analyze source"
                  >
                    <button
                      type="button"
                      className={`thumb-source-mode-tab ${analyzeSourceMode === 'youtube' ? 'is-active' : ''}`}
                      onClick={() => setAnalyzeSourceMode('youtube')}
                    >
                      YouTube link
                    </button>
                    <button
                      type="button"
                      className={`thumb-source-mode-tab ${analyzeSourceMode === 'upload' ? 'is-active' : ''}`}
                      onClick={() => setAnalyzeSourceMode('upload')}
                    >
                      Upload
                    </button>
                  </div>
                  {analyzeSourceMode === 'youtube' ? (
                    <div className="thumb-source-row">
                      <IconYoutubeStrip />
                      <input
                        type="url"
                        className="thumb-source-input"
                        placeholder="https://youtube.com/watch?v=…"
                        value={analyzeUrlInput}
                        onChange={(e) => setAnalyzeUrlInput(e.target.value.slice(0, 280))}
                      />
                      <div
                        className="thumb-source-preview"
                        aria-hidden={!analyzeFetchingPreview && !analyzePreviewUrl}
                      >
                        {analyzeFetchingPreview ? (
                          <span className="thumb-youtube-preview-skel" />
                        ) : analyzePreviewUrl ? (
                          <img
                            src={analyzePreviewUrl}
                            alt=""
                            className="thumb-youtube-preview-img"
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="thumb-source-row">
                      <input
                        ref={analyzeFileInputRef}
                        type="file"
                        accept="image/*"
                        className="coach-file-input"
                        onChange={handleAnalyzeFileChange}
                      />
                      <button
                        type="button"
                        className="thumb-source-upload-btn"
                        onClick={() => analyzeFileInputRef.current?.click()}
                      >
                        Add image
                      </button>
                      {analyzeSourceImage ? (
                        <div className="thumb-source-preview">
                          <img
                            src={analyzeSourceImage}
                            alt=""
                            className="thumb-youtube-preview-img"
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="coach-composer-input-wrap thumb-prompt-input-wrap">
                  <input
                    type="text"
                    value={analyzeTitle}
                    onChange={(e) => setAnalyzeTitle(e.target.value.slice(0, 200))}
                    placeholder="Video title"
                    className="coach-composer-input thumb-single-line-input"
                    maxLength={200}
                  />
                </div>
                <div className="coach-composer-actions thumb-gen-toolbar">
                  <div className="thumb-gen-toolbar-tools" />
                  <button
                    type="submit"
                    className="coach-composer-send coach-composer-primary-action is-send"
                    disabled={
                      pendingAssistant ||
                      !(analyzeSourceMode === 'upload' ? analyzeSourceImage : analyzePreviewUrl)
                    }
                    aria-label="Go to analysis"
                  >
                    <IconArrowUp />
                  </button>
                </div>
              </form>
            )}
            {thumbMode === 'edit' && (
              <form
                className="coach-composer script-gen-composer coach-composer--thumb-merged thumb-gen-mode-pane"
                onSubmit={handleEditSubmit}
              >
                <div className="thumb-source-block">
                  <div className="thumb-source-mode-tabs" role="tablist" aria-label="Edit source">
                    <button
                      type="button"
                      className={`thumb-source-mode-tab ${editSourceMode === 'url' ? 'is-active' : ''}`}
                      onClick={() => setEditSourceMode('url')}
                    >
                      Link
                    </button>
                    <button
                      type="button"
                      className={`thumb-source-mode-tab ${editSourceMode === 'upload' ? 'is-active' : ''}`}
                      onClick={() => setEditSourceMode('upload')}
                    >
                      Upload
                    </button>
                  </div>
                  {editSourceMode === 'url' ? (
                    <div className="thumb-source-row">
                      <input
                        type="url"
                        value={editUrlInput}
                        onChange={(e) => {
                          setEditUrlInput(e.target.value.slice(0, 800))
                          setEditDataUrl(null)
                          setEditFooterError('')
                        }}
                        placeholder="Paste a YouTube or direct image link"
                        className="thumb-source-input"
                      />
                      <div
                        className="thumb-source-preview"
                        aria-hidden={!editFetchingPreview && !editPreviewUrl}
                      >
                        {editFetchingPreview ? (
                          <span className="thumb-youtube-preview-skel" />
                        ) : editPreviewUrl ? (
                          <img src={editPreviewUrl} alt="" className="thumb-youtube-preview-img" />
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="thumb-source-row">
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        className="coach-file-input"
                        onChange={handleEditFileChange}
                      />
                      <button
                        type="button"
                        className="thumb-source-upload-btn"
                        onClick={() => editFileInputRef.current?.click()}
                      >
                        Add image
                      </button>
                      {editDataUrl ? (
                        <div className="thumb-source-preview">
                          <img src={editDataUrl} alt="" className="thumb-youtube-preview-img" />
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="coach-composer-actions thumb-gen-toolbar">
                  <div className="thumb-gen-toolbar-tools" />
                  <button
                    type="button"
                    className="thumb-edit-open-cta"
                    disabled={editSourceMode === 'upload' ? !editDataUrl : !editPreviewUrl}
                    onClick={handleOpenEditFromFooter}
                  >
                    Open editor
                  </button>
                </div>
              </form>
            )}
          </div>
        </footer>
      </section>
      {showEditDialog && editDialogUrl && (
        <EditThumbnailDialog
          imageUrl={editDialogUrl}
          onClose={() => {
            setShowEditDialog(false)
            setEditDialogUrl(null)
          }}
          onApply={async (newUrl) => {
            pushLocalAssistantMessage('Edit this thumbnail.', {
              content: 'Here is the edited thumbnail.',
              imageUrl: newUrl,
            })
            setShowEditDialog(false)
            setEditDialogUrl(null)
          }}
        />
      )}
      {lightbox ? (
        <ThumbnailLightbox
          url={lightbox.url}
          title={lightbox.title}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  )
}
