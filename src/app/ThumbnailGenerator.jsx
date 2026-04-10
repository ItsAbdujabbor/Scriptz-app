import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
import { Dropdown } from '../components/ui'
import { ChatHistoryLoading } from '../components/ChatHistoryLoading'
import { AnimatedComposerHint } from '../components/AnimatedComposerHint'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import { extractYoutubeUrl } from '../lib/youtubeUrl'
import { renderMessageContent } from '../lib/messageRender.jsx'
import { useThreadScrollToBottom } from '../lib/useThreadScrollToBottom'
import './ScriptGenerator.css'
import './ThumbnailGenerator.css'

const THUMB_COMPOSER_HINTS = [
  'What thumbnail do you need?',
  'Describe the mood, colors, and text on image…',
  'Paste a YouTube link to recreate the style…',
  'Want a high-contrast face + bold text overlay?',
  'Need a recreation of a viral style?',
  'Tell me the topic and the vibe you want…',
]

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

function IconChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function IconEmptyGenerate() {
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

function IconEmptyRecreate() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function IconEmptyAnalyze() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

const THUMB_QUICK_ACTIONS = [
  {
    id: 'ideas',
    label: 'Generate from title',
    prompt: 'Generate a click-worthy thumbnail concept for my next video.',
    mode: 'prompt',
    Icon: IconEmptyGenerate,
  },
  {
    id: 'hook',
    label: 'Recreate existing',
    prompt: 'Recreate this thumbnail with a fresh design while keeping the subject.',
    mode: 'recreate',
    Icon: IconEmptyRecreate,
  },
  {
    id: 'thumbnail',
    label: 'Analyze competitor',
    prompt: 'Analyze this thumbnail and tell me what works and what to improve.',
    mode: 'analyze',
    Icon: IconEmptyAnalyze,
  },
]

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

const PCT_TARGETS = [22, 68, 95]

const BATCH_COUNT_OPTIONS = [
  { value: '1', label: '1×', hint: 'Single image' },
  { value: '2', label: '2×', hint: '2 variations' },
  { value: '3', label: '3×', hint: '3 variations' },
  { value: '4', label: '4×', hint: '4 variations' },
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

function IconUploadCloud() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  )
}

function ThumbDropZone({
  fileInputRef,
  imageDataUrl,
  onFileChange,
  onRemove,
  label = 'Drop image or click to upload',
}) {
  const [dragging, setDragging] = useState(false)

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }
  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      onFileChange({ target: { files: [file] } })
    }
  }

  return (
    <div
      className={`thumb-drop-zone ${dragging ? 'is-dragging' : ''} ${imageDataUrl ? 'has-image' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !imageDataUrl && fileInputRef.current?.click()}
      role={imageDataUrl ? undefined : 'button'}
      tabIndex={imageDataUrl ? undefined : 0}
      onKeyDown={(e) => !imageDataUrl && e.key === 'Enter' && fileInputRef.current?.click()}
      aria-label={imageDataUrl ? undefined : label}
    >
      {imageDataUrl ? (
        <div className="thumb-drop-zone-file-strip">
          <img src={imageDataUrl} alt="" className="thumb-drop-zone-file-thumb" />
          <span className="thumb-drop-zone-file-info">Image ready</span>
          <button
            type="button"
            className="thumb-drop-zone-clear"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="thumb-drop-zone-empty">
          <span className="thumb-drop-zone-icon">
            <IconUploadCloud />
          </span>
          <span className="thumb-drop-zone-label">{label}</span>
          <span className="thumb-drop-zone-hint">PNG, JPG, WEBP</span>
        </div>
      )}
    </div>
  )
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
  canRegenerate = true,
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
              {canRegenerate && (
                <button
                  type="button"
                  className="thumb-batch-btn"
                  onClick={handleRegenerate}
                  title="Regenerate"
                  aria-label="Regenerate"
                >
                  <IconRefresh />
                </button>
              )}
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
  canRegenerate = true,
}) {
  if (!thumbnails?.length) return null
  return (
    <div className="thumb-msg-grid-wrap coach-stream-block">
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
            canRegenerate={canRegenerate}
          />
        ))}
      </div>
    </div>
  )
}

function ThumbnailImageBlock({ imageUrl, onViewImage }) {
  if (!imageUrl) return null
  return (
    <div className="thumb-msg-img-wrap coach-stream-block" data-thumb-slot={0}>
      <button
        type="button"
        className="thumb-msg-img-btn"
        onClick={() => onViewImage?.(imageUrl, 'Thumbnail')}
        aria-label="View full size"
      >
        <img src={imageUrl} alt="Generated thumbnail" className="thumb-msg-img" />
        <div className="thumb-msg-img-overlay">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </div>
      </button>
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
  return createPortal(
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
    </div>,
    document.body
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
  const [editSourceMode, setEditSourceMode] = useState('url')
  const [editUrlInput, setEditUrlInput] = useState('')
  const [editDataUrl, setEditDataUrl] = useState(null)
  const [editPreviewUrl, setEditPreviewUrl] = useState(null)
  const editFetchingPreviewRef = useRef(false)
  const [promptImageDataUrl, setPromptImageDataUrl] = useState(null)
  const [editDialogUrl, setEditDialogUrl] = useState(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editFooterError, setEditFooterError] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [numThumbnails, setNumThumbnails] = useState(1)
  const [numRecreateThumbnails, setNumRecreateThumbnails] = useState(1)
  const [sendError, setSendError] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState(null)
  const [pendingAssistant, setPendingAssistant] = useState(false)
  const [loadingStepIndex, setLoadingStepIndex] = useState(0)
  const [loadingPct, setLoadingPct] = useState(0)
  const stepIntervalRef = useRef(null)
  const pctIntervalRef = useRef(null)
  const loadingPctRef = useRef(0)
  const finishLoadingRef = useRef(null)
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
  const composerFooterRef = useRef(null)
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
    setRecreateSourceMode('youtube')
    setAnalyzeSourceMode('youtube')
    setEditSourceMode('url')
    setNumRecreateThumbnails(1)
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
  const { showScrollToBottom, scrollToBottom } = useThreadScrollToBottom(threadRef, {
    enabled: !isHistoryLoading,
    deps: [messages.length, pendingUserMessage, pendingAssistant, thumbMode],
  })

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

  // Smooth percentage counter tied to loadingStepIndex
  useEffect(() => {
    if (pctIntervalRef.current) clearInterval(pctIntervalRef.current)
    if (!pendingAssistant) {
      loadingPctRef.current = 0
      setLoadingPct(0)
      return
    }
    const target = PCT_TARGETS[loadingStepIndex] ?? 95
    pctIntervalRef.current = setInterval(() => {
      const cur = loadingPctRef.current
      if (cur < target) {
        const next = Math.min(cur + 1, target)
        loadingPctRef.current = next
        setLoadingPct(next)
      } else {
        clearInterval(pctIntervalRef.current)
      }
    }, 80)
    return () => {
      if (pctIntervalRef.current) clearInterval(pctIntervalRef.current)
    }
  }, [pendingAssistant, loadingStepIndex])

  useEffect(() => {
    const el = composerFooterRef.current
    if (!el) return
    const shell = el.closest('.coach-chat-shell')
    if (!shell) return
    const update = () =>
      shell.style.setProperty('--coach-composer-stack-px', `${el.offsetHeight}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [thumbMode])

  // Call on successful API completion — animates to 100% then clears pending state
  const finishLoading = useCallback(() => {
    if (finishLoadingRef.current) clearTimeout(finishLoadingRef.current)
    if (pctIntervalRef.current) {
      clearInterval(pctIntervalRef.current)
      pctIntervalRef.current = null
    }
    loadingPctRef.current = 100
    setLoadingPct(100)
    finishLoadingRef.current = setTimeout(() => {
      setPendingAssistant(false)
      finishLoadingRef.current = null
    }, 550)
  }, [])

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
      editFetchingPreviewRef.current = false
      return
    }
    const url = editUrlInput.trim()
    if (!url) {
      setEditPreviewUrl(null)
      return
    }
    if (editFetchRef.current) clearTimeout(editFetchRef.current)
    editFetchRef.current = setTimeout(async () => {
      editFetchingPreviewRef.current = true
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
        editFetchingPreviewRef.current = false
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
        isRecreate: assistant.isRecreate || false,
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

  const handleQuickAction = (action) => {
    if (action?.mode && action.mode !== thumbMode) setThumbMode(action.mode)
    if (action?.prompt) setDraft(action.prompt)
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
          content: '',
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
          content: thumbs.length > 0 ? '' : result?.content || 'Could not generate thumbnails.',
          thumbnails: thumbs,
          userRequest: combined,
        })
      }
      finishLoading()
    } catch (err) {
      setSendError(err?.message || 'Could not generate thumbnails.')
      setDraft(combined)
      setPendingAssistant(false)
    } finally {
      setPendingUserMessage(null)
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
          content: thumbnails.length > 0 ? '' : result?.content || 'Regenerated.',
          userRequest,
          thumbnails,
        }
        setMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: 'user', content: userRequest },
          assistantMsg,
        ])
        finishLoading()
      } catch (err) {
        setSendError(err?.message || 'Regeneration failed')
        setPendingAssistant(false)
      } finally {
        setPendingUserMessage(null)
      }
    },
    [
      chatMutation,
      conversationId,
      selectedPersonaId,
      selectedStyleId,
      channelId,
      pendingAssistant,
      finishLoading,
    ]
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
    const userText = instructions
      ? `Recreate this thumbnail — ${instructions}`
      : 'Recreate this thumbnail.'
    const editPrompt = [`Recreate this thumbnail for YouTube.`, instructions, selectionHint]
      .filter(Boolean)
      .join(' ')
    setSendError('')
    setPendingUserMessage(userText)
    setPendingAssistant(true)
    setRecreateDraft('')
    setRecreateSourceImage(null)
    setRecreateUrlInput('')
    setRecreatePreviewUrl(null)
    try {
      const count = numRecreateThumbnails
      if (count === 1) {
        const imageUrl = await runWholeImageEdit({ imageUrl: sourceImageUrl, prompt: editPrompt })
        pushLocalAssistantMessage(userText, { content: '', imageUrl, isRecreate: true })
      } else {
        const urls = await Promise.all(
          Array.from({ length: count }, () =>
            runWholeImageEdit({ imageUrl: sourceImageUrl, prompt: editPrompt })
          )
        )
        const thumbnails = urls.map((url, i) => ({
          image_url: url,
          title: `Variation ${i + 1}`,
        }))
        pushLocalAssistantMessage(userText, {
          content: '',
          thumbnails,
          userRequest: userText,
          isRecreate: true,
        })
      }
      finishLoading()
    } catch (err) {
      setSendError(err?.message || 'Could not recreate thumbnail.')
      setPendingAssistant(false)
    } finally {
      setPendingUserMessage(null)
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
    setAnalyzeTitle('')
    setAnalyzeSourceImage(null)
    setAnalyzeUrlInput('')
    setAnalyzePreviewUrl(null)
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
      finishLoading()
    } catch (err) {
      setSendError(err?.message || 'Could not analyze thumbnail.')
      setPendingAssistant(false)
    } finally {
      setPendingUserMessage(null)
    }
  }

  return (
    <div
      id="coach-panel-thumbnails"
      className="coach-main"
      role="tabpanel"
      aria-labelledby="coach-tab-thumbnails"
    >
      <section className="coach-chat-shell">
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
              <div className="coach-empty-actions" role="group" aria-label="Quick actions">
                {THUMB_QUICK_ACTIONS.map((action) => {
                  const Icon = action.Icon
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={`coach-empty-action coach-empty-action--${action.id}`}
                      onClick={() => handleQuickAction(action)}
                    >
                      <span className="coach-empty-action-icon-wrap" aria-hidden>
                        {Icon ? <Icon /> : null}
                      </span>
                      <span className="coach-empty-action-label">{action.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!isHistoryLoading &&
            messages.map((msg) => (
              <article
                key={msg.id}
                className={`coach-message coach-message--enter ${msg.role === 'user' ? 'coach-message--user' : 'coach-message--assistant'}`}
              >
                {msg.role === 'user' ? (
                  <div className="coach-user-message-stack">
                    <div className="coach-message-bubble">
                      <p>{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {msg.content ? (
                      <div className="coach-message-bubble">
                        {renderMessageContent(msg.content, `thumb-msg-${msg.id}`)}
                      </div>
                    ) : null}
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
                        canRegenerate={!msg.isRecreate}
                      />
                    )}
                  </>
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
            <article className="coach-message coach-message--user coach-message--enter">
              <div className="coach-user-message-stack">
                <div className="coach-message-bubble">
                  <p>{pendingUserMessage}</p>
                </div>
              </div>
            </article>
          )}

          {pendingAssistant && (
            <article className="coach-message coach-message--assistant coach-message--enter">
              <div
                className="thumb-gen-skeleton-card"
                role="status"
                aria-live="polite"
                aria-label="Generating thumbnails"
              >
                <div className="thumb-gen-skeleton-blob" aria-hidden />
                <div className="thumb-gen-skeleton-shimmer" aria-hidden />
                <div
                  className="thumb-gen-skeleton-fill"
                  style={{ width: `${loadingPct}%` }}
                  aria-hidden
                />
                <div className="thumb-gen-skeleton-content">
                  <div className="thumb-gen-skeleton-pct">{loadingPct}%</div>
                  <div className="thumb-gen-skeleton-label">
                    {THUMBNAIL_LOADING_STEPS[loadingStepIndex]?.label}
                  </div>
                </div>
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </div>

        <footer
          ref={composerFooterRef}
          className="coach-composer-wrap coach-composer-wrap--thumb-tools"
        >
          {/* Scroll-to-bottom — same pattern as ScriptGenerator */}
          <div
            className={`coach-scroll-to-bottom ${showScrollToBottom && !isEmptyScreen ? 'coach-scroll-to-bottom--visible' : ''}`}
            aria-hidden={!showScrollToBottom || isEmptyScreen}
          >
            <button
              type="button"
              className="coach-scroll-to-bottom-btn"
              onClick={scrollToBottom}
              aria-label="Scroll to bottom"
              title="Scroll to bottom"
            >
              <IconChevronDown />
            </button>
          </div>

          <div className="thumb-gen-footer-chrome">
            {(sendError || (thumbMode === 'edit' && editFooterError)) && (
              <div className="coach-compose-error thumb-gen-footer-error">
                {sendError || editFooterError}
              </div>
            )}

            {/* Single glass composer pill — tabbar at top, mode content below */}
            <div className="coach-composer script-gen-composer thumb-gen-glass-composer">
              <div className="thumb-gen-tab-row">
                <TabBar
                  tabs={THUMB_GEN_SUB_TABS}
                  value={thumbMode}
                  onChange={handleThumbModeTab}
                  ariaLabel="Thumbnail modes"
                  variant="modal"
                  className="chat-subtabbar thumb-gen-subtabbar"
                />
                {thumbMode !== 'prompt' &&
                  (() => {
                    const linkVal = thumbMode === 'edit' ? 'url' : 'youtube'
                    const srcMode =
                      thumbMode === 'recreate'
                        ? recreateSourceMode
                        : thumbMode === 'analyze'
                          ? analyzeSourceMode
                          : editSourceMode
                    const setSrcMode =
                      thumbMode === 'recreate'
                        ? setRecreateSourceMode
                        : thumbMode === 'analyze'
                          ? setAnalyzeSourceMode
                          : setEditSourceMode
                    return (
                      <div
                        className="thumb-source-mode-tabs"
                        role="tablist"
                        aria-label="Source type"
                      >
                        <button
                          type="button"
                          className={`thumb-source-mode-tab ${srcMode === linkVal ? 'is-active' : ''}`}
                          onClick={() => setSrcMode(linkVal)}
                        >
                          Link
                        </button>
                        <button
                          type="button"
                          className={`thumb-source-mode-tab ${srcMode === 'upload' ? 'is-active' : ''}`}
                          onClick={() => setSrcMode('upload')}
                        >
                          Upload
                        </button>
                      </div>
                    )
                  })()}
              </div>

              {thumbMode === 'prompt' && (
                <form onSubmit={handleSubmit} className="thumb-gen-mode-form">
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
                    {!draft && !promptImageDataUrl ? (
                      <AnimatedComposerHint hints={THUMB_COMPOSER_HINTS} />
                    ) : null}
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
                      <Dropdown
                        label="Batch"
                        value={String(numThumbnails)}
                        onChange={(v) => setNumThumbnails(Number(v))}
                        options={BATCH_COUNT_OPTIONS}
                        disabled={pendingAssistant}
                        size="sm"
                        align="end"
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
                <form onSubmit={handleRecreateSubmit} className="thumb-gen-mode-form">
                  <div className="thumb-source-inline-row">
                    {recreateSourceMode === 'youtube' ? (
                      <div className="thumb-source-url-row">
                        <input
                          type="url"
                          className="thumb-source-input"
                          placeholder="Paste a YouTube or image link…"
                          value={recreateUrlInput}
                          onChange={(e) => setRecreateUrlInput(e.target.value.slice(0, 280))}
                        />
                        {(recreateFetchingPreview || recreatePreviewUrl) && (
                          <div className="thumb-source-url-preview">
                            {recreateFetchingPreview ? (
                              <div
                                className="thumb-source-url-preview-loading"
                                aria-label="Loading preview"
                              />
                            ) : (
                              <img
                                src={recreatePreviewUrl}
                                alt="Source thumbnail preview"
                                className="thumb-source-url-preview-img"
                                onClick={() =>
                                  openThumbLightbox(recreatePreviewUrl, 'Source thumbnail')
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <input
                          ref={recreateFileInputRef}
                          type="file"
                          accept="image/*"
                          className="coach-file-input"
                          onChange={handleRecreateFileChange}
                        />
                        <ThumbDropZone
                          fileInputRef={recreateFileInputRef}
                          imageDataUrl={recreateSourceImage}
                          onFileChange={handleRecreateFileChange}
                          onRemove={() => setRecreateSourceImage(null)}
                          label="Drop image or click to upload"
                        />
                      </>
                    )}
                  </div>
                  <div className="coach-composer-input-wrap thumb-prompt-input-wrap">
                    <textarea
                      ref={recreateTextareaRef}
                      value={recreateDraft}
                      onChange={(e) => setRecreateDraft(String(e.target.value).slice(0, 600))}
                      placeholder="Describe what should change (optional)…"
                      rows={1}
                      className="coach-composer-input thumb-visible-placeholder"
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
                      <Dropdown
                        label="Batch"
                        value={String(numRecreateThumbnails)}
                        onChange={(v) => setNumRecreateThumbnails(Number(v))}
                        options={BATCH_COUNT_OPTIONS}
                        disabled={pendingAssistant}
                        size="sm"
                        align="end"
                      />
                    </div>
                    <button
                      type="submit"
                      className="coach-composer-send coach-composer-primary-action is-send"
                      disabled={
                        pendingAssistant ||
                        !(recreateSourceMode === 'upload'
                          ? recreateSourceImage
                          : recreatePreviewUrl)
                      }
                      aria-label="Recreate thumbnail"
                    >
                      <IconArrowUp />
                    </button>
                  </div>
                </form>
              )}

              {thumbMode === 'analyze' && (
                <form onSubmit={handleAnalyzeFooterSubmit} className="thumb-gen-mode-form">
                  <div className="thumb-source-inline-row">
                    {analyzeSourceMode === 'youtube' ? (
                      <div className="thumb-source-url-row">
                        <input
                          type="url"
                          className="thumb-source-input"
                          placeholder="Paste a YouTube or image link…"
                          value={analyzeUrlInput}
                          onChange={(e) => setAnalyzeUrlInput(e.target.value.slice(0, 280))}
                        />
                        {(analyzeFetchingPreview || analyzePreviewUrl) && (
                          <div className="thumb-source-url-preview">
                            {analyzeFetchingPreview ? (
                              <div
                                className="thumb-source-url-preview-loading"
                                aria-label="Loading preview"
                              />
                            ) : (
                              <img
                                src={analyzePreviewUrl}
                                alt="Source thumbnail preview"
                                className="thumb-source-url-preview-img"
                                onClick={() =>
                                  openThumbLightbox(analyzePreviewUrl, 'Source thumbnail')
                                }
                              />
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <input
                          ref={analyzeFileInputRef}
                          type="file"
                          accept="image/*"
                          className="coach-file-input"
                          onChange={handleAnalyzeFileChange}
                        />
                        <ThumbDropZone
                          fileInputRef={analyzeFileInputRef}
                          imageDataUrl={analyzeSourceImage}
                          onFileChange={handleAnalyzeFileChange}
                          onRemove={() => setAnalyzeSourceImage(null)}
                          label="Drop image or click to upload"
                        />
                      </>
                    )}
                  </div>
                  <div className="coach-composer-input-wrap thumb-prompt-input-wrap">
                    <input
                      type="text"
                      value={analyzeTitle}
                      onChange={(e) => setAnalyzeTitle(e.target.value.slice(0, 200))}
                      placeholder="Video title (optional)…"
                      className="coach-composer-input thumb-single-line-input thumb-visible-placeholder"
                      maxLength={200}
                    />
                  </div>
                  <div className="thumb-gen-analyze-submit-row">
                    <button
                      type="submit"
                      className="thumb-gen-analyze-btn"
                      disabled={
                        pendingAssistant ||
                        !(analyzeSourceMode === 'upload' ? analyzeSourceImage : analyzePreviewUrl)
                      }
                      aria-label="Analyze thumbnail"
                    >
                      Analyze
                    </button>
                  </div>
                </form>
              )}

              {thumbMode === 'edit' && (
                <form onSubmit={handleEditSubmit} className="thumb-gen-mode-form">
                  <div className="thumb-source-inline-row">
                    {editSourceMode === 'url' ? (
                      <input
                        type="url"
                        value={editUrlInput}
                        onChange={(e) => {
                          setEditUrlInput(e.target.value.slice(0, 800))
                          setEditDataUrl(null)
                          setEditFooterError('')
                        }}
                        placeholder="Paste an image link…"
                        className="thumb-source-input"
                      />
                    ) : (
                      <>
                        <input
                          ref={editFileInputRef}
                          type="file"
                          accept="image/*"
                          className="coach-file-input"
                          onChange={handleEditFileChange}
                        />
                        <ThumbDropZone
                          fileInputRef={editFileInputRef}
                          imageDataUrl={editDataUrl}
                          onFileChange={handleEditFileChange}
                          onRemove={() => {
                            setEditDataUrl(null)
                            setEditPreviewUrl(null)
                          }}
                          label="Drop image or click to upload"
                        />
                      </>
                    )}
                  </div>
                  <div className="thumb-edit-open-wrap">
                    <button
                      type="button"
                      className="thumb-edit-open-cta"
                      disabled={editSourceMode === 'upload' ? !editDataUrl : !editPreviewUrl}
                      onClick={handleOpenEditFromFooter}
                    >
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
                      Open editor
                    </button>
                  </div>
                </form>
              )}
            </div>
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
            setEditDataUrl(null)
            setEditUrlInput('')
            setEditPreviewUrl(null)
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
