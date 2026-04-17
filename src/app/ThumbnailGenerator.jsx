import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
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
  useCreateThumbnailConversationMutation,
  useThumbnailRatingQuery,
} from '../queries/thumbnails/thumbnailQueries'
import { useThumbnailChatActivityStore } from '../stores/thumbnailChatActivityStore'
import { EditThumbnailDialog } from '../components/EditThumbnailDialog'
import { TabBar } from '../components/TabBar'
import { Dropdown, SegmentedTabs, Skeleton, SkeletonGroup, InlineSpinner } from '../components/ui'
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import { ChatHistoryLoading } from '../components/ChatHistoryLoading'
import { AnimatedComposerHint } from '../components/AnimatedComposerHint'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import { useFloatingPosition } from '../lib/useFloatingPosition'
import { extractYoutubeUrl } from '../lib/youtubeUrl'
import { renderMessageContent } from '../lib/messageRender.jsx'
import { useThreadScrollToBottom } from '../lib/useThreadScrollToBottom'
import { CostHint } from '../components/CostHint'
import { useCostOf } from '../queries/billing/creditsQueries'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import {
  useModelTierStateQuery,
  useSetModelTierMutation,
} from '../queries/modelTier/modelTierQueries'
// import './ScriptGenerator.css' // next update — ScriptGenerator moved to src/next-update-ideas
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

function IconZapFilled() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
    </svg>
  )
}

/**
 * Pill-shaped submit button that embeds the credit cost (zap + number)
 * inside the button itself, followed by the send arrow.
 *
 * Visual twin of the "+ Create" button on the A/B Testing screen —
 * same height, radius, gradient, and spring press.
 *
 * Unsubscribed users see only the arrow (no credits chip).
 */
function ThumbSendPill({
  featureKey = null,
  count = 1,
  disabled = false,
  ariaLabel,
  icon,
  label,
  type = 'submit',
  ...buttonProps
}) {
  const { total } = useCostOf(featureKey || 'thumbnail_generate', count)
  const { isSubscribed } = usePlanEntitlements()
  const showCost = Boolean(featureKey) && isSubscribed && total > 0
  return (
    <button
      type={type}
      {...buttonProps}
      className={[
        'thumb-send-pill',
        label ? 'thumb-send-pill--with-label' : null,
        buttonProps.className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {showCost && (
        <span className="thumb-send-pill-cost" aria-hidden="true">
          <span className="thumb-send-pill-zap">
            <IconZapFilled />
          </span>
          <span className="thumb-send-pill-num">{total}</span>
        </span>
      )}
      {label ? <span className="thumb-send-pill-label">{label}</span> : null}
      <span className="thumb-send-pill-icon">{icon ?? <IconArrowUp />}</span>
    </button>
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
  if (routePart !== 'thumbnails') return 'prompt'
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
  const path = qs ? `thumbnails?${qs}` : 'thumbnails'
  const nextHash = `#${path}`
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash
  }
}

// iOS-style cubic-bezier for layout/size transitions and screen fade-ins.
// (0.32, 0.72, 0, 1) is the standard approximation Apple uses across iOS.
const IOS_EASE = [0.32, 0.72, 0, 1]
const IOS_RESIZE_TRANSITION = { duration: 0.42, ease: IOS_EASE }

/**
 * SmoothHeight — wraps children in a container that animates its height
 * with a measured value. Unlike framer-motion's `layout="size"` (which
 * scales via transform and looks "snappy" on small height deltas), this
 * animates the actual CSS height so the resize feels equally smooth
 * whether the delta is 20px or 200px (Link↔Upload vs mode swaps).
 *
 * The inner content sits in a measured wrapper; a ResizeObserver tracks
 * its scrollHeight and feeds the value to a framer-motion `animate`.
 * Re-measuring to the same value is a no-op so the wrapper does not
 * animate on idle re-renders.
 */
function SmoothHeight({ children, className = '' }) {
  const innerRef = useRef(null)
  const [height, setHeight] = useState('auto')

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    setHeight(el.scrollHeight)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const h = el.scrollHeight
      setHeight((prev) => (prev === h ? prev : h))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <motion.div
      className={className}
      animate={{ height }}
      transition={IOS_RESIZE_TRANSITION}
      style={{ overflow: 'hidden' }}
    >
      <div ref={innerRef}>{children}</div>
    </motion.div>
  )
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
  const triggerRef = useRef(null)
  const { popoverRef, style: popoverStyle } = useFloatingPosition({
    triggerRef,
    open,
    placement: 'top-center',
    offset: 10,
  })

  useEffect(() => {
    const onDoc = (e) => {
      // Popover is portaled to <body>, so the trigger wrapper `ref` doesn't
      // contain it. Treat clicks inside either the trigger or the popover
      // as "inside" so they don't dismiss.
      const inTrigger = ref.current?.contains(e.target)
      const inPopover = popoverRef.current?.contains(e.target)
      if (!inTrigger && !inPopover) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', onDoc)
      return () => document.removeEventListener('click', onDoc)
    }
  }, [open, popoverRef])

  return (
    <div ref={ref} className={`thumb-batch-circle-picker ${disabled ? 'is-disabled' : ''}`}>
      <button
        ref={triggerRef}
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
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={popoverRef}
            className="thumb-batch-circle-popover thumb-batch-circle-popover--floating"
            role="listbox"
            aria-label="Concept count"
            style={popoverStyle}
          >
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
          </div>,
          document.body
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

function getScoreTier(score) {
  if (score == null) return null
  const n = Number(score)
  if (n >= 85) return 'high'
  if (n >= 60) return 'medium'
  return 'low'
}

/**
 * Small tier-appropriate icon shown left of the score number. Uses a clean
 * stroke-style svg (matches the rest of the app's lucide-like iconography).
 *   high   → upward trend arrow
 *   medium → horizontal dash
 *   low    → downward trend arrow
 */
function ScoreTierIcon({ tier }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  if (tier === 'high') {
    return (
      <svg {...common}>
        <polyline points="3 17 10 10 14 14 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </svg>
    )
  }
  if (tier === 'low') {
    return (
      <svg {...common}>
        <polyline points="3 7 10 14 14 10 21 17" />
        <polyline points="14 17 21 17 21 10" />
      </svg>
    )
  }
  // medium / default
  return (
    <svg {...common}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function ThumbnailBatchCard({ t, index, label, onViewImage, onEditImage }) {
  // Rating is cached per-image in React Query (staleTime: Infinity) — a
  // thumbnail is scored exactly once per session no matter how many times
  // the card mounts or the user navigates away and back. Re-rating is
  // opt-in via `refetch()` from the error-state retry button.
  const ratingQuery = useThumbnailRatingQuery(t?.image_url)
  const score =
    ratingQuery.data?.overall_score != null ? Math.round(ratingQuery.data.overall_score) : null
  const loadingScore = ratingQuery.isPending && !!t?.image_url
  const scoreError = ratingQuery.isError ? ratingQuery.error?.message || 'Score failed' : null
  const retryScore = useCallback(() => {
    ratingQuery.refetch()
  }, [ratingQuery])

  const scoreTier = scoreError
    ? 'error'
    : loadingScore
      ? 'loading'
      : score != null
        ? getScoreTier(score)
        : null

  return (
    <div className="thumb-batch-card" data-thumb-slot={index}>
      {/* Ambient starfield + soft glow — decorative, pointer-events none */}
      <div className="thumb-batch-card-bg" aria-hidden="true" />

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

          {/* Score pill — glass, glowing, tier-tinted. Sits over the image. */}
          {scoreTier && (
            <div
              className={`thumb-score-pill thumb-score-pill--${scoreTier}`}
              title={
                scoreError ||
                'AI quality score (CTR potential, visual clarity, contrast, emotional impact)'
              }
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <span className="thumb-score-pill__glow" aria-hidden="true" />
              {scoreError ? (
                <span
                  className="thumb-score-pill__retry"
                  onClick={retryScore}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && retryScore()}
                  aria-label="Retry score"
                >
                  ⟳
                </span>
              ) : loadingScore ? (
                <>
                  <InlineSpinner size={10} />
                  <span className="thumb-score-pill__label">Scoring</span>
                </>
              ) : (
                <>
                  <span className="thumb-score-pill__icon" aria-hidden="true">
                    <ScoreTierIcon tier={scoreTier} />
                  </span>
                  <span className="thumb-score-pill__num">{score}</span>
                </>
              )}
            </div>
          )}

          {/* One-click open in the AI region editor. Floats on the
           *  bottom-right of the image; click passes the rendered
           *  thumbnail URL up so the parent can mount the editor dialog
           *  pre-loaded with this image. */}
          {t?.image_url && onEditImage ? (
            <button
              type="button"
              className="thumb-edit-btn"
              onClick={(e) => {
                e.stopPropagation()
                onEditImage(t.image_url)
              }}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="Open in editor"
              title="Open in editor"
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
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
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
  onEditImage,
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
            onEditImage={onEditImage}
            canRegenerate={canRegenerate}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Single-image render (recreate / analyze / edit modes).
 *
 * Routes through the same ThumbnailBatchCard the grid uses so every mode
 * shows an identical card: liquid-glass container, starfield backdrop,
 * glowing score pill, and the full action row (Download / One-Click Fix
 * / Edit / Regenerate). No forked layout.
 */
function ThumbnailImageBlock({
  imageUrl,
  userRequest,
  msgId,
  onReplaceThumbnail,
  onRegenerate,
  onViewImage,
  onEditImage,
  canRegenerate = true,
}) {
  if (!imageUrl) return null
  const t = { image_url: imageUrl }
  return (
    <div className="thumb-msg-grid-wrap coach-stream-block">
      <div className="thumb-batch-grid">
        <ThumbnailBatchCard
          t={t}
          index={0}
          label="Thumbnail"
          userRequest={userRequest}
          msgId={msgId}
          onReplaceThumbnail={onReplaceThumbnail}
          onRegenerate={onRegenerate}
          onViewImage={onViewImage}
          onEditImage={onEditImage}
          canRegenerate={canRegenerate}
        />
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

function ThumbnailLightbox({ url, onClose }) {
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
        <img src={url} alt="" className="thumb-gen-lightbox-img" />
        <button
          type="button"
          className="thumb-gen-lightbox-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m18 6-12 12" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  )
}

const TIER_LABELS = { 'SRX-1': 'Lite', 'SRX-2': 'Pro', 'SRX-3': 'Ultra' }
const TIER_COLORS = {
  'SRX-1': {
    color: '#a3e635',
    bg: 'rgba(163,230,53,0.13)',
    border: 'rgba(163,230,53,0.25)',
    activeBg: 'rgba(163,230,53,0.2)',
    activeBorder: 'rgba(163,230,53,0.4)',
  },
  'SRX-2': {
    color: '#c4b5fd',
    bg: 'rgba(167,139,250,0.13)',
    border: 'rgba(167,139,250,0.25)',
    activeBg: 'rgba(167,139,250,0.22)',
    activeBorder: 'rgba(196,181,253,0.45)',
  },
  'SRX-3': {
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.13)',
    border: 'rgba(251,191,36,0.25)',
    activeBg: 'rgba(251,191,36,0.2)',
    activeBorder: 'rgba(251,191,36,0.4)',
  },
}

function ThumbModelDropdown({ tierOptions, currentTier, onPickTier, isPending }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const activeLabel = TIER_LABELS[currentTier] || 'Lite'
  const activeColors = TIER_COLORS[currentTier] || TIER_COLORS['SRX-1']

  return (
    <div className="thumb-model-dropdown" ref={wrapRef}>
      <button
        type="button"
        className={`thumb-model-trigger ${open ? 'thumb-model-trigger--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="thumb-model-trigger-code">{currentTier}</span>
        <span
          className="thumb-model-trigger-tag"
          style={{
            background: activeColors.activeBg,
            borderColor: activeColors.activeBorder,
            color: activeColors.color,
          }}
        >
          {activeLabel}
        </span>
        <svg
          className="thumb-model-trigger-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="thumb-model-menu" role="listbox" aria-label="Select AI model">
          <div className="thumb-model-menu-header">AI Model</div>
          {tierOptions.map((t) => {
            const isActive = t.code === currentTier
            const isLocked = !!t.locked
            const label = TIER_LABELS[t.code] || ''
            const colors = TIER_COLORS[t.code] || TIER_COLORS['SRX-1']
            return (
              <button
                key={t.code}
                type="button"
                role="option"
                aria-selected={isActive}
                className={[
                  'thumb-model-option',
                  isActive ? 'thumb-model-option--active' : '',
                  isLocked ? 'thumb-model-option--locked' : '',
                ]
                  .join(' ')
                  .trim()}
                onClick={() => {
                  if (isLocked) {
                    setOpen(false)
                    window.location.hash = 'pro'
                  } else {
                    onPickTier(t.code)
                    setOpen(false)
                  }
                }}
                disabled={isPending}
              >
                <span className="thumb-model-option-left">
                  <span className="thumb-model-option-code">{t.code}</span>
                  <span
                    className="thumb-model-option-tag"
                    style={{
                      background: isActive ? colors.activeBg : colors.bg,
                      borderColor: isActive ? colors.activeBorder : colors.border,
                      color: colors.color,
                    }}
                  >
                    {label}
                  </span>
                </span>
                {isActive && (
                  <svg
                    className="thumb-model-option-check"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                )}
                {isLocked && (
                  <span className="thumb-model-option-upgrade">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Upgrade
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
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
  const { data: tierState } = useModelTierStateQuery()
  const setTierMutation = useSetModelTierMutation()
  const currentTier = tierState?.selected || 'SRX-1'
  const tierOptions =
    tierState?.tiers && tierState.tiers.length
      ? tierState.tiers
      : [
          { code: 'SRX-1', label: 'Lite', locked: false },
          { code: 'SRX-2', label: 'Pro', locked: false },
          { code: 'SRX-3', label: 'Ultra', locked: false },
        ]

  const [lightbox, setLightbox] = useState(null)
  const [copiedMessageId, setCopiedMessageId] = useState(null)
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
  const [pendingUserImageUrl, setPendingUserImageUrl] = useState(null)
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
  const modePaneRef = useRef(null)
  const modePaneFromHeightRef = useRef(null)

  const startPending = useThumbnailChatActivityStore((s) => s.startPending)
  const clearPending = useThumbnailChatActivityStore((s) => s.clearPending)
  const markSeen = useThumbnailChatActivityStore((s) => s.markSeen)
  // Reactive — flips to false the moment `clearPending` is called so the
  // polling `refetchInterval` cleans itself up.
  const isCurrentConversationPending = useThumbnailChatActivityStore((s) =>
    conversationId == null ? false : Boolean(s.pending?.[String(conversationId)])
  )
  const conversationQuery = useThumbnailConversationQuery(conversationId, {
    pollWhilePending: isCurrentConversationPending,
  })
  const chatMutation = useThumbnailChatMutation(onConversationCreated)
  const createConversationMutation = useCreateThumbnailConversationMutation()

  // When the user opens (or returns to) a conversation, stamp "seen now" so
  // the unread dot clears. Fires on every conversationId change — cheap.
  useEffect(() => {
    if (conversationId != null) markSeen(conversationId)
  }, [conversationId, markSeen])

  /**
   * Ensure we have a conversation id before running a chat mutation.
   *
   * Best-effort: if the eager-create endpoint is unreachable (old backend,
   * network blip, etc.) we fall through and let the chat endpoint
   * auto-create one on first submit — the classic path. That way a
   * sidebar enhancement can never block actual generation.
   *
   * On success we:
   *   1. Navigate into the new conversation immediately (URL flip).
   *   2. Show the pending spinner in the sidebar row right away.
   *   3. Let the user leave mid-generation and still see the row update.
   */
  const ensureConversationId = useCallback(
    async (existingId) => {
      if (existingId) return existingId
      try {
        const conv = await createConversationMutation.mutateAsync({
          channel_id: channelId || undefined,
        })
        const id = conv?.id
        if (id != null) {
          onConversationCreated?.(id)
          startPending(id)
        }
        return id
      } catch (err) {
        // Eager create is a "nice to have" — never block generation on it.
        if (typeof console !== 'undefined') {
          console.warn('[thumbnail] eager conversation create failed, using legacy path:', err)
        }
        return null
      }
    },
    [channelId, createConversationMutation, onConversationCreated, startPending]
  )

  useEffect(() => {
    const sync = () => setThumbMode(parseThumbModeFromHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const handleThumbModeTab = useCallback(
    (id) => {
      if (modePaneRef.current) {
        modePaneFromHeightRef.current = modePaneRef.current.offsetHeight
      }
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

  // Animate mode pane height when tab changes
  useLayoutEffect(() => {
    const el = modePaneRef.current
    const from = modePaneFromHeightRef.current
    modePaneFromHeightRef.current = null
    if (!el || from === null || from === undefined) return

    // Reset any in-progress animation first
    el.style.transition = 'none'
    el.style.height = ''
    el.style.overflow = ''
    void el.offsetHeight

    const to = el.scrollHeight
    if (from === to) return

    el.style.overflow = 'hidden'
    el.style.height = `${from}px`
    void el.offsetHeight
    el.style.transition = 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)'

    const rafId = requestAnimationFrame(() => {
      el.style.height = `${to}px`
    })

    const cleanup = () => {
      el.style.height = ''
      el.style.overflow = ''
      el.style.transition = ''
    }
    el.addEventListener('transitionend', cleanup, { once: true })

    return () => {
      cancelAnimationFrame(rafId)
      cleanup()
    }
  }, [thumbMode])

  /** Deep link from dashboard: #thumbnails?prompt=...&prefill=...&focus=battle */
  const thumbDashStableRef = useRef('')
  useEffect(() => {
    const applyFromHash = () => {
      if (conversationId) return
      const hash = (typeof window !== 'undefined' && window.location.hash) || ''
      const normalized = hash.replace(/^#/, '').replace(/^\/+/, '')
      const [routePart, search = ''] = normalized.split('?')
      if (routePart !== 'thumbnails') return
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
      // Full reset when the user clicks "New Chat" or lands on a blank
      // chat screen. Mirrors what CoachChat does on newChat events so the
      // composer is genuinely empty — draft, pending flags, errors, and
      // any stray image attachments all clear together.
      setMessages([])
      setDraft('')
      setSendError('')
      setPendingUserMessage(null)
      setPendingAssistant(false)
      setPendingUserImageUrl(null)
      setPromptImageDataUrl(null)
      setRecreateDraft('')
      setRecreateSourceImage(null)
      setRecreateUrlInput('')
      setRecreatePreviewUrl(null)
      setAnalyzeTitle('')
      setAnalyzeSourceImage(null)
      setAnalyzeUrlInput('')
      setAnalyzePreviewUrl(null)
      setEditDataUrl(null)
      setEditPreviewUrl(null)
      setEditUrlInput('')
      setEditFooterError('')
      return
    }
    if (conversationQuery.data?.messages?.items) {
      const serverMessages = buildMessagesFromApi(conversationQuery.data.messages.items)
      // Poll-safe merge: if the server has fewer messages than we currently
      // show (because we've already pushed optimistic local messages that
      // the backend hasn't persisted yet), keep the local state. Otherwise
      // the server is authoritative.
      setMessages((current) => (serverMessages.length >= current.length ? serverMessages : current))
    } else {
      setMessages([])
    }
  }, [conversationId, conversationQuery.data])

  // Auto-recovery: if we're polling because a generation was in flight AND the
  // server response now contains an assistant message with thumbnails (proof
  // the backend finished and persisted the result), drop the pending flag and
  // the local "generating…" state. This is what lets a user submit, close the
  // tab, come back, and still see the thumbnails with no stuck spinner.
  useEffect(() => {
    if (!isCurrentConversationPending) return
    const items = conversationQuery.data?.messages?.items
    if (!Array.isArray(items) || items.length === 0) return
    const hasAssistantThumbs = items.some((m) => {
      if (m?.role !== 'assistant') return false
      const thumbs = m?.extra_data?.thumbnails
      return Array.isArray(thumbs) && thumbs.length > 0
    })
    if (hasAssistantThumbs) {
      clearPending(conversationId)
      setPendingAssistant(false)
      setPendingUserMessage(null)
      markSeen(conversationId)
    }
  }, [isCurrentConversationPending, conversationQuery.data, conversationId, clearPending, markSeen])

  const isHistoryLoading =
    conversationId != null && (conversationQuery.isPending || conversationQuery.isPlaceholderData)
  const isEmptyScreen =
    !isHistoryLoading && messages.length === 0 && !pendingUserMessage && !pendingAssistant
  const layoutCentered = isEmptyScreen || isHistoryLoading
  const { showScrollToBottom, scrollToBottom } = useThreadScrollToBottom(threadRef, {
    enabled: !isHistoryLoading,
    deps: [messages.length, pendingUserMessage, pendingAssistant, thumbMode],
    // Only surface the button after the user has scrolled up by more than a
    // full viewport — a small scroll doesn't warrant a jump-to-bottom CTA.
    minScrollUp: (el) => el.clientHeight * 1.1,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, pendingUserMessage, pendingAssistant, thumbMode])

  const openThumbLightbox = useCallback((url, title) => {
    if (!url) return
    setLightbox({ url, title: title || 'Thumbnail' })
  }, [])

  // Open the AI region editor pre-loaded with an existing generated
  // thumbnail — invoked from the small pencil button on each card.
  const openEditorForThumbnail = useCallback((url) => {
    if (!url) return
    setEditDialogUrl(url)
    setShowEditDialog(true)
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

  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const prev = el.offsetHeight
    el.style.transition = 'none'
    el.style.overflow = 'hidden'
    el.style.height = '0px'
    const target = Math.max(28, Math.min(el.scrollHeight, 140))
    el.style.height = `${prev}px`
    void el.offsetHeight
    el.style.transition = 'height 0.26s cubic-bezier(0.25, 1, 0.5, 1)'
    requestAnimationFrame(() => {
      el.style.height = `${target}px`
      if (target >= 140) el.style.overflow = ''
    })
  }, [draft])

  useLayoutEffect(() => {
    const el = recreateTextareaRef.current
    if (!el) return
    const prev = el.offsetHeight
    el.style.transition = 'none'
    el.style.overflow = 'hidden'
    el.style.height = '0px'
    const target = Math.max(28, Math.min(el.scrollHeight, 140))
    el.style.height = `${prev}px`
    void el.offsetHeight
    el.style.transition = 'height 0.26s cubic-bezier(0.25, 1, 0.5, 1)'
    requestAnimationFrame(() => {
      el.style.height = `${target}px`
      if (target >= 140) el.style.overflow = ''
    })
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
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userContent,
        imageUrl: assistant.userImageUrl || null,
      },
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

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    const combined = draft.trim()
    if (!combined || pendingAssistant) return
    if (!promptImageDataUrl && combined.length < 5) {
      return
    }

    setSendError('')
    // Push the user's message into `messages` synchronously so it appears the
    // instant they hit send — no waiting for the backend, no waiting for an
    // `ensureConversationId` round-trip. The assistant loader fills the slot
    // below it while the chat mutation runs.
    const optimisticUserId = `user-optimistic-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticUserId,
        role: 'user',
        content: combined,
        imageUrl: promptImageDataUrl || null,
      },
    ])
    setPendingAssistant(true)
    setDraft('')

    // Eagerly create a conversation the first time the user submits in a
    // brand-new chat — gives the sidebar a row + URL immediately so the
    // pending spinner is visible even if they navigate away. Best-effort:
    // if the create call fails we fall through to the legacy path where
    // the chat endpoint auto-creates the conversation.
    const activeConversationId = await ensureConversationId(conversationId)
    if (activeConversationId) startPending(activeConversationId)

    try {
      if (promptImageDataUrl) {
        const imageUrl = await runWholeImageEdit({
          imageUrl: promptImageDataUrl,
          prompt: `${combined} ${buildSelectionHint(selectedPersona, selectedStyle)}`.trim(),
        })
        // Append only the assistant — the user message is already rendered
        // from the optimistic push above.
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: '',
            thumbnails: [],
            imageUrl,
            userRequest: combined,
          },
        ])
        setPromptImageDataUrl(null)
      } else {
        const result = await chatMutation.mutateAsync({
          message: combined,
          conversation_id: activeConversationId || undefined,
          num_thumbnails: numThumbnails,
          persona_id: selectedPersonaId || undefined,
          style_id: selectedStyleId || undefined,
          channel_id: channelId || undefined,
        })
        const thumbs = result?.thumbnails || []
        setMessages((prev) => [
          ...prev,
          {
            id: result?.message_id ?? `assistant-${Date.now()}`,
            role: 'assistant',
            content: thumbs.length > 0 ? '' : result?.content || 'Could not generate thumbnails.',
            thumbnails: thumbs,
            imageUrl: null,
            userRequest: combined,
          },
        ])
      }
      finishLoading()
      // Generation succeeded — if the user is still on this conversation,
      // they've "seen" it. If they left, leave the unread dot alone.
      if (activeConversationId) {
        clearPending(activeConversationId)
        if (Number(conversationId) === Number(activeConversationId)) {
          markSeen(activeConversationId)
        }
      }
    } catch (err) {
      // Prefer the backend's `detail` field (FastAPI error payload) over
      // err.message — it carries the actual reason (OpenAI auth, quota,
      // etc.) instead of just "Request failed".
      const detail = err?.payload?.detail || err?.detail
      const friendly =
        typeof detail === 'string'
          ? detail
          : detail?.message || err?.message || 'Could not generate thumbnails.'
      setSendError(friendly)
      setDraft(combined)
      setPendingAssistant(false)
      // Roll back the optimistic user message so they can retry.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserId))
      if (activeConversationId) clearPending(activeConversationId)
    }
  }

  const handleCopyMessage = (msg) => {
    let text = msg.content || ''
    if (msg.thumbnails?.length) {
      text +=
        '\n\n' +
        msg.thumbnails.map((t) => `${t.title}: ${t.image_url?.slice(0, 80)}...`).join('\n\n')
    }
    if (!text) return
    // Optimistic checkmark — flips instantly, clipboard write is fire-and-forget.
    const id = msg.id
    setCopiedMessageId(id)
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === id ? null : current))
    }, 2000)
    Promise.resolve()
      .then(() => navigator.clipboard?.writeText?.(text))
      .catch(() => {
        setCopiedMessageId((current) => (current === id ? null : current))
      })
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
    const titleTrim = analyzeTitle.trim()
    const userText = `Analyze this thumbnail${titleTrim ? ` for "${titleTrim}"` : ''}.`
    setSendError('')
    setPendingUserMessage(userText)
    setPendingUserImageUrl(imageUrl)
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
        video_title: titleTrim || undefined,
      })
      pushLocalAssistantMessage(userText, {
        content: buildAnalyzeSummary(rating, titleTrim),
        userImageUrl: imageUrl,
      })
      finishLoading()
    } catch (err) {
      setSendError(err?.message || 'Could not analyze thumbnail.')
      setPendingAssistant(false)
    } finally {
      setPendingUserMessage(null)
      setPendingUserImageUrl(null)
    }
  }

  return (
    <div
      id="coach-panel-thumbnails"
      className="coach-main coach-main--thumb"
      role="tabpanel"
      aria-labelledby="coach-tab-thumbnails"
    >
      <motion.section
        className={`coach-chat-shell${isEmptyScreen ? ' coach-chat-shell--thumb-empty' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: IOS_EASE }}
      >
        {/* AI model tier dropdown — always pinned top-left */}
        <ThumbModelDropdown
          tierOptions={tierOptions}
          currentTier={currentTier}
          onPickTier={(code) => setTierMutation.mutate(code)}
          isPending={setTierMutation.isPending}
        />

        <div
          ref={threadRef}
          className={`coach-thread ${layoutCentered ? 'coach-thread--empty' : ''} coach-thread--thumb-panel ${isHistoryLoading ? 'coach-thread--history-loading' : ''}`}
        >
          {isHistoryLoading && <ChatHistoryLoading variant="thumbnail" label="Loading chat" />}

          {!isHistoryLoading && conversationQuery.isError && conversationId != null ? (
            <div className="coach-thread-state coach-thread-error">
              <p className="coach-thread-error__msg">
                Could not load this chat.{' '}
                {conversationQuery.error?.message
                  ? `(${conversationQuery.error.message})`
                  : 'Please try again.'}
              </p>
              <button
                type="button"
                className="coach-thread-error__retry"
                onClick={() => conversationQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}

          {isEmptyScreen && (
            <motion.div
              className="coach-empty-state thumb-empty-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: IOS_EASE, delay: 0.12 }}
            >
              <span className="coach-empty-state-kicker">Thumbnail Generator</span>
              <h1>What thumbnail do you need?</h1>
            </motion.div>
          )}

          {!isHistoryLoading &&
            messages.map((msg) => (
              <article
                key={msg.id}
                className={`coach-message coach-message--enter ${msg.role === 'user' ? 'coach-message--user' : 'coach-message--assistant'}`}
              >
                {msg.role === 'user' ? (
                  <div className="coach-user-message-stack">
                    {msg.imageUrl && (
                      <div className="thumb-user-sent-image">
                        <img
                          src={msg.imageUrl}
                          alt="Sent thumbnail"
                          className="thumb-user-sent-img"
                        />
                      </div>
                    )}
                    <div className="coach-message-bubble">
                      <p>{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {msg.content && !/^Generated\s+\d+\s+thumbnail/i.test(msg.content.trim()) ? (
                      <div className="coach-message-bubble">
                        {renderMessageContent(msg.content, `thumb-msg-${msg.id}`)}
                      </div>
                    ) : null}
                    {msg.imageUrl ? (
                      <ThumbnailImageBlock
                        imageUrl={msg.imageUrl}
                        userRequest={msg.userRequest}
                        msgId={msg.id}
                        onReplaceThumbnail={handleReplaceThumbnail}
                        onRegenerate={handleRegenerateOne}
                        onViewImage={openThumbLightbox}
                        onEditImage={openEditorForThumbnail}
                        canRegenerate
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
                        onEditImage={openEditorForThumbnail}
                        canRegenerate
                      />
                    )}
                  </>
                )}
                {msg.role !== 'assistant' || !msg.thumbnails?.length ? (
                  <div
                    className={`coach-message-actions ${msg.role === 'user' ? 'coach-message-actions--user' : ''}`}
                  >
                    <button
                      type="button"
                      className={`coach-message-action ${copiedMessageId === msg.id ? 'is-copied' : ''}`}
                      onClick={() => handleCopyMessage(msg)}
                      aria-label={copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                      title={copiedMessageId === msg.id ? 'Copied!' : 'Copy'}
                    >
                      {copiedMessageId === msg.id ? <IconCheck /> : <IconCopy />}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}

          {pendingUserMessage && (
            <article className="coach-message coach-message--user coach-message--enter">
              <div className="coach-user-message-stack">
                {pendingUserImageUrl && (
                  <div className="thumb-user-sent-image">
                    <img
                      src={pendingUserImageUrl}
                      alt="Sent thumbnail"
                      className="thumb-user-sent-img"
                    />
                  </div>
                )}
                <div className="coach-message-bubble">
                  <p>{pendingUserMessage}</p>
                </div>
              </div>
            </article>
          )}

          {pendingAssistant && (
            <article className="coach-message coach-message--assistant coach-message--enter">
              <div
                className="thumb-gen-loader"
                role="status"
                aria-live="polite"
                aria-busy="true"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={loadingPct}
                aria-label={`Generating thumbnail, ${loadingPct}% complete`}
              >
                {/* Full 16:9 card that fills with violet progress left → right. */}
                <div
                  className="thumb-gen-loader__stage"
                  style={{ '--thumb-gen-pct': `${loadingPct}%` }}
                >
                  <div className="thumb-gen-loader__fill" aria-hidden="true" />
                  <div className="thumb-gen-loader__shine" aria-hidden="true" />
                  <div className="thumb-gen-loader__grid" aria-hidden="true" />

                  <div className="thumb-gen-loader__center">
                    <div className="thumb-gen-loader__pct">{loadingPct}%</div>
                    <div className="thumb-gen-loader__label">
                      {THUMBNAIL_LOADING_STEPS[loadingStepIndex]?.label ?? 'Working on it…'}
                    </div>
                    <div className="thumb-gen-loader__dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>

                {/* Ghost action row keeps total height stable when the
                 * loader swaps for the real result card. */}
                <div className="thumb-gen-loader__actions" aria-hidden="true">
                  <Skeleton width={72} height={26} radius={999} />
                  <Skeleton width={120} height={26} radius={999} />
                  <Skeleton width={72} height={26} radius={999} />
                  <Skeleton width={72} height={26} radius={999} />
                </div>
              </div>
            </article>
          )}

          <div ref={messagesEndRef} />
        </div>

        <motion.footer
          ref={composerFooterRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.46, ease: IOS_EASE, delay: 0.06 }}
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

            {/* Single glass composer pill — tabbar at top, mode content below.
             * The tabbar row is a plain `<div>` (no layout animation) so the
             * Prompt/Recreate/Analyze/Edit indicator doesn't twitch when the
             * mode-pane below resizes. The form pane itself wraps in a
             * motion.div with `layout="size"` so only its bounding box
             * grows/shrinks when the user toggles Link/Upload — the controls
             * inside swap instantly without morphing. */}
            <div className="coach-composer script-gen-composer thumb-gen-glass-composer">
              <div className="thumb-gen-tab-row">
                <SegmentedTabs
                  value={thumbMode}
                  onChange={handleThumbModeTab}
                  ariaLabel="Thumbnail modes"
                  layoutId="thumb-gen-mode-toggle"
                  className="thumb-gen-mode-segtabs"
                  options={THUMB_GEN_SUB_TABS.map((t) => ({
                    value: t.id,
                    label: t.label,
                    icon: t.icon,
                  }))}
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
                      <SegmentedTabs
                        value={srcMode}
                        onChange={setSrcMode}
                        ariaLabel="Source type"
                        layoutId={`thumb-source-mode-${thumbMode}`}
                        className="thumb-source-segtabs"
                        options={[
                          { value: linkVal, label: 'Link' },
                          { value: 'upload', label: 'Upload' },
                        ]}
                      />
                    )
                  })()}
              </div>

              <SmoothHeight className="thumb-gen-mode-pane">
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
                        <ThumbBatchCirclePicker
                          value={numThumbnails}
                          onChange={(v) => setNumThumbnails(Number(v))}
                          disabled={pendingAssistant}
                        />
                      </div>
                      <div className="thumb-gen-submit-group">
                        <ThumbSendPill
                          featureKey="thumbnail_generate"
                          count={numThumbnails}
                          disabled={pendingAssistant || (!draft.trim() && !promptImageDataUrl)}
                          ariaLabel="Generate thumbnails"
                        />
                      </div>
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
                        <ThumbBatchCirclePicker
                          value={numRecreateThumbnails}
                          onChange={(v) => setNumRecreateThumbnails(Number(v))}
                          disabled={pendingAssistant}
                        />
                      </div>
                      <div className="thumb-gen-submit-group">
                        <ThumbSendPill
                          featureKey="thumbnail_recreate"
                          count={1}
                          disabled={
                            pendingAssistant ||
                            !(recreateSourceMode === 'upload'
                              ? recreateSourceImage
                              : recreatePreviewUrl)
                          }
                          ariaLabel="Recreate thumbnail"
                        />
                      </div>
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
                      <ThumbSendPill
                        featureKey="thumbnail_analyze"
                        disabled={
                          pendingAssistant ||
                          !(analyzeSourceMode === 'upload' ? analyzeSourceImage : analyzePreviewUrl)
                        }
                        ariaLabel="Analyze thumbnail"
                      />
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
                    <div className="thumb-gen-analyze-submit-row">
                      <ThumbSendPill
                        type="button"
                        disabled={editSourceMode === 'upload' ? !editDataUrl : !editPreviewUrl}
                        onClick={handleOpenEditFromFooter}
                        ariaLabel="Open editor"
                        label="Edit"
                        icon={
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
                        }
                      />
                    </div>
                  </form>
                )}
              </SmoothHeight>
            </div>
          </div>
        </motion.footer>
      </motion.section>
      {showEditDialog && editDialogUrl && (
        <EditThumbnailDialog
          imageUrl={editDialogUrl}
          onClose={() => {
            setShowEditDialog(false)
            setEditDialogUrl(null)
          }}
          onApply={async (result) => {
            // Editor returns either a single URL (batch = 1) or an array
            // (batch > 1). Grid render matches the normal multi-thumbnail
            // response shape so cards look identical in the chat.
            const urls = Array.isArray(result) ? result : [result]
            if (urls.length <= 1) {
              pushLocalAssistantMessage('Edit this thumbnail.', {
                content: '',
                imageUrl: urls[0] || null,
              })
            } else {
              pushLocalAssistantMessage('Edit this thumbnail.', {
                content: '',
                thumbnails: urls.map((image_url, i) => ({
                  title: `${i + 1}x`,
                  image_url,
                  emotion: '',
                  psychology_angle: '',
                })),
              })
            }
            setShowEditDialog(false)
            setEditDialogUrl(null)
            setEditDataUrl(null)
            setEditUrlInput('')
            setEditPreviewUrl(null)
          }}
        />
      )}
      {lightbox ? <ThumbnailLightbox url={lightbox.url} onClose={() => setLightbox(null)} /> : null}
    </div>
  )
}
