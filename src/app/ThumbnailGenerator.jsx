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
import { Dropdown, SegmentedTabs, InlineSpinner, PrimaryPill } from '../components/ui'
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import { ChatHistorySkeleton } from '../components/ChatHistorySkeleton'
import GenerationProgress from '../components/GenerationProgress'
import { AnimatedComposerHint } from '../components/AnimatedComposerHint'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import { useFloatingPosition } from '../lib/useFloatingPosition'
import { extractYoutubeUrl } from '../lib/youtubeUrl'
import { renderMessageContent } from '../lib/messageRender.jsx'
import { useThreadScrollToBottom } from '../lib/useThreadScrollToBottom'
import { CostHint } from '../components/CostHint'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { checkPromptForRealPerson, warningMessageFor } from '../lib/promptModeration'
import { toast } from '../lib/toast'
import { friendlyTitleFor, parseApiError } from '../lib/errorMessages'
// import './ScriptGenerator.css' // next update — ScriptGenerator moved to src/next-update-ideas
import './ThumbnailGenerator.css'

const THUMB_COMPOSER_HINTS = [
  'A smiling explorer on a misty mountain peak, bold yellow text “I SURVIVED 7 DAYS”',
  'Shocked face next to a huge pile of cash, red glow, title “I WON $1,000,000?!”',
  'Close-up iPhone 16 on a neon-purple gradient, bold white text “WORTH THE HYPE?”',
  'Ripped athlete mid-lift in dramatic red lighting, title “30-DAY TRANSFORMATION”',
  'Dark desk + glowing laptop, cyan LEDs, bold “I BUILT A SAAS IN 24 HOURS”',
  'Split before/after of a messy room, huge arrow, bold text “EXTREME CLEAN”',
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

/**
 * Thin wrapper around the shared <PrimaryPill> primitive that keeps the
 * old ThumbSendPill call sites working without change, while routing the
 * visual spec to the canonical component. Only extra behaviour: hide the
 * credit chip for unsubscribed users (they can't spend credits yet, so
 * showing "⚡ 15" would be misleading). Once every screen has migrated
 * to PrimaryPill directly, this wrapper can be deleted and each call
 * site can pass `showCost={isSubscribed}` instead.
 */
function ThumbSendPill({
  featureKey = null,
  count = 1,
  disabled = false,
  ariaLabel,
  icon,
  label,
  type = 'submit',
  className,
  size = 'sm',
  ...buttonProps
}) {
  const { isSubscribed } = usePlanEntitlements()
  return (
    <PrimaryPill
      type={type}
      featureKey={featureKey || undefined}
      count={count}
      showCost={isSubscribed}
      disabled={disabled}
      ariaLabel={ariaLabel}
      icon={icon ?? <IconArrowUp />}
      label={label}
      className={className}
      size={size}
      {...buttonProps}
    />
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

// Estimated durations for the GenerationProgress confidence bar. The
// bar is decoupled from real backend progress (we have no signal); these
// are tuned so the asymptotic ease lands ~92 % around the median wait.
const GEN_DURATION_SINGLE_MS = 25000
const GEN_DURATION_BATCH_MS = 35000
const GEN_DURATION_RECREATE_MS = 28000
const GEN_DURATION_ANALYZE_MS = 14000

/**
 * Map a backend error code (from the thumbnails chat route's APIError)
 * to a user-facing message. Falls back to the backend's own `message`
 * field when we don't have a tailored copy for the code — that keeps
 * new server-side codes from silently hiding behind a generic string.
 */
function codeToFriendlyMessage(code, backendMsg) {
  switch (code) {
    case 'CONTENT_BLOCKED':
      return (
        'OpenAI’s safety system blocked this request. Try rephrasing the ' +
        'prompt or remove the reference image, then generate again.'
      )
    case 'PROVIDER_RATE_LIMITED':
      return 'The image provider is rate-limited right now. Try again in a moment.'
    case 'PROVIDER_QUOTA_EXCEEDED':
      return (
        'The image provider’s account quota is exceeded. Nothing was charged — ' +
        'please contact support.'
      )
    case 'PROVIDER_MISCONFIGURED':
      return (
        'The image provider is misconfigured on the server side. Nothing was ' +
        'charged — please contact support.'
      )
    case 'THUMBNAIL_BAD_REQUEST':
      return 'The image provider rejected the request. Try different wording.'
    case 'PROVIDER_UNAVAILABLE':
      return 'The image provider had a temporary glitch. Nothing was charged — try again.'
    case 'NO_ACTIVE_SUBSCRIPTION':
    case 'INSUFFICIENT_CREDITS':
      return backendMsg // billing flow handles these via other UI paths
    default:
      return backendMsg || 'Could not generate thumbnails.'
  }
}

// Which error codes support a Retry button? `CONTENT_BLOCKED` is
// retryable in the sense that the user changes the prompt and tries
// again — the button resends the same draft, which might still fail.
function isRetryableCode(code, extra) {
  if (!code) return true // unknown error — give the benefit of the doubt
  if (extra && extra.retryable === false) return false
  return [
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_RATE_LIMITED',
    'CONTENT_BLOCKED',
    'THUMBNAIL_BAD_REQUEST',
  ].includes(code)
}

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
/**
 * PromptModerationNotice — soft, non-blocking warning shown below the
 * prompt textarea when the user's draft mentions a well-known real person
 * or uses impersonation phrasing. The submit button stays enabled; this
 * is just a nudge that Scriptz AI is for original characters.
 */
function PromptModerationNotice({ prompt }) {
  const check = checkPromptForRealPerson(prompt)
  if (check.ok) return null
  const msg = warningMessageFor(check)
  return (
    <div
      role="status"
      style={{
        margin: '6px 0 0',
        padding: '8px 10px',
        borderRadius: 10,
        fontSize: 12,
        lineHeight: 1.45,
        color: 'rgba(252, 211, 77, 0.95)',
        background: 'rgba(234, 179, 8, 0.08)',
        border: '1px solid rgba(234, 179, 8, 0.32)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0, lineHeight: 1 }}>
        ⚠️
      </span>
      <span>{msg}</span>
    </div>
  )
}

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
            <p className="thumb-batch-circle-popover-title">Concepts</p>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                className={`thumb-batch-circle-option ${n === value ? 'is-active' : ''}`}
                aria-selected={n === value}
                aria-label={`${n} concept${n === 1 ? '' : 's'} per run`}
                onClick={() => {
                  onChange(n)
                  setOpen(false)
                }}
              >
                <span className="thumb-batch-circle-option-n">{n}</span>
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

function ThumbnailBatchCard({
  t,
  index,
  label,
  userRequest,
  onViewImage,
  onEditImage,
  onRegenerate,
  canRegenerate = true,
}) {
  // Rating is cached per-image in React Query (staleTime: Infinity) — a
  // thumbnail is scored exactly once per session no matter how many times
  // the card mounts or the user navigates away and back. Re-rating is
  // opt-in via `refetch()` from the error-state retry button.
  const ratingQuery = useThumbnailRatingQuery(t?.image_url)
  const score =
    ratingQuery.data?.overall_score != null ? Math.round(ratingQuery.data.overall_score) : null
  const loadingScore = ratingQuery.isPending && !!t?.image_url
  const scoreError = ratingQuery.isError ? ratingQuery.error?.message || 'Score failed' : null
  const recommendations = Array.isArray(ratingQuery.data?.recommendations)
    ? ratingQuery.data.recommendations.filter(Boolean)
    : []
  const retryScore = useCallback(() => {
    ratingQuery.refetch()
  }, [ratingQuery])

  const baseRegeneratePrompt =
    (userRequest || '').trim() || 'Regenerate this thumbnail for YouTube.'
  const handleRegenerateClick = useCallback(() => {
    onRegenerate?.(baseRegeneratePrompt)
  }, [onRegenerate, baseRegeneratePrompt])
  const handleOneClickFix = useCallback(() => {
    if (!onRegenerate || !recommendations.length) return
    const fixes = recommendations.slice(0, 3).join('; ')
    onRegenerate(`${baseRegeneratePrompt} Apply these improvements: ${fixes}.`)
  }, [onRegenerate, recommendations, baseRegeneratePrompt])
  const canOneClickFix =
    !!onRegenerate && canRegenerate && recommendations.length > 0 && !loadingScore && !scoreError

  const scoreTier = scoreError
    ? 'error'
    : loadingScore
      ? 'loading'
      : score != null
        ? getScoreTier(score)
        : null

  return (
    <div className="thumb-batch-card-wrap" data-thumb-slot={index}>
      {/* YouTube-style ambient glow — the thumbnail image itself, blurred
       *  and scaled, sitting behind the card so the halo picks up the
       *  dominant colours of the image (same trick YouTube uses). */}
      {t?.image_url ? (
        <div
          className="thumb-batch-card-ambient"
          aria-hidden="true"
          style={{ backgroundImage: `url(${t.image_url})` }}
        />
      ) : null}

      <div className="thumb-batch-card">
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

            {/* Center-bottom floating action bar — frosted glass pill matches
             *  the VideoOptimize thumbnail card convention. Buttons stop
             *  propagation so the surrounding image-wrap click (lightbox)
             *  doesn't fire. */}
            {t?.image_url ? (
              <div
                className="thumb-batch-card-float"
                role="toolbar"
                aria-label="Thumbnail actions"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {onEditImage ? (
                  <button
                    type="button"
                    className="thumb-batch-card-float-btn"
                    onClick={() => onEditImage(t.image_url)}
                    aria-label="Edit in AI editor"
                    title="Edit"
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
                      <path d="M14.7 5.3a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 9.7-9.7z" />
                      <path d="M13 7l4 4" />
                    </svg>
                  </button>
                ) : null}
                <a
                  href={t.image_url}
                  download={`thumbnail-${label || index + 1}.png`}
                  className="thumb-batch-card-float-btn"
                  aria-label="Download thumbnail"
                  title="Download"
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
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
                {canOneClickFix ? (
                  <button
                    type="button"
                    className="thumb-batch-card-float-btn thumb-batch-card-float-btn--fix"
                    onClick={handleOneClickFix}
                    aria-label="One-click fix using AI recommendations"
                    title={`One-click fix — ${recommendations[0] || 'apply AI recommendations'}`}
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
                      <path d="M12 3l1.8 4.5L18.5 9.3 14 11l-2 4.7L10 11 5.5 9.3 10 7.5z" />
                      <path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
                    </svg>
                  </button>
                ) : null}
                {canRegenerate && onRegenerate ? (
                  <button
                    type="button"
                    className="thumb-batch-card-float-btn"
                    onClick={handleRegenerateClick}
                    aria-label="Regenerate thumbnail"
                    title="Regenerate"
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
                      <path d="M21 12a9 9 0 1 1-3.27-6.95" />
                      <polyline points="21 4 21 10 15 10" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
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

export function ThumbnailGenerator({
  channelId,
  onOpenPersonas,
  onOpenStyles,
  conversationId,
  onConversationCreated,
}) {
  const selectedPersonaId = usePersonaStore((s) => s.selectedPersonaId)
  const selectedPersona = usePersonaStore((s) => s.selectedPersona)
  const selectedStyleId = useStyleStore((s) => s.selectedStyleId)
  const selectedStyle = useStyleStore((s) => s.selectedStyle)
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
  // Structured metadata for the most recent sendError — lets the footer
  // render a Retry pill only when the error is retryable.
  const [sendErrorMeta, setSendErrorMeta] = useState(null)
  const [pendingUserMessage, setPendingUserMessage] = useState(null)
  const [pendingAssistant, setPendingAssistant] = useState(false)
  const [pendingUserImageUrl, setPendingUserImageUrl] = useState(null)
  // Snap-to-100 signal for <GenerationProgress />. Flips true when the
  // request finishes, lets the bar animate to 100, then we clear pending.
  const [pendingDone, setPendingDone] = useState(false)
  const finishLoadingRef = useRef(null)
  const promptFileInputRef = useRef(null)
  const recreateFileInputRef = useRef(null)
  const analyzeFileInputRef = useRef(null)
  const recreateFetchRef = useRef(null)
  const analyzeFetchRef = useRef(null)
  const editFetchRef = useRef(null)
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
    setSendErrorMeta(null)
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
      setSendErrorMeta(null)
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
    // Belt-and-suspenders: only adopt server data if it actually belongs
    // to the conversation the user is currently viewing. Without this,
    // a stale fetch landing late (or a residual placeholder from React
    // Query) could splash the previous chat's messages onto a freshly
    // opened thread.
    const serverConvId = conversationQuery.data?.conversation?.id
    const matchesCurrent = serverConvId == null || Number(serverConvId) === Number(conversationId)
    if (matchesCurrent && conversationQuery.data?.messages?.items) {
      const serverMessages = buildMessagesFromApi(conversationQuery.data.messages.items)
      // Poll-safe merge: if the server has fewer messages than we currently
      // show (because we've already pushed optimistic local messages that
      // the backend hasn't persisted yet), keep the local state. Otherwise
      // the server is authoritative.
      setMessages((current) => (serverMessages.length >= current.length ? serverMessages : current))
    } else if (!matchesCurrent || !conversationQuery.data) {
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

  // Reset the progress "done" flag whenever a new pending starts so the
  // shared <GenerationProgress /> begins from 0 again.
  useEffect(() => {
    if (pendingAssistant) setPendingDone(false)
  }, [pendingAssistant])

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

  // Call on successful API completion — snaps the GenerationProgress
  // bar to 100, then clears the pending flag once the bar's fade-out
  // has had time to play. The 550 ms here is intentionally a touch
  // longer than the bar's fade transition so it never gets cut off.
  const finishLoading = useCallback(() => {
    if (finishLoadingRef.current) clearTimeout(finishLoadingRef.current)
    setPendingDone(true)
    finishLoadingRef.current = setTimeout(() => {
      setPendingAssistant(false)
      setPendingDone(false)
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
    setSendErrorMeta(null)
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
      // Parse the structured error payload. The chat route returns either:
      //   • APIError shape:  { error: { code, message, request_id, extra } }
      //   • HTTPException:   { detail: <string> | { code, message, ... } }
      // We prefer the structured code so the footer can pick a tailored
      // message + decide whether to show a Retry pill.
      const body = err?.payload
      const errorObj = body?.error
      const detailObj = body?.detail && typeof body.detail === 'object' ? body.detail : null
      const code = errorObj?.code || detailObj?.code || null
      const extra = errorObj?.extra || detailObj?.extra || {}
      const backendMsg =
        errorObj?.message ||
        detailObj?.message ||
        (typeof body?.detail === 'string' ? body.detail : null) ||
        err?.message ||
        'Could not generate thumbnails.'

      const friendly = codeToFriendlyMessage(code, backendMsg)
      const retryable = isRetryableCode(code, extra)
      setSendError(friendly)
      setSendErrorMeta({
        code,
        retryable,
        retryAfterSeconds: extra?.retry_after_seconds ?? null,
        draft: combined,
      })
      // Surface as a global toast in addition to the inline footer error so
      // the failure is visible even if the user has scrolled away.
      toast.error(backendMsg, {
        code: code || undefined,
        title: friendlyTitleFor(code),
      })
      setDraft(combined)
      setPendingAssistant(false)
      // Roll back the optimistic user message so they can retry.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserId))
      if (activeConversationId) clearPending(activeConversationId)
    }
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
        const { code, message } = parseApiError(err, 'Regeneration failed')
        setSendError(message)
        setSendErrorMeta(null)
        setPendingAssistant(false)
        toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
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
      setSendErrorMeta(null)
      return
    }
    if (!instructions && !selectedPersonaId && !selectedStyleId) {
      setSendError('Add what should change, or pick a persona or style.')
      setSendErrorMeta(null)
      return
    }
    const userText = instructions
      ? `Recreate this thumbnail — ${instructions}`
      : 'Recreate this thumbnail.'
    setSendError('')
    setSendErrorMeta(null)
    setPendingUserMessage(userText)
    setPendingAssistant(true)
    setRecreateDraft('')
    setRecreateSourceImage(null)
    setRecreateUrlInput('')
    setRecreatePreviewUrl(null)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in to recreate thumbnails.')
      // Backend bakes persona/style into the prompt itself based on the IDs;
      // we only forward the user's raw instructions plus the source image and
      // selection IDs. Tier is not in scope in this component, so we omit it
      // and let the backend fall back to the user's saved tier.
      const payload = {
        source_image_url: sourceImageUrl,
        persona_id: selectedPersonaId || undefined,
        style_id: selectedStyleId || undefined,
        prompt: instructions || undefined,
      }
      const count = numRecreateThumbnails
      if (count === 1) {
        const res = await thumbnailsApi.regenerateWithPersona(token, payload)
        const imageUrl = res?.image_url
        if (!imageUrl) throw new Error('No image returned from recreate.')
        pushLocalAssistantMessage(userText, { content: '', imageUrl, isRecreate: true })
      } else {
        const results = await Promise.all(
          Array.from({ length: count }, () => thumbnailsApi.regenerateWithPersona(token, payload))
        )
        const thumbnails = results.map((r, i) => ({
          image_url: r?.image_url,
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
      const { code, message } = parseApiError(err, 'Could not recreate thumbnail.')
      setSendError(message)
      setSendErrorMeta(null)
      setPendingAssistant(false)
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
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
      setSendErrorMeta(null)
      return
    }
    const titleTrim = analyzeTitle.trim()
    const userText = `Analyze this thumbnail${titleTrim ? ` for "${titleTrim}"` : ''}.`
    setSendError('')
    setSendErrorMeta(null)
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
      const { code, message } = parseApiError(err, 'Could not analyze thumbnail.')
      setSendError(message)
      setSendErrorMeta(null)
      setPendingAssistant(false)
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
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
        <div
          ref={threadRef}
          className={`coach-thread ${layoutCentered ? 'coach-thread--empty' : ''} coach-thread--thumb-panel ${isHistoryLoading ? 'coach-thread--history-loading' : ''}`}
        >
          {isHistoryLoading && <ChatHistorySkeleton />}

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
                {/* Copy button removed — not useful on the thumbnail screen. */}
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
              {/* Shared 16:9 placeholder slot that the result thumbnail will
               * land in — keeps the layout stable so the bar → image swap
               * doesn't cause a height jump. <GenerationProgress /> is the
               * one and only loader for every thumbnail-generation path
               * (chat, recreate, batch, analyze). */}
              <div className="thumb-gen-loader">
                <div className="thumb-gen-loader__stage">
                  <div className="gen-progress-slot">
                    <GenerationProgress
                      done={pendingDone}
                      estimatedDurationMs={(() => {
                        if (thumbMode === 'analyze') return GEN_DURATION_ANALYZE_MS
                        if (thumbMode === 'recreate') {
                          return numRecreateThumbnails > 1
                            ? GEN_DURATION_BATCH_MS
                            : GEN_DURATION_RECREATE_MS
                        }
                        return numThumbnails > 1 ? GEN_DURATION_BATCH_MS : GEN_DURATION_SINGLE_MS
                      })()}
                    />
                  </div>
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
                <span className="thumb-gen-footer-error__msg">{sendError || editFooterError}</span>
                {sendErrorMeta?.retryable && draft.trim() ? (
                  <button
                    type="button"
                    className="thumb-gen-footer-error__retry"
                    onClick={() => {
                      setSendError('')
                      setSendErrorMeta(null)
                      handleSubmit()
                    }}
                    aria-label="Retry generation"
                  >
                    Retry
                  </button>
                ) : null}
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
                      <PromptModerationNotice prompt={draft} />
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
