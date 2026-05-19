import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect, memo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { getApiBaseUrl } from '../lib/env'
import { thumbnailsApi } from '../api/thumbnails'
import { usePersonaStore } from '../stores/personaStore'
import { useStyleStore } from '../stores/styleStore'
import { PersonaSelector } from '../components/PersonaSelector'
import { ScorePill } from '../components/ScorePill'
import { StyleSelector } from '../components/StyleSelector'
import {
  useThumbnailConversationQuery,
  useThumbnailConversationsQuery,
  useThumbnailChatMutation,
  useLoadOlderThumbnailMessagesMutation,
  useThumbnailRatingQuery,
  seedThumbnailRating,
} from '../queries/thumbnails/thumbnailQueries'
import { useThumbnailChatActivityStore } from '../stores/thumbnailChatActivityStore'
import * as pendingActions from '../stores/pendingActionStore'
import { EditThumbnailDialog } from '../components/EditThumbnailDialog'
import ThumbnailTopBar from '../components/ThumbnailTopBar'
import { TabBar } from '../components/TabBar'
import { Dropdown, InlineSpinner } from '../components/ui'
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion'
import { ChatHistorySkeleton } from '../components/ChatHistorySkeleton'
import { friendlyMessage } from '../lib/aiErrors'
import GenerationProgress from '../components/GenerationProgress'
import { useAnimatedHint } from '../lib/useAnimatedHint'
import { LazyImg } from '../components/LazyImg'
import { ThumbPillTabs } from '../components/ThumbPillTabs'
import { ThumbBackgroundFX } from '../components/ThumbBackgroundFX'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import { extractYoutubeUrl } from '../lib/youtubeUrl'
import { renderMessageContent } from '../lib/messageRender.jsx'
import { CostHint } from '../components/CostHint'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { useCreditsQuery } from '../queries/billing/creditsQueries'
import { openCreditsModal } from '../lib/creditsModalBus'
import { toast } from '../lib/toast'
import { parseApiError } from '../lib/errorMessages'
import FailedGenerationCard from '../components/FailedGenerationCard'
import { canvasToBase64Png } from '../lib/canvasToBase64'
import { queryKeys } from '../lib/query/queryKeys'
import { broadcastCacheEvent } from '../lib/query/broadcastSync'
import { onShellEvent } from '../lib/shellEvents'
import { IconPaperclip } from './thumbnails/icons'
import {
  AnalyzeLoaderCard,
  SmoothHeight,
  SmoothHint,
  ThumbnailGenFill,
  ThumbnailGenSlowHint,
  TitlesLoader,
} from './thumbnails/loaders'
import { ANALYZE_DISLIKE_REASONS, DISLIKE_REASONS, IOS_EASE } from './thumbnails/constants'
import { DislikeReasonDialog } from './thumbnails/dialogs'
import {
  ThumbBatchCirclePicker,
  ThumbDropZone,
  ThumbSendPill,
  ThumbTitleCountPicker,
} from './thumbnails/pickers'
import {
  AnalysisBreakdown,
  FailedAttemptBlock,
  ThumbnailLightbox,
  TitleIdeasBlock,
} from './thumbnails/blocks'
import './ThumbnailGenerator.css'

// Source-type options for the Recreate / Analyze / Edit tabbars. Icons
// built once as JSX constants so `ThumbPillTabs`'s memoised props stay
// referentially stable across parent re-renders.
const SRC_ICON_LINK = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
  </svg>
)
const SRC_ICON_UPLOAD = (
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
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)
const SRC_OPTIONS_YOUTUBE = [
  { value: 'youtube', label: 'Link', icon: SRC_ICON_LINK },
  { value: 'upload', label: 'Upload', icon: SRC_ICON_UPLOAD },
]
const SRC_OPTIONS_URL = [
  { value: 'url', label: 'Link', icon: SRC_ICON_LINK },
  { value: 'upload', label: 'Upload', icon: SRC_ICON_UPLOAD },
]

// Example prompt hints. Written as single natural sentences so the
// browser word-wraps them across the input bar — line 1 fills the
// available width, line 2 picks up the rest. No hardcoded `\n`: the
// shape is now driven by the textarea's actual width, which makes the
// hint read the same on desktop, tablet, and mobile.
// Greetings shown above the composer on the empty thumbnail screen.
// One is picked at random per page load so a returning user gets a
// little variety. All under ~32 chars so they fit on a single line
// at the responsive font size we use for the headline (no wrapping
// allowed — `white-space: nowrap` on the `h1` enforces it).
const THUMB_EMPTY_GREETINGS = [
  'What thumbnail do you need?',
  'What are we creating today?',
  "What's the next viral idea?",
  "Let's build your next hit.",
  'Time to make something clickable.',
  'Got a video to dress up?',
  "What's catching eyes today?",
]

const THUMB_COMPOSER_HINTS = [
  'A smiling explorer on a misty mountain peak at golden hour, bold yellow Impact title “I SURVIVED 7 DAYS”, dramatic backlight',
  'Shocked face next to a huge pile of cash with red glow accents, thick white outline, bold red title “I WON $1,000,000?!”',
  'Close-up iPhone 16 floating on a neon-purple gradient backdrop, glossy reflection, bold white sans title “WORTH THE HYPE?”',
  'Ripped athlete mid-lift under dramatic red rim lighting, black vignette, bold yellow title “30-DAY TRANSFORMATION”',
  'Dark desk with a glowing laptop and cyan LED strips behind it, film-noir mood, bold cyan title “I BUILT A SAAS IN 24 HOURS”',
  'Split before/after of a messy room and a clean room with arrow, high-contrast lighting, bold green title “EXTREME CLEAN”',
]

// Estimated durations for the GenerationProgress confidence bar. The
// bar is decoupled from real backend progress (we have no signal); these
// are tuned so the asymptotic ease lands ~92 % around the median wait.
// Calibrated for the current pipeline: Gemini rewrite (~1-2 s) + gpt-
// image-2 medium quality render (~8-14 s for single, ~20 s for a 4-up
// batch). Trim further if gpt-image-2 gets faster.
const GEN_DURATION_SINGLE_MS = 32000
const GEN_DURATION_BATCH_MS = 52000
const GEN_DURATION_RECREATE_MS = 35000
// Per-slot duration multipliers — spread ±15% so each card's progress bar
// moves at a visibly different speed from its neighbours.
const LOAD_SPREADS = [1.0, 1.13, 0.91, 1.08, 0.95, 1.17]

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
        "This prompt or reference image couldn't be processed. " +
        'Try rephrasing or using a different image.'
      )
    case 'PROVIDER_RATE_LIMITED':
    case 'PROVIDER_BUSY':
      return 'Generation is temporarily delayed due to high demand. Please try again in a moment.'
    case 'queue_full':
    case 'QUEUE_FULL':
      // Use the backend message verbatim — it contains the actual ETA from
      // extra.eta_seconds / Retry-After formatted by aiErrors.parseApiError.
      return backendMsg || 'Generation is temporarily delayed. Please try again in a moment.'
    case 'HIGH_DEMAND':
      return 'Generation is temporarily delayed — please try again in a moment.'
    case 'PROVIDER_QUOTA_EXCEEDED':
      return 'Service temporarily unavailable. Please try again later.'
    case 'PROVIDER_MISCONFIGURED':
      return 'A service issue is being resolved. Please try again later.'
    case 'THUMBNAIL_BAD_REQUEST':
      return "This request couldn't be processed. Try rewording the prompt or using a different reference image."
    case 'PROVIDER_UNAVAILABLE':
      return 'Generation service is temporarily unavailable. Please try again.'
    case 'INSUFFICIENT_CREDITS':
      return "You don't have enough credits for this. Top up or upgrade your plan."
    case 'NO_ACTIVE_SUBSCRIPTION':
      return backendMsg // billing flow handles this via other UI paths
    default:
      return backendMsg || 'Generation failed. Please try again.'
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
    'PROVIDER_BUSY',
    'HIGH_DEMAND',
    'queue_full',
    'QUEUE_FULL',
    'CONTENT_BLOCKED',
    'THUMBNAIL_BAD_REQUEST',
  ].includes(code)
}

// Backend accepts num_thumbnails 1–6 (ge=1, le=6 in
// app/schemas/thumbnail_chat.py). Keep this option set in sync with
// that limit — previously capped at 4, which silently hid valid
// 5/6-image batches the API supports.
const BATCH_COUNT_OPTIONS = [
  { value: '1', label: '1×', hint: 'Single image' },
  { value: '2', label: '2×', hint: '2 variations' },
  { value: '3', label: '3×', hint: '3 variations' },
  { value: '4', label: '4×', hint: '4 variations' },
  { value: '5', label: '5×', hint: '5 variations' },
  { value: '6', label: '6×', hint: '6 variations' },
]

function parseThumbModeFromHash() {
  if (typeof window === 'undefined') return 'prompt'
  const hash = window.location.hash || ''
  const normalized = hash.replace(/^#/, '').replace(/^\/+/, '')
  const [routePart, search = ''] = normalized.split('?')
  if (routePart !== 'thumbnails') return 'prompt'
  const params = new URLSearchParams(search)
  const v = params.get('view')
  if (v === 'recreate' || v === 'analyze' || v === 'edit' || v === 'titles') return v
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

const IOS_RESIZE_TRANSITION = { duration: 0.22, ease: IOS_EASE }

const THUMB_GEN_SUB_TABS = [
  {
    id: 'prompt',
    label: 'Prompt',
    icon: (
      // Sparkles glyph from src/assets/sparkles.svg.
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M19.5,24a1,1,0,0,1-.929-.628l-.844-2.113-2.116-.891a1.007,1.007,0,0,1,.035-1.857l2.088-.791.837-2.092a1.008,1.008,0,0,1,1.858,0l.841,2.1,2.1.841a1.007,1.007,0,0,1,0,1.858l-2.1.841-.841,2.1A1,1,0,0,1,19.5,24ZM10,21a2,2,0,0,1-1.936-1.413L6.45,14.54,1.387,12.846a2.032,2.032,0,0,1,.052-3.871L6.462,7.441,8.154,2.387A1.956,1.956,0,0,1,10.108,1a2,2,0,0,1,1.917,1.439l1.532,5.015,5.03,1.61a2.042,2.042,0,0,1,0,3.872h0l-5.039,1.612-1.612,5.039A2,2,0,0,1,10,21Zm.112-17.977L8.2,8.564a1,1,0,0,1-.656.64L2.023,10.888l5.541,1.917a1,1,0,0,1,.636.643l1.77,5.53,1.83-5.53a1,1,0,0,1,.648-.648l5.53-1.769a.072.072,0,0,0,.02-.009L12.448,9.2a1,1,0,0,1-.652-.661Zm8.17,8.96h0ZM20.5,7a1,1,0,0,1-.97-.757l-.357-1.43L17.74,4.428a1,1,0,0,1,.034-1.94l1.4-.325L19.53.757a1,1,0,0,1,1.94,0l.354,1.418,1.418.355a1,1,0,0,1,0,1.94l-1.418.355L21.47,6.243A1,1,0,0,1,20.5,7Z" />
      </svg>
    ),
  },
  {
    id: 'recreate',
    label: 'Recreate',
    icon: (
      // Refresh glyph from src/assets/refresh.svg.
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12,2a10.032,10.032,0,0,1,7.122,3H16a1,1,0,0,0-1,1h0a1,1,0,0,0,1,1h4.143A1.858,1.858,0,0,0,22,5.143V1a1,1,0,0,0-1-1h0a1,1,0,0,0-1,1V3.078A11.981,11.981,0,0,0,.05,10.9a1.007,1.007,0,0,0,1,1.1h0a.982.982,0,0,0,.989-.878A10.014,10.014,0,0,1,12,2Z" />
        <path d="M22.951,12a.982.982,0,0,0-.989.878A9.986,9.986,0,0,1,4.878,19H8a1,1,0,0,0,1-1H9a1,1,0,0,0-1-1H3.857A1.856,1.856,0,0,0,2,18.857V23a1,1,0,0,0,1,1H3a1,1,0,0,0,1-1V20.922A11.981,11.981,0,0,0,23.95,13.1a1.007,1.007,0,0,0-1-1.1Z" />
      </svg>
    ),
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: (
      // Chart-histogram glyph from src/assets/chart-histogram.svg.
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M23,22H5a3,3,0,0,1-3-3V1A1,1,0,0,0,0,1V19a5.006,5.006,0,0,0,5,5H23a1,1,0,0,0,0-2Z" />
        <path d="M6,20a1,1,0,0,0,1-1V12a1,1,0,0,0-2,0v7A1,1,0,0,0,6,20Z" />
        <path d="M10,10v9a1,1,0,0,0,2,0V10a1,1,0,0,0-2,0Z" />
        <path d="M15,13v6a1,1,0,0,0,2,0V13a1,1,0,0,0-2,0Z" />
        <path d="M20,9V19a1,1,0,0,0,2,0V9a1,1,0,0,0-2,0Z" />
        <path d="M6,9a1,1,0,0,0,.707-.293l3.586-3.586a1.025,1.025,0,0,1,1.414,0l2.172,2.172a3,3,0,0,0,4.242,0l5.586-5.586A1,1,0,0,0,22.293.293L16.707,5.878a1,1,0,0,1-1.414,0L13.121,3.707a3,3,0,0,0-4.242,0L5.293,7.293A1,1,0,0,0,6,9Z" />
      </svg>
    ),
  },
  {
    id: 'titles',
    label: 'Titles',
    icon: (
      // Heading / "T" glyph — serif-style top bar with a vertical stem,
      // reads instantly as "title text". Drawn at the same 24-px viewBox
      // as the other tab icons, fill-based so it tints with currentColor.
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21,3H3A1,1,0,0,0,2,4V8A1,1,0,0,0,4,8V5h7V19H9a1,1,0,0,0,0,2h6a1,1,0,0,0,0-2H13V5h7V8a1,1,0,0,0,2,0V4A1,1,0,0,0,21,3Z" />
      </svg>
    ),
  },
  {
    id: 'edit',
    label: 'Edit',
    icon: (
      // Magic-wand glyph from src/assets/magic-wand.svg.
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="m18 9.064a3.049 3.049 0 0 0 -.9-2.164 3.139 3.139 0 0 0 -4.334 0l-11.866 11.869a3.064 3.064 0 0 0 4.33 4.331l11.87-11.869a3.047 3.047 0 0 0 .9-2.167zm-14.184 12.624a1.087 1.087 0 0 1 -1.5 0 1.062 1.062 0 0 1 0-1.5l7.769-7.77 1.505 1.505zm11.872-11.872-2.688 2.689-1.5-1.505 2.689-2.688a1.063 1.063 0 1 1 1.5 1.5zm-10.825-6.961 1.55-.442.442-1.55a1.191 1.191 0 0 1 2.29 0l.442 1.55 1.55.442a1.191 1.191 0 0 1 0 2.29l-1.55.442-.442 1.55a1.191 1.191 0 0 1 -2.29 0l-.442-1.55-1.55-.442a1.191 1.191 0 0 1 0-2.29zm18.274 14.29-1.55.442-.442 1.55a1.191 1.191 0 0 1 -2.29 0l-.442-1.55-1.55-.442a1.191 1.191 0 0 1 0-2.29l1.55-.442.442-1.55a1.191 1.191 0 0 1 2.29 0l.442 1.55 1.55.442a1.191 1.191 0 0 1 0 2.29zm-5.382-14.645 1.356-.387.389-1.358a1.042 1.042 0 0 1 2 0l.387 1.356 1.356.387a1.042 1.042 0 0 1 0 2l-1.356.387-.387 1.359a1.042 1.042 0 0 1 -2 0l-.387-1.355-1.358-.389a1.042 1.042 0 0 1 0-2z" />
      </svg>
    ),
  },
]

// Note: tab options are computed per-render inside the component as
// `thumbModeOptions` because the `premium` flag on the Edit tab
// depends on the user's `canUse('edit')` entitlement (free users see
// a crown badge; subscribers see no badge). The useMemo guards
// stability so ThumbPillTabs' memo isn't invalidated by parent
// re-renders.

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
  return canvasToBase64Png(canvas)
}

function buildSelectionHint(selectedPersona, selectedStyle) {
  const hints = []
  if (selectedPersona?.name) hints.push(`Use persona inspiration: ${selectedPersona.name}.`)
  if (selectedStyle?.name) hints.push(`Match visual style: ${selectedStyle.name}.`)
  return hints.join(' ')
}

const ThumbnailBatchCard = memo(function ThumbnailBatchCard({
  t,
  index,
  label,
  userRequest,
  onViewImage,
  onEditImage,
  onRegenerate,
  onOneClickFix,
  canRegenerate = true,
  isAnalyzeMode = false,
}) {
  // Rating is cached per-image in React Query (staleTime: Infinity) — a
  // thumbnail is scored exactly once per session no matter how many times
  // the card mounts or the user navigates away and back. Re-rating is
  // opt-in via `refetch()` from the error-state retry button.
  const ratingQuery = useThumbnailRatingQuery(t?.image_url)
  const score =
    ratingQuery.data?.overall_score != null ? Math.round(ratingQuery.data.overall_score) : null
  const loadingScore = ratingQuery.isPending && !!t?.image_url
  const scoreError = ratingQuery.isError
    ? friendlyMessage(ratingQuery.error) || 'Score failed'
    : null
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
    if (!onOneClickFix) return
    const fixes = recommendations.slice(0, 3)
    const prompt =
      fixes.length > 0
        ? `Redesign this thumbnail with the following improvements:\n${fixes.map((f) => `- ${f}`).join('\n')}`
        : `Redesign this thumbnail to make it more engaging and click-worthy for YouTube.`
    onOneClickFix({ prompt, imageUrl: t?.image_url })
  }, [onOneClickFix, recommendations, t])
  const canOneClickFix = !!onOneClickFix && canRegenerate

  // Thumbs feedback — optimistic local state, synced to server.
  const ratingId = ratingQuery.data?.rating_id ?? null
  const serverFeedback = ratingQuery.data?.user_feedback ?? null
  const [localFeedback, setLocalFeedback] = useState(null) // null = follow server
  const currentFeedback = localFeedback !== null ? localFeedback : serverFeedback
  const [feedbackPending, setFeedbackPending] = useState(false)
  const [showDislikeDialog, setShowDislikeDialog] = useState(false)
  const [dialogSubmitting, setDialogSubmitting] = useState(false)

  // Thumbs-up: immediate toggle, no dialog.
  const handleLike = useCallback(async () => {
    if (!ratingId || feedbackPending) return
    const next = currentFeedback === 1 ? 0 : 1
    setLocalFeedback(next)
    setFeedbackPending(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) return
      await thumbnailsApi.rateFeedback(token, ratingId, next)
    } catch {
      setLocalFeedback(null)
      toast.error('Could not save feedback')
    } finally {
      setFeedbackPending(false)
    }
  }, [ratingId, feedbackPending, currentFeedback])

  // Thumbs-down: toggle-off is immediate; first dislike opens dialog.
  const handleDislikeClick = useCallback(() => {
    if (!ratingId || feedbackPending || dialogSubmitting) return
    if (currentFeedback === -1) {
      // Already disliked — toggle off immediately
      setLocalFeedback(0)
      setFeedbackPending(true)
      getAccessTokenOrNull()
        .then((token) => token && thumbnailsApi.rateFeedback(token, ratingId, 0))
        .catch(() => {
          setLocalFeedback(null)
          toast.error('Could not save feedback')
        })
        .finally(() => setFeedbackPending(false))
    } else {
      setShowDislikeDialog(true)
    }
  }, [ratingId, feedbackPending, dialogSubmitting, currentFeedback])

  // Called by the dialog on submit — sends -1 + reason/note.
  const handleDislikeSubmit = useCallback(
    async ({ reason, note }) => {
      if (!ratingId || dialogSubmitting) return
      setDialogSubmitting(true)
      setLocalFeedback(-1)
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return
        await thumbnailsApi.rateFeedback(token, ratingId, -1, { reason, note })
        setShowDislikeDialog(false)
      } catch {
        setLocalFeedback(null)
        toast.error('Could not save feedback')
      } finally {
        setDialogSubmitting(false)
      }
    },
    [ratingId, dialogSubmitting]
  )

  const handleDislikeCancel = useCallback(() => setShowDislikeDialog(false), [])

  const handleDownload = useCallback(async () => {
    const url = t?.image_url
    if (!url) return
    const num = typeof index === 'number' ? index + 1 : 1
    const filename = `clixa-ai-thumbnail-${num}.png`

    const triggerBlobDownload = (blob) => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    }

    // Data URLs (base64 fallback when S3 upload failed): decode client-side.
    if (url.startsWith('data:')) {
      try {
        const [header, b64] = url.split(',')
        const mime = (header.match(/:(.*?);/) || [])[1] || 'image/png'
        const binary = atob(b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        triggerBlobDownload(new Blob([bytes], { type: mime }))
      } catch {
        toast.error('Could not download this thumbnail')
      }
      return
    }

    // CloudFront / S3 URLs: fetch via the backend proxy WITH the Bearer token
    // (a plain <a href> click sends no Authorization header → 401 response
    // saved as a PNG → corrupted file).
    try {
      const token = await getAccessTokenOrNull()
      if (!token) {
        toast.error('Please sign in to download')
        return
      }
      const proxyUrl =
        `${getApiBaseUrl()}/api/thumbnails/download?` +
        `url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
      const resp = await fetch(proxyUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      triggerBlobDownload(await resp.blob())
    } catch {
      toast.error('Download failed — please try again')
    }
  }, [t?.image_url, index])

  // The score pill mounts whenever there's *something* to show — a real
  // score, a loading state, or an error. The component handles the
  // tier-colour palette + state-specific layout itself.
  const showScorePill = loadingScore || !!scoreError || score != null

  return (
    <>
      <div className="thumb-batch-card-wrap" data-thumb-slot={index}>
        <div className="thumb-batch-card">
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
              <LazyImg src={t.image_url} alt={label} className="thumb-batch-img" />

              {/* Score pill — owns its own state UI (loading / ready / error)
               *  + tier palette. See ScorePill.jsx. */}
              {showScorePill && (
                <ScorePill
                  score={score}
                  loading={loadingScore}
                  error={scoreError}
                  onRetry={retryScore}
                />
              )}

              {/* Bottom action area — two frosted pills side by side.
               *  The group wrapper handles stopPropagation so neither pill
               *  accidentally opens the lightbox. */}
              {t?.image_url ? (
                <div
                  className="thumb-batch-card-float-group"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {/* Primary actions pill: Edit · Download · OCF · Regenerate */}
                  <div
                    className="thumb-batch-card-float"
                    role="toolbar"
                    aria-label="Thumbnail actions"
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
                    <button
                      type="button"
                      className="thumb-batch-card-float-btn"
                      onClick={handleDownload}
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
                    </button>
                    {canOneClickFix ? (
                      <button
                        type="button"
                        className="thumb-batch-card-float-btn thumb-batch-card-float-btn--fix"
                        onClick={handleOneClickFix}
                        aria-label="One-click fix using AI recommendations"
                        title={
                          recommendations.length > 0
                            ? `One-click fix — ${recommendations[0]}`
                            : 'One-click fix'
                        }
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
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M12,2a10.032,10.032,0,0,1,7.122,3H16a1,1,0,0,0-1,1h0a1,1,0,0,0,1,1h4.143A1.858,1.858,0,0,0,22,5.143V1a1,1,0,0,0-1-1h0a1,1,0,0,0-1,1V3.078A11.981,11.981,0,0,0,.05,10.9a1.007,1.007,0,0,0,1,1.1h0a.982.982,0,0,0,.989-.878A10.014,10.014,0,0,1,12,2Z" />
                          <path d="M22.951,12a.982.982,0,0,0-.989.878A9.986,9.986,0,0,1,4.878,19H8a1,1,0,0,0,1-1H9a1,1,0,0,0-1-1H3.857A1.856,1.856,0,0,0,2,18.857V23a1,1,0,0,0,1,1H3a1,1,0,0,0,1-1V20.922A11.981,11.981,0,0,0,23.95,13.1a1.007,1.007,0,0,0-1-1.1Z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>

                  {/* Feedback pill: thumbs up · thumbs down — separate pill,
                   *  appears once the AI rating resolves (ratingId truthy).
                   *  👍 is immediate; 👎 opens the "why?" dialog. */}
                  {ratingId ? (
                    <div
                      className="thumb-batch-card-float-feedback"
                      role="group"
                      aria-label="Rate thumbnail"
                    >
                      <button
                        type="button"
                        className={`thumb-batch-card-float-btn${currentFeedback === 1 ? ' thumb-batch-card-float-btn--liked' : ''}`}
                        onClick={handleLike}
                        disabled={feedbackPending || dialogSubmitting}
                        aria-label="Helpful"
                        aria-pressed={currentFeedback === 1}
                        title="Helpful"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill={currentFeedback === 1 ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`thumb-batch-card-float-btn${currentFeedback === -1 ? ' thumb-batch-card-float-btn--disliked' : ''}`}
                        onClick={handleDislikeClick}
                        disabled={feedbackPending || dialogSubmitting}
                        aria-label="Not helpful"
                        aria-pressed={currentFeedback === -1}
                        title="Not helpful"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill={currentFeedback === -1 ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
                          <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Dislike reason dialog — rendered into document.body via portal so it
       *  escapes the overflow:hidden of the image card. */}
      <AnimatePresence>
        {showDislikeDialog && (
          <DislikeReasonDialog
            onSubmit={handleDislikeSubmit}
            onCancel={handleDislikeCancel}
            submitting={dialogSubmitting}
            reasons={isAnalyzeMode ? ANALYZE_DISLIKE_REASONS : DISLIKE_REASONS}
          />
        )}
      </AnimatePresence>
    </>
  )
})

const ThumbnailGridBlock = memo(function ThumbnailGridBlock({
  thumbnails,
  userRequest,
  msgId,
  onReplaceThumbnail,
  onRegenerate,
  onOneClickFix,
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
            onOneClickFix={onOneClickFix}
            onViewImage={onViewImage}
            onEditImage={onEditImage}
            canRegenerate={canRegenerate}
          />
        ))}
      </div>
    </div>
  )
})

/**
 * Single-image render (recreate / analyze / edit modes).
 *
 * Routes through the same ThumbnailBatchCard the grid uses so every mode
 * shows an identical card and action row.
 */
const ThumbnailImageBlock = memo(function ThumbnailImageBlock({
  imageUrl,
  userRequest,
  msgId,
  onReplaceThumbnail,
  onRegenerate,
  onOneClickFix,
  onViewImage,
  onEditImage,
  canRegenerate = true,
  isAnalyzeMode = false,
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
          onOneClickFix={onOneClickFix}
          onViewImage={onViewImage}
          onEditImage={onEditImage}
          canRegenerate={canRegenerate}
          isAnalyzeMode={isAnalyzeMode}
        />
      </div>
    </div>
  )
})

/**
 * Memoised chat message — the whole reason we extracted this from the
 * parent's inline `messages.map(...)` is so each existing message stops
 * re-rendering when the parent's unrelated state changes (typing in the
 * input, opening a modal, fetching a rating). With `memo` + the parent's
 * stable `useCallback` handlers, only the NEW message renders when the
 * thread updates — the rest stays painted.
 */
const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  onReplaceThumbnail,
  onRegenerate,
  onOneClickFix,
  onViewImage,
  onEditImage,
  onUseTitle,
}) {
  // Skip rendering a user article that has neither content nor a sent
  // image. Analyze-mode submissions with no title are intentionally
  // pushed without a userImageUrl now (the assistant card owns the
  // image), so a blank wrapper would otherwise occupy vertical space
  // and the chat would look like it had a phantom user turn.
  if (msg.role === 'user' && !msg.content && !msg.imageUrl) return null
  return (
    <article
      className={`coach-message ${msg.role === 'user' ? 'coach-message--user' : 'coach-message--assistant'}`}
    >
      {msg.role === 'user' ? (
        <div className="coach-user-message-stack">
          {msg.imageUrl && (
            <div className="thumb-user-sent-image">
              <LazyImg src={msg.imageUrl} alt="Sent thumbnail" className="thumb-user-sent-img" />
            </div>
          )}
          {/* Bubble is skipped entirely when the user sent only an
           * image (recreate / analyze with no typed prompt). Avoids
           * an empty pill clinging to the image card. */}
          {msg.content ? (
            <div className="coach-message-bubble">
              <p>{msg.content}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {msg.content && !/^Generated\s+\d+\s+thumbnail/i.test(msg.content.trim()) ? (
            <div className="coach-message-bubble">
              {renderMessageContent(msg.content, `thumb-msg-${msg.id}`)}
            </div>
          ) : null}
          {/* Image area.
           *
           * For analyze mode (either pending or analysis populated), the
           * loader and the final ThumbnailImageBlock are mounted inside
           * a single AnimatePresence slot — they share the exact same
           * outer DOM (`.thumb-msg-grid-wrap > .thumb-batch-grid > ...`)
           * so the swap is a TRUE in-place crossfade: the image stays
           * put, the scan overlays fade out, the action toolbar fades
           * in. Zero layout shift.
           *
           * For every other mode (prompt / recreate / edit), the image
           * renders straight through `ThumbnailImageBlock` — those
           * flows have their own pending UI elsewhere in this card
           * (`_promptPending` block above), so the analyze swap
           * machinery is irrelevant. */}
          {/* Analyze: show the scanning loader while pending so the user can
               see which thumbnail is being rated. When the result lands,
               the loader fades out and AnalysisBreakdown (below) reveals —
               we intentionally do NOT re-show the thumbnail image here to
               avoid duplicating the card already visible in the generation
               message above. The score badge on that card updates
               automatically via the seedThumbnailRating cache prime. */}
          <AnimatePresence>
            {msg._analyzePending && (
              <motion.div
                key="analyze-image-loader"
                layout
                style={{ width: '100%' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.28, ease: IOS_EASE } }}
                transition={{ duration: 0.36, ease: IOS_EASE }}
              >
                <AnalyzeLoaderCard imageUrl={msg.imageUrl} />
              </motion.div>
            )}
          </AnimatePresence>
          {/* Show the image for recreate/edit AND for completed analyze —
               the image stays visible with its toolbar after the scan loader
               exits, so the user sees the thumbnail alongside the breakdown. */}
          {!msg._analyzePending && msg.imageUrl && (
            <ThumbnailImageBlock
              imageUrl={msg.imageUrl}
              userRequest={msg.userRequest}
              msgId={msg.id}
              onReplaceThumbnail={onReplaceThumbnail}
              onRegenerate={onRegenerate}
              onOneClickFix={onOneClickFix}
              onViewImage={onViewImage}
              onEditImage={onEditImage}
              canRegenerate
              isAnalyzeMode={!!msg.analysis}
            />
          )}
          {/* Prompt / recreate in-place pending: when the placeholder is
           * pushed with `_promptPending: true`, render the loader inside
           * the SAME mounted card. AnimatePresence lets the exit fade
           * play before the thumbnail grid enters. */}
          <AnimatePresence mode="wait" initial={false}>
            {msg._promptPending ? (
              <motion.div
                key="prompt-loader"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: IOS_EASE }}
                style={{ width: '100%' }}
              >
                {(() => {
                  const lockedMode = msg._promptMode || 'prompt'
                  const count = msg._promptCount || 1
                  const baseDuration =
                    lockedMode === 'recreate'
                      ? count > 1
                        ? GEN_DURATION_BATCH_MS
                        : GEN_DURATION_RECREATE_MS
                      : count > 1
                        ? GEN_DURATION_BATCH_MS
                        : GEN_DURATION_SINGLE_MS
                  return (
                    <div aria-busy="true" aria-label="Generating thumbnails">
                      <div className="thumb-batch-grid">
                        {Array.from({ length: count }).map((_, i) => (
                          <div key={i} className="thumb-batch-card-wrap">
                            <div className="thumb-gen-loader">
                              <div className="thumb-gen-loader__stage">
                                <ThumbnailGenFill
                                  estimatedDurationMs={Math.round(
                                    baseDuration * LOAD_SPREADS[i % LOAD_SPREADS.length]
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <ThumbnailGenSlowHint estimatedDurationMs={baseDuration} />
                    </div>
                  )
                })()}
              </motion.div>
            ) : msg.thumbnails?.length > 0 ? (
              <motion.div
                key="thumb-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.28, ease: IOS_EASE }}
                style={{ width: '100%' }}
              >
                <ThumbnailGridBlock
                  thumbnails={msg.thumbnails}
                  userRequest={msg.userRequest}
                  msgId={msg.id}
                  onReplaceThumbnail={onReplaceThumbnail}
                  onRegenerate={onRegenerate}
                  onOneClickFix={onOneClickFix}
                  onViewImage={onViewImage}
                  onEditImage={onEditImage}
                  canRegenerate
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
          {/* Analyze branch: same in-place pending pattern as titles. The
           * submit handler pushes a placeholder local message with
           * `_analyzePending: true` + `userImageUrl` set; we render the
           * minimal cinematic loader inside the SAME card. When the
           * /rate response lands, `patchLocalAssistantMessage` fills in
           * `analysis` and clears the flag — AnimatePresence crossfades
           * loader → AnalysisBreakdown within one mounted container, so
           * the loader and the result are NEVER both visible at once
           * (which was the duplicate the user reported). */}
          {/* AnalysisBreakdown — rises in below the settled image after
           * the loader → result swap completes above. The `delay`
           * waits for the image-slot crossfade so the breakdown
           * arrives as a clear second beat rather than fighting the
           * image reveal for attention. */}
          {msg.analysis && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: IOS_EASE, delay: 0.28 }}
            >
              <AnalysisBreakdown analysis={msg.analysis} />
            </motion.div>
          )}
          {/* Title-card branch: while the in-place pending placeholder
           * is in flight (`_titlesPending` set when the user submits,
           * cleared when the API response is patched into this same
           * message), render the skeleton stack inside the assistant
           * card so the swap to populated rows is a content crossfade
           * within the SAME mounted container — no sibling jump. The
           * AnimatePresence wraps both branches with `layout` and a
           * fade so the height + opacity animate smoothly between the
           * skeleton and the populated rows. */}
          {(msg._titlesPending || msg.titleIdeas?.length > 0) && (
            <motion.div layout style={{ width: '100%' }}>
              <AnimatePresence mode="wait" initial={false}>
                {msg._titlesPending ? (
                  <motion.div
                    key="titles-loader"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.26, ease: IOS_EASE }}
                  >
                    <TitlesLoader count={msg.titleIdeasCount || 4} />
                  </motion.div>
                ) : msg.titleIdeas?.length > 0 ? (
                  <motion.div
                    key="titles-populated"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.32, ease: IOS_EASE }}
                  >
                    <TitleIdeasBlock titles={msg.titleIdeas} onUseTitle={onUseTitle} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </>
      )}
    </article>
  )
}, chatMessageItemPropsEqual)

/**
 * Custom equality for ChatMessageItem's `memo`.
 *
 * Why a custom comparator: `setMessages(...)` runs on every successful
 * `useThumbnailConversationQuery` response — including the 4-second
 * polls fired while the conversation is "pending" after a first
 * message. Each rebuild produces FRESH `msg` object references for
 * every row in the thread, even when the underlying content is
 * unchanged. The default shallow `===` comparator then declares every
 * row "changed" and re-renders the whole list — that's the flicker
 * the user sees during the response wait.
 *
 * The comparator below diffs only the fields the render output depends
 * on. `extra_data` and `thumbnails` are compared structurally because
 * they're the heaviest sub-trees and the parent rebuilds them as new
 * objects on every fetch. Equal → keep the existing render mounted;
 * unequal → re-render as before (e.g. when `_promptPending` flips
 * from true to false on AI completion).
 *
 * The handler props (`onReplaceThumbnail`, etc.) are wrapped in
 * `useCallback` in the parent, so their identity is stable across
 * renders — comparing them with `===` is the right call.
 */
function chatMessageItemPropsEqual(prev, next) {
  if (
    prev.onReplaceThumbnail !== next.onReplaceThumbnail ||
    prev.onRegenerate !== next.onRegenerate ||
    prev.onOneClickFix !== next.onOneClickFix ||
    prev.onViewImage !== next.onViewImage ||
    prev.onEditImage !== next.onEditImage ||
    prev.onUseTitle !== next.onUseTitle
  ) {
    return false
  }
  const a = prev.msg
  const b = next.msg
  if (a === b) return true
  if (!a || !b) return false
  // Identity fields. A change in any of these forces a re-render.
  // NOTE: `_serverMessageId` and `_optimistic` are intentionally NOT
  // compared — they're bookkeeping flags consumed only by the parent's
  // `renderedMessages` dedup pass (and the dedup runs before this
  // comparator ever sees the entry). Including them caused every
  // optimistic bubble to re-render the instant `linkLocalToServer`
  // bound it to its server twin, which the user saw as the entire
  // thread "updating" on every response.
  if (
    a.id !== b.id ||
    a.role !== b.role ||
    a.content !== b.content ||
    a.imageUrl !== b.imageUrl ||
    a.userRequest !== b.userRequest ||
    a._kind !== b._kind ||
    a._promptPending !== b._promptPending ||
    a._promptMode !== b._promptMode ||
    a._promptCount !== b._promptCount ||
    a._analyzePending !== b._analyzePending ||
    a._titlesPending !== b._titlesPending ||
    a._editPending !== b._editPending
  ) {
    return false
  }
  // Heavy sub-trees: cheap structural compare via JSON. The hot path
  // (poll-driven re-fetch with no real change) finds equal JSON and
  // short-circuits the re-render entirely; the rare path (assistant
  // completion with new thumbnails / analysis / titles) finds a diff
  // and re-renders once.
  if (!shallowJsonEqual(a.thumbnails, b.thumbnails)) return false
  if (!shallowJsonEqual(a.analysis, b.analysis)) return false
  if (!shallowJsonEqual(a.titles, b.titles)) return false
  return true
}

function shallowJsonEqual(a, b) {
  if (a === b) return true
  // Both nullish-but-not-identical (e.g. null vs undefined) are treated
  // as equal — they render the same. Otherwise, only one being nullish
  // means they differ.
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function buildMessagesFromApi(apiMessages = []) {
  return apiMessages.map((m) => {
    const isAssistant = m.role === 'assistant'
    const isUser = m.role === 'user'
    // Read extra_data for both assistant AND user rows — user rows now
    // carry extra_data.image_url (set by add_event from user_image_url).
    const ed = m.extra_data || {}
    // Failure events: assistant row carries `kind: 'failure'` plus the
    // error metadata. Mark with `_kind: 'failure'` so the render dispatch
    // routes to FailedAttemptBlock; the prior user row's content gets
    // pulled into `userText` by `mergeFailurePairs` further down.
    if (isAssistant && ed.kind === 'failure') {
      return {
        id: m.id,
        _kind: 'failure',
        createdAt: m.created_at ? Date.parse(m.created_at) : Date.now(),
        mode: ed.mode || 'prompt',
        userText: '',
        userImageUrl: ed.user_image_url || null,
        errorCode: ed.error_code || null,
        errorMessage: ed.error_message || '',
        retryable: !!ed.retryable,
        retryAfterSeconds: ed.retry_after_seconds || null,
        attempt: ed.attempt || null,
        maxAttempts: ed.max_attempts || null,
        options: ed.options || null,
        // Mark the partner user row for removal during the merge pass.
        _failureRow: true,
      }
    }
    // Pending placeholder: a non-chat handler pre-persisted the
    // user/assistant pair with `extra_data.pending = true` BEFORE
    // running generation, so a refresh mid-flight still renders the
    // conversation. Map onto the in-place pending flags (`_promptPending`
    // / `_analyzePending` / `_titlesPending`) so the same loader UI the
    // optimistic local pair shows during the live submit also renders
    // after reload. The PATCH that finalizes the row clears `pending`,
    // at which point this branch stops triggering and the row renders
    // as a normal completed result.
    if (isAssistant && ed.pending === true) {
      const kind = (ed.kind || ed.mode || '').toString().toLowerCase()
      const base = {
        id: m.id,
        role: m.role,
        content: m.content || '',
        userRequest: ed.user_request || '',
        thumbnails: [],
        imageUrl: null,
        _userImageUrl: ed.user_image_url || null,
        analysis: null,
        titleIdeas: null,
        isRecreate: kind === 'recreate',
        _isUser: false,
      }
      if (kind === 'analyze') {
        return { ...base, imageUrl: ed.user_image_url || null, _analyzePending: true }
      }
      if (kind === 'titles') {
        return {
          ...base,
          _titlesPending: true,
          titleIdeasCount: ed.title_ideas_count || 4,
        }
      }
      // Default: recreate / edit / faceswap render the same in-place
      // loader the prompt flow uses (`_promptPending: true`). The
      // user image carries over into both bubbles via the existing
      // stitch step.
      return {
        ...base,
        _promptPending: true,
        _promptMode: kind || 'recreate',
        _promptCount: ed.count || 1,
      }
    }
    // User rows now carry their own extra_data.image_url (mirrored from
    // the assistant's user_image_url by add_event). Old rows that pre-date
    // this change fall back to the sibling-stitch in stitchPersistedUserImages.
    // Strip the legacy "uploaded" sentinel — it is not a real URL.
    const toUrl = (v) => (v && v !== 'uploaded' ? v : null)
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      userRequest: ed.user_request || '',
      thumbnails: ed.thumbnails || [],
      imageUrl: toUrl(ed.image_url),
      // Source thumbnail used for the user bubble in recreate /
      // analyze / edit / faceswap flows.
      _userImageUrl: toUrl(ed.user_image_url),
      // Kind-specific renderable payloads (analysis, title ideas, etc.)
      analysis: ed.analysis || null,
      titleIdeas: ed.title_ideas || null,
      isRecreate: !!ed.is_recreate,
      // Pinned for the user-row pre-stitch step below.
      _isUser: isUser,
    }
  })
}

// Stitch persisted user-rows with the source-thumbnail their sibling
// assistant row recorded. The backend stores `user_image_url` on the
// assistant message's extra_data (where the rendering data lives), so
// the user bubble's image has to be copied across after a reload.
function stitchPersistedUserImages(messages) {
  const next = messages.slice()
  for (let i = 0; i < next.length; i++) {
    const m = next[i]
    if (!m._isUser) continue
    const partner = next[i + 1]
    const url = partner && partner.role === 'assistant' ? partner._userImageUrl : null
    if (url) {
      next[i] = { ...m, imageUrl: url }
    }
  }
  return next
}

// Fold the (user, failure-assistant) pair the events route writes for
// every persisted failure into ONE failure entry: copy the user
// content/image into the failure entry's `userText` / `userImageUrl`,
// then drop the user row so the chat doesn't render two siblings
// (the FailedAttemptBlock already shows the user bubble inside the
// same block as the error card).
//
// CRITICAL: the merge is id-based, not adjacency-based.
//
// Earlier implementation walked the input array and folded against
// `next[next.length - 1]` (the previously-emitted item). That only
// works when the input is already in chronological id-ascending
// order, which the backend doesn't formally guarantee — partial
// pages, parallel writes, or any future tweak to the conversation
// route could land messages in a different order, and the failure
// row would silently end up unfolded. The user then sees TWO user
// bubbles around the error card (the standalone server-side one +
// the FailedAttemptBlock's internal copy), with the unmerged
// failure card potentially landing in the wrong chronological slot
// after the downstream id-based render order.
//
// The new logic:
//   1. Sort by numeric id ascending — chronological, monotonic,
//      server-issued (Postgres SERIAL).
//   2. The failure entry's matching user row is the user-role
//      message with the GREATEST id that is STILL LESS THAN the
//      failure entry's id. That's the user message immediately
//      preceding the failure in the chronological sequence,
//      regardless of how the array was originally ordered.
//   3. Fold, drop the user row, carry `_userMessageId` so
//      `renderedMessages` can dedup against an optimistic user-bubble
//      local entry linked to the same server id.
function mergeFailurePairs(messages) {
  const sorted = [...messages].sort((a, b) => {
    const ai = typeof a?.id === 'number' ? a.id : Number.MAX_SAFE_INTEGER
    const bi = typeof b?.id === 'number' ? b.id : Number.MAX_SAFE_INTEGER
    return ai - bi
  })

  // Indices of user-role messages in the sorted array, in id order.
  // Used to find the matching user row for each failure entry by
  // looking backwards from the failure's position. A failure may
  // appear without a partner user row (e.g. the backend wrote only
  // the assistant row, or a future failure-without-user variant) —
  // in that case `pop()` returns nothing and the failure is rendered
  // as-is (its internal user bubble stays hidden behind the empty
  // `userText` check inside FailedAttemptBlock).
  const userIndicesById = []
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]?._isUser) userIndicesById.push(i)
  }

  const droppedIndices = new Set()
  const result = []
  let userCursor = 0

  for (let i = 0; i < sorted.length; i++) {
    if (droppedIndices.has(i)) continue
    const cur = sorted[i]

    if (cur?._kind === 'failure') {
      // Advance `userCursor` to the LAST user-message index that is
      // still less than `i` (i.e. the most recent user message
      // before this failure in the chronological sequence).
      let matchedUserIdx = -1
      while (userCursor < userIndicesById.length && userIndicesById[userCursor] < i) {
        if (!droppedIndices.has(userIndicesById[userCursor])) {
          matchedUserIdx = userIndicesById[userCursor]
        }
        userCursor += 1
      }

      if (matchedUserIdx >= 0) {
        const prior = sorted[matchedUserIdx]
        // Pull user content into the failure entry, drop the user
        // row by remembering its index. FailedAttemptBlock owns the
        // user bubble for failure rows BY DEFAULT (via internal
        // `userText` / `userImageUrl`).
        result.push({
          ...cur,
          userText: cur.userText || prior.content || '',
          userImageUrl: cur.userImageUrl || prior.imageUrl || null,
          _userMessageId: prior.id,
        })
        droppedIndices.add(matchedUserIdx)
        // Also remove the just-emitted user row from `result` if it
        // was already pushed in an earlier iteration. Walking the
        // array linearly means a user row sorted BEFORE the failure
        // has already been emitted; pop it back out.
        for (let j = result.length - 2; j >= 0; j--) {
          if (result[j] === prior) {
            result.splice(j, 1)
            break
          }
        }
        continue
      }
    }

    result.push(cur)
  }

  return result
}

// Monotonic counter so IDs minted in the same millisecond are still unique.
/**
 * Local-only message id minter. Used ONLY for messages produced by the
 * recreate / analyze flows, which don't go through the chat endpoint and
 * therefore have no server-assigned id. Chat-mode messages always use the
 * server's numeric id straight from the API response — no minting needed,
 * no dedupe games.
 */
let _localMsgSeq = 0
function genLocalId(prefix) {
  _localMsgSeq += 1
  return `${prefix}-${Date.now()}-${_localMsgSeq}`
}

/**
 * Highest numeric server-message id in ``messages`` (or ``null`` when
 * the array is empty / all entries have non-numeric ids). Stamped on
 * local-only entries at push time as ``_anchorAfterServerId`` so the
 * renderer can slot them immediately after that anchor — clock-skew-
 * proof ordering because server ids are monotone increasing within
 * a conversation.
 */
function _maxServerIdIn(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null
  let max = null
  for (const m of messages) {
    if (!m) continue
    const id = typeof m.id === 'number' ? m.id : Number(m.id)
    if (Number.isFinite(id) && (max == null || id > max)) max = id
  }
  return max
}

export function ThumbnailGenerator({
  channelId,
  onOpenPersonas,
  onOpenStyles,
  conversationId,
  onConversationCreated,
}) {
  const queryClient = useQueryClient()
  // Access policy: free users with credits can use generate / recreate
  // / analyze / titles directly — the backend charges credits and
  // returns 402 INSUFFICIENT_CREDITS only when the balance hits zero
  // (the paywall interceptor routes that to /pro). Premium features
  // (Edit, Score, One-click fix, Persona, Styles, Max model) keep
  // their own client-side gate via `requirePremium(feature)` below,
  // which checks the `canUse()` flag from usePlanEntitlements.
  const { canUse } = usePlanEntitlements()
  const requirePremium = useCallback(
    (feature, label) => {
      // Subscribers get through; everyone else gets a "premium feature"
      // toast + redirect to /pro. `feature` matches the backend
      // features_json key (edit, score, one_click_fix, personas, styles,
      // max_model). `label` is the human-readable name shown in the
      // toast so users understand WHAT requires upgrading.
      if (canUse?.(feature)) return true
      toast.info(`${label || 'This feature'} is part of Clixa Pro.`, {
        title: 'Upgrade to unlock',
      })
      if (typeof window !== 'undefined') window.location.hash = 'pro'
      return false
    },
    [canUse]
  )

  // Live credit balance — hard-blocks all credit-consuming actions at 0.
  // Reads synchronously from the query cache so even a stale closure sees
  // the latest value — no race window between a 402 and a re-render.
  const { data: creditsData } = useCreditsQuery()
  const totalCredits = useMemo(() => {
    if (!creditsData) return null
    return (
      Number(creditsData.subscription_credits || 0) + Number(creditsData.permanent_credits || 0)
    )
  }, [creditsData])
  const requireCredits = useCallback(() => {
    const cached = queryClient.getQueryData(['billing', 'credits'])
    const live =
      cached != null
        ? Number(cached.subscription_credits || 0) + Number(cached.permanent_credits || 0)
        : totalCredits
    if (live === 0) {
      openCreditsModal()
      return false
    }
    return true
  }, [queryClient, totalCredits])
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
  // Setter is used by the URL preview-fetch effect for any future
  // loading UI (the small preview card was removed); the value itself
  // is currently unread, so leading underscore satisfies the linter.
  const [_recreateFetchingPreview, setRecreateFetchingPreview] = useState(false)
  const [analyzeTitle, setAnalyzeTitle] = useState('')
  const [analyzeSourceMode, setAnalyzeSourceMode] = useState('youtube')
  const [analyzeUrlInput, setAnalyzeUrlInput] = useState('')
  const [analyzeSourceImage, setAnalyzeSourceImage] = useState(null)
  const [analyzePreviewUrl, setAnalyzePreviewUrl] = useState(null)
  const [_analyzeFetchingPreview, setAnalyzeFetchingPreview] = useState(false)
  // Titles flow — text-only Gemini call, no image / persona / style.
  // `titleCount` lets the user pick 4, 8, or 12 ideas per run; pricing
  // is 1 credit per title so the chip on the Send pill always reads
  // "n credits" for n requested.
  const [titleTopic, setTitleTopic] = useState('')
  const [titleCount, setTitleCount] = useState(4)
  const [editSourceMode, setEditSourceMode] = useState('url')
  const [editUrlInput, setEditUrlInput] = useState('')
  const [editDataUrl, setEditDataUrl] = useState(null)
  const [editPreviewUrl, setEditPreviewUrl] = useState(null)
  const editFetchingPreviewRef = useRef(false)
  const [promptImageDataUrl, setPromptImageDataUrl] = useState(null)
  const [promptImageName, setPromptImageName] = useState('')
  // Briefly true while the attach pill plays its shrink-back animation
  // after the user hits ×. Keeps the DOM mounted for ~220 ms so the
  // exit keyframe can finish before React unmounts and the circle button
  // pops back in.
  const [attachPillClosing, setAttachPillClosing] = useState(false)
  const attachPillCloseTimer = useRef(null)
  const [editDialogUrl, setEditDialogUrl] = useState(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editFooterError, setEditFooterError] = useState('')
  // Holds the composite (thumbnail + drawn mask) data URL from the editor
  // so onSubmitFinalize can use it as the user-bubble image in the chat.
  const editMaskPreviewRef = useRef(null)
  // Server-canonical chat thread. Every entry has a numeric server-assigned
  // id. Conversation refetches replace this wholesale — no merges, no
  // dedupe. Submit handlers commit the (user_message, assistant_message)
  // pair returned by the chat endpoint atomically.
  const [messages, setMessages] = useState([])
  // Synchronous mirror of ``messages`` so push helpers (which run
  // inside ``useCallback`` with empty deps for stability) can read
  // the latest server-message list WITHOUT taking it as a dep. Used
  // by ``pushFailureEntry`` and ``pushLocalAssistantMessage`` to
  // stamp ``_anchorAfterServerId`` at push time — the highest
  // server-id known at that moment. The renderer uses that anchor
  // to slot the local entry immediately after the corresponding
  // server message, never relying on wall-clock time (the previous
  // timestamp-based slotting broke under client/server clock skew).
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Mount-time housekeeping for the pending-action localStorage queue:
  // drop tickets older than 30min (the stale-pending sweep on the
  // backend already finalises those rows server-side, so client-side
  // bookkeeping past that point is stale). Runs once per mount.
  useEffect(() => {
    pendingActions.prune()
  }, [])
  // Local-only thread for flows that don't write through the chat endpoint:
  // recreate (regenerateWithPersona) and analyze (rate). These don't have
  // a server record so we keep them in a separate bucket — they survive
  // chat refetches and are rendered AFTER the server messages.
  //
  // Every entry pushed here carries `_conversationId` pinned at push time
  // (see `pushLocalAssistantMessage` / `pushFailureEntry`). The render
  // pipeline (`renderedMessages` below) filters by current `conversationId`
  // so an in-flight job started in conv X stays bound to X even if the
  // user navigates to conv Y mid-flight. When X → Y → back-to-X, the
  // entry is visible again with no re-mount. When a chat is brand-new
  // (`conversationId == null` at push), `handleConversationCreated`
  // rebinds those `null`-tagged entries to the freshly-minted id.
  const [localOnlyMessages, setLocalOnlyMessages] = useState([])
  // Synchronous mirror of `conversationId` for code paths that need to
  // capture the current value at the moment of a state-write (e.g.
  // `pushLocalAssistantMessage` runs during a submit handler — reading
  // React state inside that closure could be stale if the handler was
  // bound before a recent `conversationId` change). The ref is updated
  // in the same effect that drives the chat surface so it never lags
  // behind state.
  const conversationIdRef = useRef(conversationId)
  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])
  const [draft, setDraft] = useState('')
  const [numThumbnails, setNumThumbnails] = useState(1)
  const [numRecreateThumbnails, setNumRecreateThumbnails] = useState(1)
  const [sendError, setSendError] = useState('')
  // Structured metadata for the most recent sendError — lets the footer
  // render a Retry pill only when the error is retryable.
  const [sendErrorMeta, setSendErrorMeta] = useState(null)
  // Per-conversation pending tracking. Each key is String(conversationId) or
  // "null" (for brand-new chats). Multiple conversations can generate
  // simultaneously — each tracks its own pending state independently.
  const [pendingConvIds, setPendingConvIds] = useState(() => new Set())
  const markConvPending = useCallback((convId) => {
    const key = convId == null ? 'null' : String(convId)
    setPendingConvIds((prev) => {
      const n = new Set(prev)
      n.add(key)
      return n
    })
  }, [])
  const clearConvPending = useCallback((convId) => {
    const key = convId == null ? 'null' : String(convId)
    setPendingConvIds((prev) => {
      const n = new Set(prev)
      n.delete(key)
      return n
    })
  }, [])
  // Derived: is the currently-viewed conversation pending?
  const pendingAssistant = pendingConvIds.has(
    conversationId == null ? 'null' : String(conversationId)
  )
  // ─── Submission lock ─────────────────────────────────────────────
  // Hard guard that holds the chat surface in a stable rendered state
  // from the moment the user hits send until the entire response →
  // URL-settle cycle completes. Without this lock the first-message
  // flow is a six-way race: optimistic state updates, the chat job's
  // own status polling, the eager-conversation-create's hash write,
  // the chat-response's hash write (which can disagree with the
  // eager one!), parent setConversationId via hashchange, and the
  // conversation-detail React Query's mount-refetch all happen on
  // overlapping ticks. Any one of them transitioning state through
  // an "empty" intermediate (`conversationId = null`, `messages = []`,
  // `pendingAssistant` flipped a tick early, `isFetching = true`)
  // is enough to paint the centered greeting / skeleton for one
  // frame. While `isSubmittingRef.current` is true:
  //   • the !conversationId / real-switch wipes are skipped
  //   • `isEmptyScreen` is FORCED false (no greeting can render)
  //   • `isHistoryLoading` is FORCED false (no skeleton can render)
  //   • `layoutCentered` is FORCED false (composer stays at bottom)
  // The lock is released TWO requestAnimationFrames after the submit
  // resolves (success or error). Two frames because: frame 1 lets
  // any in-flight state updates from finishLoading / patches commit;
  // frame 2 lets any deferred hashchange events propagate through
  // the parent's setConversationId. By the time the lock drops, the
  // UI is on the final settled (conversationId, messages, localOnly)
  // and the natural render shows the canonical thread.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)
  const submissionUnlockTimerRef = useRef(null)
  // Synchronous mutex shared across every submit handler. The
  // `anyJobInFlight` derived flag from React state can lag a frame
  // behind a rapid double-Enter (React batches state updates, so two
  // keydown events fired in the same tick both observe the pre-submit
  // state and both call the handler). This ref flips synchronously
  // the moment a handler starts, so the second Enter's guard hits a
  // `true` and bails before any state writes / network calls fire.
  //
  // Set true in EVERY submit handler's entry (chat / regenerate /
  // recreate / analyze / titles / retry); reset to false in the
  // matching `finally` block. The textarea onKeyDown handlers also
  // re-check this ref BEFORE calling their handler so Enter never
  // wastes a frame on a redundant call. Pairs with the React-state
  // `anyJobInFlight` (which drives the visual disabled state) — refs
  // can't trigger renders so we need both layers.
  const submitGuardRef = useRef(false)
  // The conversationId the active submission is targeting. Initialized
  // to the current conversationId in `beginSubmission` (null for a
  // brand-new chat, or an existing id for a submit inside a chat).
  // Advances to the chat response's id when `handleConversationCreated`
  // fires from the mutation success path — so the lock follows the
  // expected URL flip without releasing. A `conversationId` that
  // disagrees with this target = user-initiated navigation away from
  // the submission flow, which immediately drops the lock so the
  // destination view (new chat empty state, or a different chat's
  // history) renders without obstruction.
  const submissionTargetRef = useRef(null)
  const beginSubmission = useCallback((targetConvId) => {
    if (submissionUnlockTimerRef.current != null) {
      cancelAnimationFrame(submissionUnlockTimerRef.current)
      submissionUnlockTimerRef.current = null
    }
    submissionTargetRef.current = targetConvId ?? null
    isSubmittingRef.current = true
    setIsSubmitting(true)
  }, [])
  const endSubmission = useCallback(() => {
    // Cancel any prior pending unlock — last writer wins.
    if (submissionUnlockTimerRef.current != null) {
      cancelAnimationFrame(submissionUnlockTimerRef.current)
    }
    submissionUnlockTimerRef.current = requestAnimationFrame(() => {
      submissionUnlockTimerRef.current = requestAnimationFrame(() => {
        submissionUnlockTimerRef.current = null
        submissionTargetRef.current = null
        isSubmittingRef.current = false
        setIsSubmitting(false)
      })
    })
  }, [])
  // Synchronous lock release — used when the user navigates away from
  // the submission's target conversation. The deferred (RAF×2)
  // endSubmission is meant for the success/error settle and is the
  // wrong choice here: we want the destination view to render
  // immediately on this same frame, no two-frame wait under a lock.
  const releaseSubmissionLockImmediate = useCallback(() => {
    if (submissionUnlockTimerRef.current != null) {
      cancelAnimationFrame(submissionUnlockTimerRef.current)
      submissionUnlockTimerRef.current = null
    }
    submissionTargetRef.current = null
    isSubmittingRef.current = false
    setIsSubmitting(false)
  }, [])
  useEffect(() => {
    // Drop the timer on unmount so RAFs don't fire against a torn-down
    // component (the state setter would log a React warning).
    return () => {
      if (submissionUnlockTimerRef.current != null) {
        cancelAnimationFrame(submissionUnlockTimerRef.current)
        submissionUnlockTimerRef.current = null
      }
    }
  }, [])
  // (Removed `pendingMode` — the in-place placeholder carries
  // `_promptMode` directly, so there's no need for a separate
  // top-level state to remember which mode is in flight.)
  // Failed generations are pushed inline into `localOnlyMessages` with
  // `_kind: 'failure'` (see `pushFailureEntry` further down) so they
  // sort chronologically alongside successes. A new request after a
  // failure renders BELOW the failure card, not in a separate "errors"
  // block at the bottom. Removed the prior `failedAttempts` state.
  // (Removed `pendingDone` — the old sibling loader used it to snap the
  // progress bar to 100 before unmount; the in-place loader unmounts on
  // the same commit as the result mounts, so no snap is needed.)
  const finishLoadingRef = useRef(null)
  const promptFileInputRef = useRef(null)
  const recreateFileInputRef = useRef(null)
  const analyzeFileInputRef = useRef(null)
  const recreateFetchRef = useRef(null)
  const analyzeFetchRef = useRef(null)
  const editFetchRef = useRef(null)

  useEffect(() => {
    return () => {
      if (finishLoadingRef.current) clearTimeout(finishLoadingRef.current)
      if (recreateFetchRef.current) clearTimeout(recreateFetchRef.current)
      if (analyzeFetchRef.current) clearTimeout(analyzeFetchRef.current)
      if (editFetchRef.current) clearTimeout(editFetchRef.current)
    }
  }, [])
  const threadRef = useRef(null)
  const messagesEndRef = useRef(null)
  const composerFooterRef = useRef(null)
  const textareaRef = useRef(null)
  const recreateTextareaRef = useRef(null)
  const editFileInputRef = useRef(null)
  const modePaneRef = useRef(null)
  // Greeting shown above the composer on the empty thumbnail screen.
  // Picked ONCE at mount via lazy useState init so it's stable for
  // this session — re-randomises only when the user does a hard
  // refresh / new tab (per spec: "must change when the user refreshes
  // the screen"). Not stored in any persistent state.
  const [emptyGreeting] = useState(
    () => THUMB_EMPTY_GREETINGS[Math.floor(Math.random() * THUMB_EMPTY_GREETINGS.length)]
  )

  // Whether the user has scrolled past the very top of the chat thread.
  // Drives a `.coach-chat-shell--scrolled` modifier class on the chat
  // shell so the floating header trio (model picker, plan callout,
  // credits pill) compacts to a tighter rhythm once content is being
  // read. Default false so first paint shows the expanded "welcome"
  // sizing.
  const [isScrolled, setIsScrolled] = useState(false)
  const modePaneFromHeightRef = useRef(null)

  // Rotating composer hint — rendered as an overlay on top of the
  // textarea so it can fade in/out with `phase` instead of swapping
  // abruptly via the native `placeholder` attribute. Pauses while the
  // user has draft / image content (no point cycling hints they're
  // not seeing).
  const { hint: composerHint, phase: composerHintPhase } = useAnimatedHint(THUMB_COMPOSER_HINTS, {
    paused: !!draft || !!promptImageDataUrl,
  })

  // Latest handleSubmit captured in a ref so the toast's "Retry" action
  // always calls the most recent definition (handleSubmit closes over a
  // lot of state and is rebuilt every render). The ref is refreshed in
  // a no-dep useEffect further down, after `handleSubmit` is in scope.
  const handleSubmitRef = useRef(null)
  // Same trick for the other mode-specific submit handlers — the
  // failure-card retry dispatcher needs to call whichever one matches
  // `entry.mode` without React re-creating the callback every render.
  const handleTitleIdeasSubmitRef = useRef(null)
  const handleRecreateSubmitRef = useRef(null)
  const handleAnalyzeFooterSubmitRef = useRef(null)

  // Errors-as-toasts: any time `sendError` / `editFooterError` becomes
  // truthy, fire a top-right toast and clear the state immediately. The
  // composer used to render an inline red error pill above the bar; that
  // block is gone, the toast is the single source of error UI now.
  useEffect(() => {
    if (!sendError) return
    const canRetry = !!sendErrorMeta?.retryable && !!draft.trim()
    toast.error(sendError, {
      duration: 4000,
      ...(canRetry ? { action: 'Retry', onAction: () => handleSubmitRef.current?.() } : {}),
    })
    setSendError('')
    setSendErrorMeta(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendError])

  useEffect(() => {
    if (!editFooterError) return
    toast.error(editFooterError, { duration: 4000 })
    setEditFooterError('')
  }, [editFooterError])

  const startPending = useThumbnailChatActivityStore((s) => s.startPending)
  const clearPending = useThumbnailChatActivityStore((s) => s.clearPending)
  const markSeen = useThumbnailChatActivityStore((s) => s.markSeen)
  // Reactive pending flag — derived from the server `is_pending` field
  // on the row in the conversations list cache (shared with the Sidebar,
  // so no extra fetch). Optimistically flipped to true by the chat
  // mutation's onMutate; the backend reconciles on success/error.
  const conversationsListQuery = useThumbnailConversationsQuery({ limit: 50 })
  const currentConvRow = useMemo(
    () =>
      conversationId == null
        ? null
        : conversationsListQuery.data?.items?.find(
            (c) => Number(c.id) === Number(conversationId)
          ) || null,
    [conversationsListQuery.data, conversationId]
  )
  const isCurrentConversationPending = Boolean(currentConvRow?.is_pending)
  // `pollWhilePending` exists so a user who navigates AWAY from a chat
  // mid-generation (or reloads the tab) eventually picks up the worker's
  // result via the conversation query's poll. We must NOT poll while
  // THIS tab is actively generating — `pendingAssistant === true` means
  // the chat mutation is in flight here, the result will arrive via the
  // mutation's own job-poll and be hydrated into cache by
  // `linkLocalToServer`. A concurrent conversation-query refetch
  // wholesale-replaces the cache with whatever the server has at that
  // instant (typically `[user_message]` only — the assistant hasn't
  // been persisted yet), tearing the optimistic assistant placeholder
  // off the screen for one paint cycle. Suppressing the poll while
  // this tab owns the generation eliminates that flicker; the
  // server-pending state still gets surfaced via the sidebar list
  // refetch for OTHER tabs / sessions watching this conversation.
  //
  // ALSO poll when the currently-rendered conversation has any
  // pending assistant row — e.g. the user hard-refreshed mid-generate
  // for a recreate/analyze/titles op and the conv-row `is_pending`
  // flag in the sidebar hasn't propagated yet (or expired). The poll
  // fetches the conversation every 4s; when the server-side handler
  // finalises the row (via `pending_message_id` or the stale sweep),
  // the next poll tick lifts the loader.
  const hasPendingAssistantRow = messages.some(
    (m) => m && (m._analyzePending || m._titlesPending || m._promptPending)
  )
  const conversationQuery = useThumbnailConversationQuery(conversationId, {
    pollWhilePending: (isCurrentConversationPending || hasPendingAssistantRow) && !pendingAssistant,
  })
  // Conversations the client minted in this mount (via send-first-message,
  // persistEvent auto-create, or the chat mutation's auto-create). For these
  // we KNOW the only server content is what we just wrote — the post-create
  // refetch has nothing the user is waiting to see, so the "Loading
  // conversation…" skeleton in the message list would always read as a
  // false-flash. We suppress it for any id in this set, which removes the
  // race between `pendingAssistant` / `localOnlyMessages` flipping and
  // `conversationId` updating via the async hashchange event.
  const locallyCreatedConvIdsRef = useRef(new Set())
  const handleConversationCreated = useCallback(
    (id) => {
      if (id != null) locallyCreatedConvIdsRef.current.add(Number(id))
      // If we're mid-submit, the new id IS the submission's target —
      // advance the tracker so the upcoming `conversationId` change
      // (triggered by the parent's hashchange listener) is recognized
      // as the expected URL flip and does NOT release the lock. Only
      // updates while the lock is active; navigation-driven calls to
      // this function (from places that pass through `onConversationCreated`
      // for non-submission reasons) won't accidentally re-target.
      if (isSubmittingRef.current && id != null) {
        submissionTargetRef.current = Number(id)
      }
      // Rebind any local-only entries that were pushed BEFORE the
      // conversation existed (`_conversationId: null`) to the freshly-
      // minted id. Without this, the render filter would hide them
      // forever once `conversationId` transitions null → N — they'd
      // pile up in memory while the user sees an empty thread.
      // Only operates on `null`-tagged rows; entries already bound to
      // a numeric id (jobs that started in a different conversation
      // and are still in flight) are intentionally untouched.
      if (id != null) {
        const numericId = Number(id)
        setLocalOnlyMessages((prev) => {
          let changed = false
          const next = prev.map((m) => {
            if (m._conversationId == null) {
              changed = true
              return { ...m, _conversationId: numericId }
            }
            return m
          })
          return changed ? next : prev
        })
        // Also keep the synchronous ref in sync with the upcoming
        // conversationId flip so any pushes that happen between this
        // callback firing and the React state actually updating use
        // the right id.
        conversationIdRef.current = numericId
      }
      onConversationCreated?.(id)
    },
    [onConversationCreated]
  )
  // Navigation-aware lock release. Watches `conversationId` while a
  // submission is in flight; if it changes to anything OTHER than the
  // active submission target, that's the user navigating away (sidebar
  // click, "New chat", browser back, etc.) — release the lock
  // synchronously so the destination renders without obstruction. The
  // submit continues server-side; its eventual response is still
  // hydrated into the conversation cache (via `linkLocalToServer` and
  // the merge-only `refreshThumbnailConversationCache`), so a later
  // return to that chat shows the result.
  useEffect(() => {
    if (!isSubmittingRef.current) return
    const target = submissionTargetRef.current
    const current = conversationId == null ? null : Number(conversationId)
    if (current === target) return
    releaseSubmissionLockImmediate()
    // With per-conversation pending tracking, we do NOT clear the pending
    // state for the source conversation — it continues generating in the
    // background. The localOnlyMessages placeholder stays pinned to the
    // source conv id; returning to it shows the in-flight loader.
    // We only reset the synchronous guard so the destination chat's
    // submit handlers aren't silently blocked.
    submitGuardRef.current = false
  }, [conversationId, releaseSubmissionLockImmediate])

  // "New Chat" shell event — fired by the Sidebar whenever the user clicks
  // the New Chat button. We listen here because `goToThumbnailConversation(null)`
  // sets `window.location.hash = '#thumbnails'`, but if the hash is ALREADY
  // '#thumbnails' (brand-new chat still being generated before the server
  // returns an id), the browser fires NO hashchange event and the parent's
  // setConversationId never runs — so conversationId stays null while the
  // in-flight local messages are still visible. Listening to the shell event
  // is the only way to catch that case and force-reset the chat surface.
  useEffect(() => {
    return onShellEvent('newChat', () => {
      // Always open a new chat immediately — no confirm dialog. Any in-flight
      // generation for the previous conversation continues server-side; its
      // result hydrates into the conversation cache when the job finishes, so
      // returning to that chat still shows the completed thumbnails. We only
      // clear the null-conv pending state (brand-new chat) and reset the
      // composer surface. Existing-conversation placeholders stay pinned to
      // their _conversationId in localOnlyMessages and are unaffected.
      releaseSubmissionLockImmediate()
      clearConvPending(null)
      submitGuardRef.current = false
      sawMessagesRef.current = false
      hasInitialScrollRef.current = false
      firstRenderedIdRef.current = null
      setMessages([])
      setLocalOnlyMessages((prev) => prev.filter((m) => m && m._conversationId != null))
      setDraft('')
      setSendError('')
      setSendErrorMeta(null)
    })
  }, [releaseSubmissionLockImmediate])

  const chatMutation = useThumbnailChatMutation(handleConversationCreated)
  // (Removed: eager `useCreateThumbnailConversationMutation()` call.
  // The conv is now created exclusively by /chat/submit and the id
  // returned in chatMutation's response — see ensureConversationId
  // below for the full rationale.)
  const loadOlderMutation = useLoadOlderThumbnailMessagesMutation()
  const hasMoreOlder = Boolean(conversationQuery.data?.messages?.has_more)
  const isLoadingOlder = loadOlderMutation.isPending
  const topSentinelRef = useRef(null)
  // Live-updated flag so the IntersectionObserver callback never fires
  // a duplicate request mid-flight (effect deps stay shallow).
  const loadingOlderRef = useRef(false)
  loadingOlderRef.current = isLoadingOlder

  /**
   * Auto-load older messages when the user scrolls to the top of the
   * thread. The detail endpoint returns latest 30 on open; this hook
   * fetches the next page (40) backwards via the `before_id` cursor and
   * preserves scroll position so reading flow isn't disrupted.
   */
  useEffect(() => {
    const sentinel = topSentinelRef.current
    const root = threadRef.current
    if (!sentinel || !root || conversationId == null || !hasMoreOlder) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting)
        if (!visible || loadingOlderRef.current) return

        // Anchor: capture the first currently-rendered message and its
        // offset from the scroll viewport, so after prepend we can
        // re-pin the user's reading position.
        const anchorEl = root.querySelector('.coach-message')
        const anchorOffsetFromTop = anchorEl ? anchorEl.offsetTop - root.scrollTop : 0

        loadOlderMutation.mutate(conversationId, {
          onSettled: () => {
            if (!anchorEl) return
            requestAnimationFrame(() => {
              if (!root || !anchorEl) return
              root.scrollTop = anchorEl.offsetTop - anchorOffsetFromTop
            })
          },
        })
      },
      // 120px headroom so the fetch starts before the sentinel reaches
      // the actual viewport edge — hides the network round-trip behind
      // the user's scroll momentum.
      { root, rootMargin: '120px 0px 0px 0px', threshold: 0.01 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [conversationId, hasMoreOlder, loadOlderMutation])

  // When the user opens (or returns to) a conversation, stamp "seen now" so
  // the unread dot clears. Fires on every conversationId change — cheap.
  useEffect(() => {
    if (conversationId != null) markSeen(conversationId)
  }, [conversationId, markSeen])

  // Auto-clear stale 404 conversations. When a conversation no longer exists
  // on the server (data was reset, row deleted, etc.) we:
  //   1. Remove its detail entry from the RQ cache so it won't flash again.
  //   2. Evict it from every cached conversations-list page.
  //   3. Navigate to a blank new chat so the user isn't stuck on the error.
  useEffect(() => {
    if (!conversationQuery.isError || conversationId == null) return
    const err = conversationQuery.error
    if (!err || (err.status !== 404 && err.code !== 'NOT_FOUND')) return

    const numId = Number(conversationId)
    queryClient.removeQueries({ queryKey: queryKeys.thumbnails.conversation(conversationId) })
    queryClient.setQueriesData({ queryKey: ['thumbnails', 'conversations'] }, (prev) => {
      if (!prev) return prev
      const items = prev.items ?? prev
      if (!Array.isArray(items)) return prev
      const filtered = items.filter((c) => Number(c?.id) !== numId)
      return Array.isArray(prev) ? filtered : { ...prev, items: filtered }
    })
    pushThumbModeHash(null, null)
  }, [conversationQuery.isError, conversationQuery.error, conversationId, queryClient])

  /**
   * Ensure the conversation row exists server-side BEFORE the chat
   * job runs. On a brand-new chat (no `existingId`) we POST to
   * `/api/thumbnails/conversations` synchronously, get back the real
   * conversation row, and:
   *   1. Add the new id to `locallyCreatedConvIdsRef` so the
   *      history-loading skeleton stays suppressed for the
   *      post-create refetch (we already know it's empty).
   *   2. Push the new id into the parent's URL via
   *      `handleConversationCreated → onConversationCreated`. The
   *      hashchange round-trips back as a new `conversationId` prop.
   *   3. Return the id so `handleSubmit` can pass it to the chat
   *      mutation.
   *
   * Result: from the user's perspective the chat appears in the
   * sidebar AND the URL the instant they hit send. A hard refresh
   * preserves the URL, fetches the conversation (which by then has
   * the user_message persisted by /chat/submit), and shows the
   * pending state. The chat job continues server-side regardless
   * of what the client does.
   *
   * Best-effort: if the create call fails (network blip, old
   * backend), `ensureConversationId` falls through to `null` and
   * the chat endpoint auto-creates the conv on submit — same
   * outcome, just without the immediate sidebar / URL update.
   */
  // ensureConversationId — formerly an eager-create against POST
  // /api/thumbnails/conversations, now a thin pass-through.
  //
  // Why the rewrite: eagerly creating an empty conversation before the
  // chat job ran was the source of the "two chats with the same
  // message, one has the response" bug. /chat/submit's
  // create_or_get_conversation either:
  //   * uses the conv_id we sent (one row, happy path), OR
  //   * silently creates a NEW conv when our id can't be resolved (any
  //     transient lookup failure, ownership mismatch, malformed
  //     response payload, etc.) — and then the empty conv we pre-created
  //     is left orphaned in the sidebar alongside the real one.
  //
  // Conversations are now created EXCLUSIVELY by POST /chat/submit.
  // For new chats the frontend submits with conversation_id=null/undefined
  // and the backend mints the row, persists the user_message, and
  // returns the canonical id atomically — which is then propagated to
  // the URL via the chatMutation's onSuccess → handleConversationCreated
  // wiring (see thumbnailQueries.js useThumbnailChatMutation).
  //
  // Tradeoff: a hard refresh DURING the ~sub-second window between the
  // user pressing send and /chat/submit returning loses the URL state.
  // Acceptable — the conversation still completes server-side and
  // appears in the sidebar after the worker finishes. The previous
  // refresh-survival was paid for by the duplicate-conversation bug,
  // which the user reports as far worse.
  const ensureConversationId = useCallback(
    async (existingId) => (existingId ? existingId : null),
    []
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

  // Tab options recomputed only when the user's edit entitlement
  // changes — free users see a crown badge on the Edit tab; paid
  // users see no badge. Stable array reference keeps ThumbPillTabs'
  // memo from invalidating on every parent re-render.
  const canUseEdit = !!canUse?.('edit')
  const thumbModeOptions = useMemo(
    () =>
      THUMB_GEN_SUB_TABS.map((t) => ({
        value: t.id,
        label: t.label,
        icon: t.icon,
        premium: t.id === 'edit' && !canUseEdit,
      })),
    [canUseEdit]
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
      // Full reset on "New Chat" / blank chat screen — but only while
      // the submission lock is held AND scoped to this conversation
      // (target == null). The lock is released the moment the user
      // navigates away from the submission target (see the
      // navigation-aware effect above), so when this branch fires
      // because of a user-initiated "New chat" click, the lock is
      // already off and the reset runs normally. The remaining lock
      // case — `target == null` (brand-new chat in flight) and
      // conversationId still null — must keep the optimistic loader
      // visible.
      if (isSubmittingRef.current && submissionTargetRef.current == null) return
      setMessages([])
      // Drop ONLY entries pinned to the brand-new-chat view (null) —
      // background jobs that started in a real conversation are
      // tagged with a numeric `_conversationId` and must survive a
      // "New chat" click so the user can return to that conversation
      // and still see the in-flight placeholder. The render filter
      // already hides those entries while we're on null; the wipe
      // here is purely about clearing per-session draft state for
      // the new-chat surface.
      setLocalOnlyMessages((prev) => prev.filter((m) => m && m._conversationId != null))
      setDraft('')
      setSendError('')
      setSendErrorMeta(null)
      clearConvPending(null)
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
    // Server is the single source of truth for chat-thread messages.
    // Every fetch wholesale-replaces local `messages` — no merges, no
    // optimistic-id reconciliation. Submit handlers append the
    // server-returned (user_message, assistant_message) pair directly,
    // so by the time the next refetch lands the API already has them
    // and replays them in the same order.
    //
    // Belt-and-suspenders: only adopt server data if it belongs to the
    // conversation the user is currently viewing. Stale fetches landing
    // late (or a residual placeholder from React Query) must not splash
    // the previous chat's messages onto a freshly opened thread.
    const serverConvId = conversationQuery.data?.conversation?.id
    const matchesCurrent = serverConvId == null || Number(serverConvId) === Number(conversationId)
    if (matchesCurrent && conversationQuery.data?.messages?.items) {
      const built = buildMessagesFromApi(conversationQuery.data.messages.items)
      // Run stitch FIRST so user-row images get folded into their
      // user bubbles, then fold (user, failure) pairs into single
      // failure entries for FailedAttemptBlock to render.
      const next = mergeFailurePairs(stitchPersistedUserImages(built))
      // Silent-reconciliation guard: skip the setMessages call if the
      // computed list is unchanged in any rendered field. Otherwise
      // React Query's reference-equality identity flips on every
      // successful refetch (even a no-op poll tick), which triggers a
      // re-render and scroll-to-bottom even though nothing visible
      // changed. The previous version compared on id-sequence only,
      // which mis-classified content updates (e.g. a pending row
      // finalising) as "same" and left the loader stuck on screen
      // after a poll-driven update. This version compares the fields
      // that actually affect what the user sees — id + content +
      // pending flags + result payloads — so genuine updates pass
      // through immediately while idle polls stay silent.
      setMessages((prev) => {
        if (prev.length !== next.length) return next
        for (let i = 0; i < prev.length; i++) {
          if (prev[i] === next[i]) continue
          const a = prev[i] || {}
          const b = next[i] || {}
          if (a.id !== b.id) return next
          if (a.content !== b.content) return next
          if (a.imageUrl !== b.imageUrl) return next
          if (a.analysis !== b.analysis) return next
          if (a.titleIdeas !== b.titleIdeas) return next
          if (a.thumbnails !== b.thumbnails) return next
          if (a._analyzePending !== b._analyzePending) return next
          if (a._promptPending !== b._promptPending) return next
          if (a._titlesPending !== b._titlesPending) return next
          if (a._kind !== b._kind) return next
        }
        return prev
      })
    } else if (!matchesCurrent || !conversationQuery.data) {
      // Defensive wipe: only fire if the current state isn't already
      // empty. Otherwise a brief React Query placeholder window causes
      // setMessages([]) → re-render with no actual change.
      setMessages((prev) => (prev.length === 0 ? prev : []))
    }
  }, [conversationId, conversationQuery.data])

  // Conversation switch wipes local-only messages — they belong to the
  // session the user just left. Without this the recreate/analyze
  // bubbles from one conversation would bleed into the next.
  //
  // CRITICAL: only wipe on a REAL conversation switch (between two
  // non-null ids) or on go-to-empty (any → null). The null → N
  // transition is a CREATE — it fires when ensureConversationId or
  // persistEvent's auto-create updates `conversationId` for the first
  // time. The user is mid-flow with an optimistic local message
  // already on screen; wiping `localOnlyMessages` here would cause
  // the message to disappear briefly until the server-canonical
  // version lands via the cache. The ChatHistorySkeleton suppression
  // for locally-created conversations (see `isLocallyCreatedConversation`
  // below) is what guarantees the post-first-message refetch never
  // flashes a fullscreen "Loading conversation…" loader.
  const prevConversationIdRef = useRef(conversationId)
  useEffect(() => {
    const prev = prevConversationIdRef.current
    prevConversationIdRef.current = conversationId
    // null → N (creation): keep the optimistic local content visible
    // AND keep the sawMessagesRef latch — the user is mid-flow with
    // a placeholder loader on screen, and wiping either of these
    // creates a one-paint window the empty-state checks can resolve
    // true through, flashing the greeting back. Initial mount
    // (prev === conversationId): nothing to wipe.
    if (prev == null || prev === conversationId) return
    // A "real switch" (N → M, or N → null) usually means the user
    // navigated — pick a different chat from the sidebar, hit "New
    // chat", etc. — and we want to drop stale per-session content so
    // the destination chat gets a clean slate.
    //
    // EXCEPTION: this same effect also fires when the chat mutation
    // resolves with a `conversation_id` that differs from the
    // submission target (typically the brand-new-chat case where the
    // backend mints the id and we go null → respondedId). The lock is
    // still active in that window, and the navigation-aware effect
    // saw conversationId match the target (because
    // `handleConversationCreated` advanced the target first), so the
    // lock did NOT release. Block the wipe so the optimistic
    // user_local stays mounted through the URL flip. Any OTHER
    // conversationId change while the lock is held — i.e. user-
    // initiated navigation — already released the lock synchronously
    // by the time this effect runs, so this branch lets the wipe
    // proceed.
    if (isSubmittingRef.current) return
    // Don't wipe `localOnlyMessages` on conversation switch. Every
    // entry carries `_conversationId` pinned at push time and the
    // `renderedMessages` filter only shows entries matching the
    // current view, so cross-conversation pollution is impossible.
    // Wiping here would erase in-flight optimistic placeholders for
    // background jobs the user just navigated away from — when they
    // return to that conversation we want the still-loading card to
    // be exactly where they left it. Entries naturally self-clean
    // through their handler's success/failure path (patch / filter
    // / linkLocalToServer); long-running tabs accumulate a small
    // amount of harmless residue that hard-refresh clears.
    sawMessagesRef.current = false
    hasInitialScrollRef.current = false
    firstRenderedIdRef.current = null
  }, [conversationId])

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
      clearConvPending(conversationId)
      markSeen(conversationId)
    }
  }, [isCurrentConversationPending, conversationQuery.data, conversationId, clearPending, markSeen])

  // The skeleton ("Loading conversation…") is for FIRST-OPEN of an
  // EXISTING conversation only — the case where we're navigating to a
  // chat that has server messages we haven't fetched yet. We suppress
  // it whenever any of these are true:
  //
  //   * `pendingAssistant` / `localOnlyMessages.length > 0` — the user
  //     already has visible local content (in-flight prompt placeholder,
  //     analyze / titles / edit / failure cards) and a fullscreen
  //     skeleton would read as a page reset.
  //   * The current `conversationId` was minted by THIS client during
  //     this mount (send-first-message, persistEvent / chat auto-create).
  //     The post-create refetch has nothing the user is waiting to see,
  //     so the skeleton would always be a false-flash. Tracking this
  //     explicitly via `locallyCreatedConvIdsRef` removes the race
  //     between local-state flips and the async hashchange that updates
  //     `conversationId` — the ref is populated synchronously in the
  //     same call that triggers the hash update, so by the time
  //     `conversationId` flips here it is already in the set.
  const hasInFlightOrLocalContent = pendingAssistant || localOnlyMessages.length > 0
  // Single-job lock: every submit handler — chat, regenerate, persona
  // regen, analyze, titles, edit — gates on this flag and blocks while
  // ANY job (in this conversation OR another) is in flight. Earlier
  // versions tracked chat-mode separately from the in-place pending
  // modes (titles / analyze), which let the user kick off titles while
  // a thumbnail generation was running — that scenario exposed real
  // race conditions in the optimistic-state pipeline. Until the
  // parallel-job machinery is fully reworked, the safe behavior is
  // one-job-at-a-time across the board: composer disabled, submit
  // handlers no-op'd, retry buttons grayed.
  //
  // Sources of "in flight":
  //   • `pendingAssistant`            — chat / regenerate / persona regen
  //   • `_promptPending` placeholder  — same modes (redundant but safe)
  //   • `_titlesPending` placeholder  — title-ideas mode
  //   • `_analyzePending` placeholder — analyze-score mode
  //
  // IMPORTANT: only check placeholders pinned to the CURRENT conversation.
  // A _promptPending entry for conversation 107 must not lock the New Chat
  // composer (conversationId=null) — the user should be able to start a
  // fresh generation while the old one finishes in the background.
  const anyJobInFlight =
    pendingAssistant ||
    localOnlyMessages.some((m) => {
      if (!m) return false
      if (!(m._promptPending || m._titlesPending || m._analyzePending)) return false
      const pinned = m._conversationId
      if (conversationId == null) return pinned == null
      return pinned != null && Number(pinned) === Number(conversationId)
    })
  const isLocallyCreatedConversation =
    conversationId != null && locallyCreatedConvIdsRef.current.has(Number(conversationId))
  // The submission lock force-suppresses the history-loading skeleton
  // for the entire first-message flow. Even with the other guards in
  // place, a conversation-detail refetch landing while the URL is
  // mid-transition can briefly flip `isPending` true; gating on the
  // lock removes that paint window entirely.
  const isHistoryLoading =
    !isSubmitting &&
    conversationId != null &&
    (conversationQuery.isPending || conversationQuery.isPlaceholderData) &&
    !hasInFlightOrLocalContent &&
    !isLocallyCreatedConversation
  // Combined render list: server-canonical chat thread first (sorted by
  // numeric server id), then local-only recreate / analyze results
  // appended in the order they happened. The two buckets never overlap
  // by id (server ids are numeric, local-only ids are tagged strings).
  // `renderedMessages` is the single ordered list the chat thread
  // walks. Two-source rule:
  //   1. Server-canonical `messages` come first (sorted by numeric id).
  //   2. Local-only optimistic + non-chat results + failures append
  //      after, in insertion order.
  //
  // Cross-source dedup: when a local optimistic entry has been bound
  // to its server twin (via `linkLocalToServer`, which sets
  // `_serverMessageId`), we filter that server id out of the
  // server-list — the local entry is the visible one and is keyed by
  // its stable local id, so there's no remount on bind. On
  // conversation switch both lists are wiped; the next refetch
  // populates `messages` with server-canonical truth and there are
  // no local entries to dedup against, so the natural rebuild is
  // clean.
  const renderedMessages = useMemo(() => {
    // Build two lookup structures from the local-only entries:
    //   1. `linkedServerIds` — server message ids that have a local
    //      optimistic twin. Server entries with these ids are filtered
    //      out so the optimistic entry (keyed by its stable local id)
    //      is the visible one, no remount on bind.
    //   2. `linkedUserMsgToLocal` — server `user_message.id` → the
    //      local optimistic user-bubble entry. Used to re-position
    //      that local entry into the chronological slot of a merged
    //      failure row (where the user_message was folded by
    //      `mergeFailurePairs`). Without this re-positioning the
    //      failure card would render above the user bubble — wrong
    //      visual order — because local entries are otherwise
    //      appended after all server entries.
    // Filter local entries down to ones bound to the conversation
    // currently in view. Entries with `_conversationId == null` are
    // pre-rebind (brand-new chat in flight) and only show on the
    // null view; entries with a numeric id only show when that id
    // matches `conversationId`. A job started in conv X stays bound
    // to X across navigations — the user sees its placeholder when
    // they return, and a different conversation's view is never
    // polluted by another conversation's in-flight content.
    const visibleLocalOnly = localOnlyMessages.filter((m) => {
      if (!m) return false
      const pinned = m._conversationId
      if (pinned == null) return conversationId == null
      if (conversationId == null) return false
      return Number(pinned) === Number(conversationId)
    })

    const linkedServerIds = new Set()
    const linkedUserMsgToLocal = new Map()
    for (const m of visibleLocalOnly) {
      if (!m || m._serverMessageId == null) continue
      linkedServerIds.add(m._serverMessageId)
      // Optimistic failure-entry locals (from `pushFailureEntry`) get
      // their own slot below — they aren't candidates for user-bubble
      // re-positioning.
      if (m._kind !== 'failure') {
        linkedUserMsgToLocal.set(m._serverMessageId, m)
      }
    }

    const result = []
    const consumedLocalIds = new Set()
    // `messages` is already id-sorted by `mergeFailurePairs` on every
    // write, so the natural iteration order here IS chronological —
    // no extra sort needed. Iterating in id order is the contract that
    // makes failure rows land in their correct chronological slot
    // (highest id = newest = bottom of the list).
    for (const m of messages) {
      // Server entry has an optimistic twin keyed on its own id — skip;
      // the local entry will render in its own slot below.
      if (linkedServerIds.has(m.id)) continue
      // Merged failure entry whose underlying user_message is linked:
      // insert the user_local at this chronological position and mark
      // the failure entry so its internal user bubble doesn't render.
      // Net effect: ONE user bubble (the kept optimistic one, same
      // React key as the loader phase — no remount, no enter-animation
      // re-trigger), followed by the failure card.
      if (m._kind === 'failure' && m._userMessageId != null) {
        const userLocal = linkedUserMsgToLocal.get(m._userMessageId)
        if (userLocal) {
          result.push(userLocal)
          consumedLocalIds.add(userLocal.id)
          result.push({ ...m, _skipUserBubble: true })
          continue
        }
      }
      result.push(m)
    }
    // Hardening pass: place local entries that don't have a server
    // twin yet into the CHRONOLOGICAL slot determined by their
    // ``_anchorAfterServerId`` (snapshotted at push time — the
    // highest server-message id known when the local entry was
    // pushed). This is the bug-prevention contract:
    //
    //   * Server ids are monotone increasing within a conversation.
    //     If a local entry was pushed when the latest server id was
    //     N, it MUST render after the server entry with id=N and
    //     before any server entry with id > N. No exceptions.
    //
    //   * Wall-clock time is NOT used. The previous timestamp-based
    //     slotting broke under client/server clock skew — a local
    //     failure with ``createdAt = Date.now()`` from a client
    //     whose clock ran behind the server's would have an
    //     "older" timestamp than every prior server failure (whose
    //     ``createdAt`` came from server time), and slot at the
    //     TOP of the list. This anchor approach uses the server's
    //     own id sequence, which doesn't drift.
    //
    //   * Multiple locals with the same anchor preserve their
    //     ``localOnlyMessages`` insertion order (user_local then
    //     local_failure). The grouping below maintains this.
    //
    //   * Locals whose anchor isn't in the current result (rare —
    //     conversation reset, hard-refresh during in-flight push)
    //     fall through to tail-append. Same safe fallback as the
    //     defensive path in the old code.

    // Group unconsumed locals by their anchor id, in insertion order.
    const localsByAnchor = new Map()
    const orphanLocals = []
    for (const m of visibleLocalOnly) {
      if (consumedLocalIds.has(m.id)) continue
      const anchor = m._anchorAfterServerId
      if (anchor == null) {
        orphanLocals.push(m)
        continue
      }
      if (!localsByAnchor.has(anchor)) localsByAnchor.set(anchor, [])
      localsByAnchor.get(anchor).push(m)
    }

    // Walk the result list once. After emitting each server entry,
    // append any locals anchored after its id. The result is a
    // single sweep, O(n), insertion-order preserving.
    const final = []
    for (const e of result) {
      final.push(e)
      const eid = e && typeof e.id === 'number' ? e.id : null
      if (eid != null && localsByAnchor.has(eid)) {
        for (const local of localsByAnchor.get(eid)) final.push(local)
        localsByAnchor.delete(eid)
      }
    }
    // Locals whose anchor is null (brand-new chat) → tail append.
    for (const m of orphanLocals) final.push(m)
    // Locals whose anchor id wasn't found in the result list (the
    // anchor server message was dropped — e.g. conversation refetch
    // returned a different slice). Tail append in their insertion
    // order so they don't get silently lost.
    for (const arr of localsByAnchor.values()) {
      for (const m of arr) final.push(m)
    }
    return final
  }, [messages, localOnlyMessages, conversationId])

  // Latch: once we've EVER rendered a message in this mount, the empty
  // screen never comes back unless the user explicitly switches to a
  // different (or null) conversation. Without this latch, a transient
  // state-tear during the first-message → conversation-create →
  // server-refetch cycle (e.g. `messages` momentarily empty between
  // `linkLocalToServer` and the conversation-refetch landing the
  // canonical rows, or `pendingAssistant` flipping false a tick before
  // the refetch lands) flashes the greeting back onto the screen —
  // which the user reads as "the screen reset between sending and
  // getting the reply". Latch flips back to false on a real
  // conversation switch (see effect below).
  const sawMessagesRef = useRef(false)
  if (renderedMessages.length > 0 || pendingAssistant) {
    sawMessagesRef.current = true
  }
  // True after the first instant snap-to-bottom on conversation open.
  // Resets on conversation switch so each new conversation starts at bottom instantly.
  const hasInitialScrollRef = useRef(false)
  // Tracks the ID of the first (oldest-visible) rendered message. When it
  // changes we know older messages were prepended — skip scroll-to-bottom and
  // let overflow-anchor: auto on .coach-thread keep the user's position stable.
  const firstRenderedIdRef = useRef(null)
  // NOTE: the latch is wiped from the `prevConversationIdRef` effect
  // above (alongside `setLocalOnlyMessages([])`) so the two wipes share
  // one "is this a REAL chat switch?" decision. Wiping unconditionally
  // on every `conversationId` change — as we did previously — also
  // wiped on the null → newId transition that fires when this tab's
  // own first-message submit auto-creates a conversation, opening a
  // one-paint window where the empty-state checks could resolve true
  // and flash the greeting.

  // Empty greeting + centered composer are ONLY for the "no chat yet"
  // URL — `#thumbnails` with no `?id=`. Once a conversation id exists,
  // whether the user navigated to it or this tab just minted it on
  // first-message send, the empty state must never re-appear: the
  // optimistic content (user bubble + loader card) is the visible truth
  // and any single-frame window where renderedMessages is briefly
  // empty (a stale `messages` array between server-fetch landings, a
  // racing `pendingAssistant` flip, etc.) would otherwise flash the
  // greeting back onto the screen for one paint and read as the chat
  // "resetting". Hard-gating on `conversationId == null` makes those
  // race conditions visually invisible — the latch + pendingAssistant
  // checks below are kept as belt-and-suspenders for the
  // conversationId-stays-null case.
  const isEmptyScreen =
    !isSubmitting &&
    conversationId == null &&
    !isHistoryLoading &&
    renderedMessages.length === 0 &&
    !pendingAssistant &&
    !sawMessagesRef.current
  const layoutCentered = isEmptyScreen || isHistoryLoading

  // Auto-scroll on new messages or when a job kicks off / lands. Tab
  // changes (`thumbMode`) deliberately don't trigger a scroll: the
  // message list is conversation history and shouldn't move when the
  // user is just toggling the composer's mode chip. The composer's
  // height changes are absorbed by the ResizeObserver below that
  // updates `--coach-composer-stack-px`, so the bottom of the list
  // remains visible even as the toolbar grows/shrinks.
  //
  // Hardening: depend on ``renderedMessages.length`` (the VISIBLE row
  // count) rather than the raw ``messages`` / ``localOnlyMessages``
  // arrays. The reconciliation pass that runs when server messages
  // land after ``linkLocalToServer`` adds rows to ``messages`` that
  // are dedup'd away — visible row count unchanged but the old
  // dep array fired a phantom scroll. This dep tracks the actual
  // user-visible delta only, so the chat surface no longer jumps
  // during background cache updates.
  // useLayoutEffect fires synchronously after DOM mutations but BEFORE the
  // browser paints — the user never sees an intermediate "messages at top"
  // frame, even on hard refresh. useEffect would fire after paint, producing
  // the visible scroll-from-top the user reported.
  useLayoutEffect(() => {
    const el = messagesEndRef.current
    if (!el) return

    // Detect whether older messages were prepended (load-older page) by
    // checking if the first visible message ID changed. When it does, the
    // user is reading history and must not be disturbed — overflow-anchor:auto
    // on .coach-thread keeps their position stable natively.
    const firstId = renderedMessages.length > 0 ? (renderedMessages[0]?.id ?? null) : null
    const prevFirstId = firstRenderedIdRef.current
    firstRenderedIdRef.current = firstId
    if (prevFirstId != null && firstId !== prevFirstId) return

    if (!hasInitialScrollRef.current) {
      // Only snap once there are messages to scroll to; skip the loading state
      // where renderedMessages is still empty (messagesEndRef is at the top).
      if (renderedMessages.length === 0 && !pendingAssistant) return
      el.scrollIntoView({ behavior: 'instant', block: 'end' })
      hasInitialScrollRef.current = true
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [renderedMessages.length, pendingAssistant])

  // Mobile soft-keyboard handling. When the keyboard opens, the visual
  // viewport shrinks but the layout viewport (window.innerHeight) does
  // not — so the composer footer stays at its old position and the
  // bottom of the page is hidden behind the keyboard. We measure the
  // visualViewport height delta and expose it as `--clixa-keyboard-px`
  // on the document root so any element that needs to lift over the
  // keyboard can read it. The composer wrap's bottom-padding rule
  // (in ThumbnailGenerator.css) consumes this var.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const vv = window.visualViewport
    if (!vv) return undefined
    const root = document.documentElement
    let raf = 0
    const apply = () => {
      raf = 0
      const delta = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--clixa-keyboard-px', `${Math.round(delta)}px`)
    }
    const onChange = () => {
      if (raf) return
      raf = window.requestAnimationFrame(apply)
    }
    apply()
    vv.addEventListener('resize', onChange)
    vv.addEventListener('scroll', onChange)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      vv.removeEventListener('resize', onChange)
      vv.removeEventListener('scroll', onChange)
      root.style.removeProperty('--clixa-keyboard-px')
    }
  }, [])

  // Track whether the chat thread has scrolled away from its top edge.
  // The 8px threshold means a user has to genuinely *start* reading
  // before the header collapses — accidental wheel ticks at the top
  // don't toggle the state. The listener is rAF-throttled so a fast
  // scroll never overwhelms the React commit queue.
  useEffect(() => {
    const root = threadRef.current
    if (!root) return
    let raf = 0
    const update = () => {
      raf = 0
      const next = root.scrollTop > 8
      setIsScrolled((prev) => (prev === next ? prev : next))
    }
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(update)
    }
    update()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      root.removeEventListener('scroll', onScroll)
    }
    // `conversationId` is in the deps because switching conversations
    // re-mounts the threadRef contents from the placeholder cache,
    // which can put us back at scrollTop 0 and we want the header
    // to snap back to its expanded shape.
  }, [conversationId])

  const openThumbLightbox = useCallback((url, title) => {
    if (!url) return
    setLightbox({ url, title: title || 'Thumbnail' })
  }, [])

  // Open the AI region editor pre-loaded with an existing generated
  // thumbnail — invoked from the small pencil button on each card.
  const openEditorForThumbnail = useCallback(
    (url) => {
      if (!url) return
      if (!requirePremium('edit', 'Edit')) return
      setEditDialogUrl(url)
      setShowEditDialog(true)
    },
    [requirePremium]
  )

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

  // Call on successful API completion. Clears the per-conversation pending
  // flag for the conversation that was generating. The loader is no longer
  // a sibling — it lives inside the assistant card and is unmounted by the
  // `_promptPending: false` patch the caller already applied before this runs.
  const finishLoading = useCallback(
    (convId) => {
      if (finishLoadingRef.current) {
        clearTimeout(finishLoadingRef.current)
        finishLoadingRef.current = null
      }
      clearConvPending(convId)
    },
    [clearConvPending]
  )

  // Textarea auto-resize — SIMPLE version. `height: auto` measures the
  // natural height in the same layout pass; we immediately set the final
  // pixel value. No transition on the textarea itself — SmoothHeight's
  // outer transition handles the visual smoothness at the pill level.
  // Running two competing height animations (textarea + SmoothHeight)
  // on every keystroke caused visible jitter on the whole composer.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const target = Math.max(28, Math.min(el.scrollHeight, 140))
    el.style.height = `${target}px`
    el.style.overflow = target >= 140 ? '' : 'hidden'
  }, [draft])

  useLayoutEffect(() => {
    const el = recreateTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const target = Math.max(28, Math.min(el.scrollHeight, 140))
    el.style.height = `${target}px`
    el.style.overflow = target >= 140 ? '' : 'hidden'
  }, [recreateDraft])

  // YouTube → thumbnail extraction is now credit-only access: any
  // signed-in user (free or paid) can paste a YouTube URL and see the
  // preview. The actual recreate / analyze / edit submit still hits
  // the credit gate on the backend; the preview itself is free.
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
          if (!token) {
            setEditPreviewUrl(null)
            return
          }
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
    // Warm the browser's HTTP cache for any freshly-generated thumbnail
    // URLs. By the time the user scrolls down to see the card or opens
    // the lightbox, the image is already decoded — the card swaps from
    // a blank `<LazyImg>` placeholder to a fully-loaded image without a
    // visible fetch. Only the NEW message's images are prefetched;
    // older messages stay lazy-loaded by `LazyImg` to keep RAM flat.
    const prefetchUrls = new Set()
    if (assistant.imageUrl) prefetchUrls.add(assistant.imageUrl)
    if (Array.isArray(assistant.thumbnails)) {
      for (const t of assistant.thumbnails) {
        if (t?.image_url) prefetchUrls.add(t.image_url)
      }
    }
    for (const url of prefetchUrls) {
      if (typeof url !== 'string' || !url || url.startsWith('data:')) continue
      try {
        const img = new Image()
        img.decoding = 'async'
        img.src = url
      } catch (_) {
        /* ignore */
      }
    }

    // Recreate / analyze / titles / edit flows don't go through the
    // chat endpoint, so their results live in `localOnlyMessages`
    // (rendered after the server-canonical `messages`). IDs are
    // local-only strings — these messages never collide with server
    // numeric ids. Caller receives `{ userId, assistantId }` so it
    // can later call `linkLocalToServer` after the persist round-trip
    // succeeds — that tags this entry with its `_serverMessageId` so
    // the dedup pass in `renderedMessages` filters out the duplicate
    // server entry that arrives via the conversation refetch.
    const userId = genLocalId('local-user')
    const assistantId = assistant.id ?? genLocalId('local-assistant')
    // Pin the conversation id at the exact moment of push so a
    // background job that finishes after the user has navigated away
    // still maps to the conversation it was started in. `null` means
    // "brand-new chat — rebind when the server mints the id" (handled
    // by `handleConversationCreated` further down). Numeric ids are
    // stable across the rest of the entry's lifetime.
    const pinnedConvId = conversationIdRef.current
    // Compute a server-id anchor: the highest numeric id in the
    // server-canonical message list at this exact moment. The
    // renderer slots this local entry IMMEDIATELY AFTER that anchor's
    // position — clock-skew-proof because server ids are monotone
    // increasing per conversation. ``null`` when no server messages
    // exist yet (brand-new chat); in that case the renderer
    // tail-appends, which is the correct position because there's
    // nothing else in the conversation.
    const anchorAfter = _maxServerIdIn(messagesRef.current)
    setLocalOnlyMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: 'user',
        content: userContent,
        imageUrl: assistant.userImageUrl || null,
        _conversationId: pinnedConvId,
        _anchorAfterServerId: anchorAfter,
        _optimistic: true,
      },
      {
        id: assistantId,
        role: 'assistant',
        content: assistant.content || '',
        thumbnails: assistant.thumbnails || [],
        imageUrl: assistant.imageUrl || null,
        userRequest: assistant.userRequest || userContent,
        isRecreate: assistant.isRecreate || false,
        analysis: assistant.analysis || null,
        titleIdeas: assistant.titleIdeas || null,
        // For the title-mode in-place pending pattern: caller can pass
        // `_titlesPending: true` + `titleIdeasCount` to render skeleton
        // rows inside the same card; later patches replace those with
        // the real titles via `patchLocalAssistantMessage`. The card
        // itself never unmounts.
        _titlesPending: !!assistant._titlesPending,
        titleIdeasCount: assistant.titleIdeasCount || null,
        // Same pattern for analyze: push placeholder with
        // `_analyzePending: true` immediately on submit; patch with
        // the real `analysis` when /rate returns. Loader and result
        // share one mounted card so they can never both render.
        _analyzePending: !!assistant._analyzePending,
        // Prompt / recreate in-place pending: caller pushes a
        // placeholder with `_promptPending: true` + `_promptMode` +
        // `_promptCount`; the assistant card renders the existing
        // <ThumbnailGenFill> loader inside the SAME mounted node and
        // crossfades to the populated thumbnails when the API patches
        // `_promptPending: false` + `content` + `thumbnails`. This
        // replaces the old sibling-loader block that used to flash
        // on first message.
        _promptPending: !!assistant._promptPending,
        _promptMode: assistant._promptMode || null,
        _promptCount: assistant._promptCount || null,
        _conversationId: pinnedConvId,
        _anchorAfterServerId: anchorAfter,
        _optimistic: true,
      },
    ])
    return { userId, assistantId }
  }, [])

  // Patch fields on an existing local-only message. Used by the title
  // in-place pending pattern: push a placeholder with skeleton state,
  // then patch in the real titleIdeas when the API returns. The card
  // stays mounted across the swap so the transition is a smooth
  // content crossfade instead of a sibling unmount/remount.
  const patchLocalAssistantMessage = useCallback((assistantId, partial) => {
    if (!assistantId || !partial) return
    setLocalOnlyMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, ...partial } : m))
    )
  }, [])

  // Bind a local optimistic pair to its server-canonical pair. After
  // the persist POST returns, mark each local entry with
  // `_serverMessageId` so `renderedMessages` knows to skip the server
  // duplicate that arrives via the conversation refetch. Also hydrate
  // the React Query conversation cache + broadcast cross-tab so other
  // tabs / navigate-back surfaces converge to the server-canonical
  // truth without an extra fetch.
  const linkLocalToServer = useCallback(
    (localIds, response, conversationIdHint) => {
      if (!localIds || !response) return
      const userServerId = response.user_message?.id ?? null
      const assistantServerId = response.assistant_message?.id ?? null
      setLocalOnlyMessages((prev) =>
        prev.map((m) => {
          if (m.id === localIds.userId && userServerId != null) {
            return { ...m, _serverMessageId: userServerId, _optimistic: false }
          }
          if (m.id === localIds.assistantId && assistantServerId != null) {
            return { ...m, _serverMessageId: assistantServerId, _optimistic: false }
          }
          return m
        })
      )
      const convId =
        response.conversation_id || response.user_message?.conversation_id || conversationIdHint
      if (convId != null) {
        const additions = []
        if (response.user_message) additions.push(response.user_message)
        if (response.assistant_message) additions.push(response.assistant_message)
        if (additions.length > 0) {
          queryClient.setQueryData(queryKeys.thumbnails.conversation(convId), (prevCache) => {
            if (!prevCache) return prevCache
            const items = prevCache.messages?.items || []
            const knownIds = new Set(items.map((m) => m?.id))
            const newItems = additions.filter((m) => m && !knownIds.has(m.id))
            if (newItems.length === 0) return prevCache
            return {
              ...prevCache,
              messages: { ...(prevCache.messages || {}), items: [...items, ...newItems] },
            }
          })
          broadcastCacheEvent({
            kind: 'conversation:append',
            conversationId: convId,
            items: additions,
          })
        }
      }
    },
    [queryClient]
  )

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
    setPromptImageName(file.name || 'Image')
    e.target.value = ''
  }

  const clearPromptImage = useCallback(() => {
    setPromptImageDataUrl(null)
    setPromptImageName('')
  }, [])

  // Push an inline failure card into the chat thread. Failures live in
  // `localOnlyMessages` (with `_kind: 'failure'`) so they sort
  // chronologically alongside successes — a new submission appears
  // BELOW the previous failure, not above it.
  //
  // Persistence: failure rows go through the same /events endpoint
  // success events use, so they get a server-assigned id and survive
  // a navigate-away → navigate-back round trip. Optimistic local
  // insert renders the card instantly; once the POST returns, the
  // local entry is dropped and the server-canonical pair is mirrored
  // into the React Query cache (which `buildMessagesFromApi` will
  // re-render as a `_kind: 'failure'` entry on the next pass).
  const pushFailureEntry = useCallback(
    async (failure, options = {}) => {
      // `userLocalId` (optional) — id of an existing user_local entry
      // that was preserved in `localOnlyMessages` (e.g. the chat-mode
      // catch path keeps the user bubble so it doesn't remount through
      // the error swap). When the persist call returns the canonical
      // `user_message`, we link the kept optimistic bubble to that
      // server id via `_serverMessageId` so the next conversation
      // refetch dedupes it instead of rendering a second user bubble.
      const { userLocalId } = options
      const localId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const localEntry = {
        id: localId,
        _kind: 'failure',
        createdAt: Date.now(),
        ...failure,
        // Pin to the conversation in view at push time — placed AFTER
        // the spread so a caller can't accidentally override it via
        // `failure._conversationId`. Same contract as
        // `pushLocalAssistantMessage`: the entry stays bound to its
        // conversation through any subsequent navigation, and the
        // render filter shows it only when the user is back on this
        // conversation.
        _conversationId: conversationIdRef.current,
        // Server-id anchor: snapshot the highest server message id at
        // this exact moment. The renderer slots this local failure
        // immediately after that anchor's position. Clock-skew-proof
        // (server ids are monotone increasing); replaces the previous
        // wall-clock-based slotting that could put a failure at the
        // TOP of the list when the client clock ran behind the
        // server clock.
        _anchorAfterServerId: _maxServerIdIn(messagesRef.current),
      }
      setLocalOnlyMessages((prev) => [...prev, localEntry])

      // Best-effort persist. Auto-creates the conversation if needed
      // (the events route already does that for the success path).
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return localEntry
        const res = await thumbnailsApi.appendEvent(token, {
          conversation_id: conversationId || undefined,
          channel_id: channelId || undefined,
          kind: 'failure',
          user_content: failure.userText || '',
          extra_data: {
            mode: failure.mode,
            error_code: failure.errorCode,
            error_message: failure.errorMessage,
            retryable: failure.retryable,
            retry_after_seconds: failure.retryAfterSeconds,
            attempt: failure.attempt,
            max_attempts: failure.maxAttempts,
            user_image_url: failure.userImageUrl,
            options: failure.options,
          },
        })
        const newConvId = res?.conversation_id
        if (newConvId != null && newConvId !== conversationId) {
          handleConversationCreated(newConvId)
        }
        // Mirror into the React Query conversation cache so a
        // navigate-away → back round-trip serves the fresh failure
        // immediately (5-minute staleTime would otherwise show a
        // version without the failure briefly).
        const convIdForCache = newConvId ?? conversationId
        if (convIdForCache != null) {
          const additions = []
          if (res.user_message) additions.push(res.user_message)
          if (res.assistant_message) additions.push(res.assistant_message)
          queryClient.setQueryData(queryKeys.thumbnails.conversation(convIdForCache), (prev) => {
            if (!prev) return prev
            const items = prev.messages?.items || []
            const knownIds = new Set(items.map((m) => m?.id))
            const newItems = additions.filter((m) => m && !knownIds.has(m.id))
            if (newItems.length === 0) return prev
            return {
              ...prev,
              messages: { ...(prev.messages || {}), items: [...items, ...newItems] },
            }
          })
          // Cross-tab: same delta broadcast so a second tab viewing
          // this conversation gets the failure card immediately.
          if (additions.length > 0) {
            broadcastCacheEvent({
              kind: 'conversation:append',
              conversationId: convIdForCache,
              items: additions,
            })
          }
          // Refresh the sidebar so a brand-new conversation row appears.
          queryClient.invalidateQueries({
            queryKey: ['thumbnails', 'conversations'],
            exact: false,
          })
        }
        // Drop the optimistic failure entry — the server pair will
        // surface through `buildMessagesFromApi` (next reload) or via
        // the cache we just hydrated (immediate). If a `userLocalId`
        // was provided we ALSO link that preserved optimistic user
        // bubble to the persisted `user_message` so it dedupes against
        // the refetch instead of rendering twice.
        setLocalOnlyMessages((prev) =>
          prev
            .filter((m) => m.id !== localId)
            .map((m) =>
              userLocalId && m.id === userLocalId && res?.user_message?.id != null
                ? { ...m, _serverMessageId: res.user_message.id, _optimistic: false }
                : m
            )
        )
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[thumbnail] failure persist failed:', err)
        }
        // Local entry stays so the user still sees the card; the toast
        // already showed the original error. Worst case: a hard refresh
        // loses this one card, but the underlying generation error was
        // already communicated.
      }
      return localEntry
    },
    [channelId, conversationId, handleConversationCreated, queryClient]
  )

  // Retry a previously-failed generation. Removes the failure card from
  // the thread up front (so the chat doesn't double-show while the new
  // attempt is in flight) and dispatches to the right submit handler
  // based on `entry.mode`. On a fresh failure, the catch block pushes
  // a new failure entry which lands BELOW the retry's pending bubble.
  const handleRetryFailedAttempt = useCallback((entry) => {
    if (!entry) return
    // Synchronous spam-guard against Retry-button mashing. Two clicks
    // in the same frame would otherwise dispatch two retries (both
    // setTimeout(...) callbacks would observe the same pre-guard
    // state). The downstream submit handlers themselves also check
    // this ref before doing anything, so spamming after the dispatch
    // is also safe — but bailing early here keeps the failure card
    // removal idempotent (a no-op `.filter` if it's already gone).
    if (submitGuardRef.current) return
    setLocalOnlyMessages((prev) => prev.filter((m) => m.id !== entry.id))
    const mode = entry.mode || 'prompt'
    // Defer the dispatch to next tick so the relevant draft state has
    // a chance to commit before the submit handler reads it.
    setTimeout(() => {
      if (mode === 'titles') {
        setTitleTopic(entry.userText || '')
        setTimeout(() => handleTitleIdeasSubmitRef.current?.(), 0)
      } else if (mode === 'recreate') {
        setRecreateUrlInput(entry.userText || '')
        setTimeout(() => handleRecreateSubmitRef.current?.(), 0)
      } else if (mode === 'analyze') {
        setTimeout(() => handleAnalyzeFooterSubmitRef.current?.(), 0)
      } else if (mode === 'edit') {
        // Re-open the editor pre-loaded with the same base image. The
        // ROI brush state isn't serialized (canvas state is too rich to
        // round-trip cleanly through JSON), so the user re-paints the
        // mask. Prompt text is restored where the dialog reads it on
        // mount via initial state. Base image is the source of truth.
        const baseUrl = entry.options?.base_image_url || entry.userImageUrl
        if (baseUrl) {
          setEditDialogUrl(baseUrl)
          setShowEditDialog(true)
        }
      } else {
        // 'prompt' (default thumbnail-generate) — restore the draft text
        // and re-fire the main submit handler.
        setDraft(entry.userText || '')
        setTimeout(() => handleSubmitRef.current?.(), 0)
      }
    }, 0)
  }, [])

  // (Removed `commitServerChatPair` — the in-place pending pattern uses
  // `linkLocalToServer` to bind the optimistic local entries to their
  // server twins. The local entry is the visible one; the server twin
  // is silently filtered out of `renderedMessages` via
  // `_serverMessageId`, so there's no need to materialize a separate
  // server-canonical record on success.)

  // ×-click handler with shrink-back animation. The CSS rule for
  // `.thumb-attach-pill--closing` swaps the in-keyframe for the out-
  // keyframe; we leave the DOM mounted for the duration of that
  // animation, then call the real clear and unmount.
  const closeAttachPillAnimated = useCallback(() => {
    if (attachPillCloseTimer.current) clearTimeout(attachPillCloseTimer.current)
    setAttachPillClosing(true)
    attachPillCloseTimer.current = setTimeout(() => {
      clearPromptImage()
      setAttachPillClosing(false)
      attachPillCloseTimer.current = null
    }, 220)
  }, [clearPromptImage])

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!requireCredits()) return
    // Synchronous spam-guard — see `submitGuardRef` definition above.
    // Returns BEFORE any state writes so a rapid double-Enter never
    // double-pushes an optimistic pair or fires two chat mutations.
    if (submitGuardRef.current) return
    const combined = draft.trim()
    if (!combined || anyJobInFlight) return
    if (!promptImageDataUrl && combined.length < 5) {
      return
    }
    submitGuardRef.current = true

    // Lock the chat surface FIRST — before any state writes that
    // could otherwise be observed mid-update by wipe-effects / empty
    // gating. The lock is scoped to the current conversationId; if
    // the user navigates away from it during the submit (sidebar
    // click, "New chat"), a separate effect releases the lock so the
    // destination view renders without obstruction. The lock follows
    // the expected URL flip when the chat response creates a new
    // conv (null → respondedId) via `handleConversationCreated`.
    const submittingConvId = conversationId
    beginSubmission(submittingConvId)
    setSendError('')
    setSendErrorMeta(null)
    // In-place pending pattern (matches analyze / titles): push the user
    // bubble + an assistant placeholder with `_promptPending: true` into
    // `localOnlyMessages` right now. The assistant card renders the
    // <ThumbnailGenFill> loader inside the SAME mounted node; when the
    // API returns we PATCH the placeholder in place (set thumbnails,
    // clear `_promptPending`) — AnimatePresence crossfades loader →
    // result without unmounting the card. This is what makes the first
    // message smooth: the previously-sibling user-bubble + loader used
    // to live in a different React subtree from the eventual server
    // messages, so the swap was a hard mount/unmount that flashed.
    const userImageAtSubmit = promptImageDataUrl || null
    const localIds = pushLocalAssistantMessage(combined, {
      content: '',
      userImageUrl: userImageAtSubmit,
      userRequest: combined,
      _promptPending: true,
      _promptMode: thumbMode,
      _promptCount: numThumbnails,
    })
    markConvPending(submittingConvId)
    setDraft('')

    // Make sure the conversation exists server-side BEFORE the chat
    // job starts. For an existing chat, this is a no-op pass-through.
    // For a brand-new chat, this fires a synchronous create against
    // /api/thumbnails/conversations and returns the real id, which
    // is then propagated to the URL (sidebar row appears, address
    // bar updates) before the chat mutation submits. The point is
    // refresh-survival: by the time the user could hit ⌘R, the chat
    // exists in the backend and the URL is on its real id, so a
    // refresh fetches the conversation (with the user_message that
    // /chat/submit has by then persisted) and resumes the pending
    // state.
    // For a NEW chat `activeConversationId` is null — that's the
    // expected shape now. /chat/submit will mint the conversation
    // and return its id in the response, at which point
    // chatMutation.onSuccess → handleConversationCreated flips the URL
    // and rebinds the optimistic local entries (`_conversationId:
    // null` → the freshly-minted numeric id). For an EXISTING chat
    // activeConversationId === conversationId and we mark the sidebar
    // row as pending up-front for the spinner.
    const activeConversationId = await ensureConversationId(conversationId)
    if (activeConversationId) startPending(activeConversationId)

    // Mint ONE idempotency key per user submission and pass it through the
    // mutation. /chat/submit caches its response under this key, so even if
    // the mutation fires twice for the same intent (StrictMode dev replay,
    // a transport-layer retry, or any future race we miss), the backend
    // returns the cached submission instead of minting a second conversation.
    // Without this every call to `thumbnailsApi.chat` rolled a fresh key and
    // the duplicate manifested as one "complete" chat + one stub chat that
    // only had the user_message (its worker job had been queued but the
    // tab never picked up its result).
    const submitIdempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `submit-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`

    try {
      if (promptImageDataUrl) {
        // Whole-image edit doesn't go through the chat endpoint. Patch
        // the in-place placeholder with the edited image — the loader
        // crossfades to the populated card without unmount.
        const imageUrl = await runWholeImageEdit({
          imageUrl: promptImageDataUrl,
          prompt: `${combined} ${buildSelectionHint(selectedPersona, selectedStyle)}`.trim(),
        })
        patchLocalAssistantMessage(localIds.assistantId, {
          _promptPending: false,
          imageUrl,
        })
        clearPromptImage()
      } else {
        const result = await chatMutation.mutateAsync({
          message: combined,
          conversation_id: activeConversationId || undefined,
          num_thumbnails: numThumbnails,
          persona_id: selectedPersonaId || undefined,
          style_id: selectedStyleId || undefined,
          channel_id: channelId || undefined,
          _idempotencyKey: submitIdempotencyKey,
        })
        // Patch the in-place placeholder with the server result first
        // (loader → thumbnails crossfade in the same card), then bind
        // local entries to their server twins so the next conversation
        // refetch dedupes them via `_serverMessageId`.
        const thumbnails = result?.thumbnails || []
        const assistantContent =
          result?.assistant_message?.content || (thumbnails.length > 0 ? '' : result?.content || '')
        const assistantImageUrl = result?.assistant_message?.extra_data?.image_url || null
        patchLocalAssistantMessage(localIds.assistantId, {
          _promptPending: false,
          content: assistantContent,
          thumbnails,
          imageUrl: assistantImageUrl,
          userRequest: result?.assistant_message?.extra_data?.user_request || combined,
        })
        if (result?.user_message || result?.assistant_message) {
          linkLocalToServer(localIds, result, activeConversationId)
        }
      }
      finishLoading(submittingConvId)
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
      // `payload` is set by the poll-job FAILED path; submit-time errors
      // surface the parsed body on `err.body` (see lib/aiErrors.js).
      const body = err?.payload || err?.body
      const errorObj = body?.error
      const detailObj = body?.detail && typeof body.detail === 'object' ? body.detail : null
      const code = errorObj?.code || detailObj?.code || err?.code || null
      const extra = errorObj?.extra || detailObj?.extra || {}
      const backendMsg =
        errorObj?.message ||
        detailObj?.message ||
        (typeof body?.detail === 'string' ? body.detail : null) ||
        err?.message ||
        'Could not generate thumbnails.'

      const friendly = codeToFriendlyMessage(code, backendMsg)
      const retryable = isRetryableCode(code, extra)
      // NOTE: the top-of-screen toast and the `sendError` state both
      // used to fire here in addition to the inline failure card. The
      // card already shows the error message + a Retry pill and lives
      // in the message thread alongside the user bubble, so the toast
      // was a duplicate error UI that surfaced AT THE TOP of the
      // screen — outside the message list, with no id, ordered by
      // toast-stack position rather than chat chronology. Removing
      // both means the thread is the single source of error UI:
      // every error has a row in the conversation, persisted by
      // `pushFailureEntry → appendEvent` with a server-assigned id,
      // ordered chronologically by that id.
      // Drop ONLY the in-flight assistant placeholder (the loader card).
      // The user bubble (`localIds.userId`) is preserved — the message
      // the user typed must stay visible without remount through the
      // error swap. The failure entry pushed below has `_skipUserBubble`
      // set so `FailedAttemptBlock` renders only the assistant-side
      // error card; the existing user bubble in `localOnlyMessages`
      // continues to render through `ChatMessageItem` with the same
      // React key it had during the loader phase — zero remount, no
      // enter animation re-trigger, no content flicker.
      setLocalOnlyMessages((prev) => prev.filter((m) => m.id !== localIds.assistantId))
      // Persist the failed attempt in the chat thread so the user keeps
      // a visible record of what they asked for and can retry without
      // re-typing. `userLocalId` lets the persist helper link the kept
      // optimistic user bubble to the server's `user_message` row via
      // `_serverMessageId`, so when the conversation refetch lands the
      // canonical user message gets deduped instead of rendering as a
      // duplicate next to the optimistic one.
      pushFailureEntry(
        {
          mode: 'prompt',
          userText: combined,
          userImageUrl: userImageAtSubmit,
          // Skip the failure card's internal user bubble — the
          // kept optimistic user_local entry is the visible source
          // of truth for the user's message.
          _skipUserBubble: true,
          errorCode: code,
          errorMessage: friendly,
          retryable,
          retryAfterSeconds:
            extra?.retry_after_seconds ?? extra?.eta_seconds ?? err?.retryAfterSeconds ?? null,
          // Backend retry/queue context (set when the route hit our retry
          // helper or queue cap). Lets the failed-card render "we tried 4
          // times" / "you were #6 in line" / countdown UI honestly.
          attempt: extra?.attempt ?? null,
          maxAttempts: extra?.max_attempts ?? null,
          totalWaitedSeconds: extra?.total_waited_seconds ?? null,
          queueDepth: extra?.queue_depth ?? null,
          queueMaxDepth: extra?.queue_max_depth ?? null,
          options: {
            num_thumbnails: numThumbnails,
            persona_id: selectedPersonaId || null,
            style_id: selectedStyleId || null,
            channel_id: channelId || null,
            conversation_id: activeConversationId || null,
          },
        },
        { userLocalId: localIds.userId }
      )
      setDraft(combined)
      clearConvPending(submittingConvId)
      if (activeConversationId) clearPending(activeConversationId)
    } finally {
      // Release the synchronous spam-guard the moment the handler
      // finishes (success or error). The React-state-based gating
      // (`anyJobInFlight`) still keeps follow-up submits blocked until
      // `pendingAssistant` / `_promptPending` resolve, which is the
      // intended one-job-at-a-time semantics.
      submitGuardRef.current = false
      // Release the submission lock — deferred to RAF×2 inside
      // endSubmission so any in-flight hashchange / setQueryData /
      // setPendingAssistant updates land BEFORE the wipe-effects and
      // empty-state gating become unguarded again.
      endSubmission()
    }
  }

  const handleReplaceThumbnail = useCallback((msgId, thumbIndex, newThumbnail) => {
    // The replaced message could live in either bucket — server-canonical
    // `messages` (chat-mode results) or `localOnlyMessages` (recreate /
    // analyze results). Try both; whichever matches will mutate.
    const updater = (m) =>
      m.id === msgId && m.role === 'assistant'
        ? {
            ...m,
            thumbnails: (m.thumbnails || []).map((t, i) => (i === thumbIndex ? newThumbnail : t)),
          }
        : m
    setMessages((prev) => prev.map(updater))
    setLocalOnlyMessages((prev) => prev.map(updater))
  }, [])

  /**
   * Persist a non-prompt event into the active conversation. Fire-and-
   * forget: the local message is already on screen via
   * `pushLocalAssistantMessage` by the time this runs, so any failure
   * here only affects reload survival — never the immediate UX. If
   * the user has no conversation yet, the backend creates one and
   * we propagate the new id via `onConversationCreated` so subsequent
   * events land in the same thread.
   */
  const persistEvent = useCallback(
    async (kind, userContent, extraData, parentMessageId = null) => {
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return null
        const res = await thumbnailsApi.appendEvent(token, {
          conversation_id: conversationId || undefined,
          channel_id: channelId || undefined,
          kind,
          user_content: userContent || '',
          extra_data: { ...(extraData || {}), pending: false },
          // Optional regen-sibling pointer. The server links the new
          // assistant row back to `parentMessageId` so future variant-
          // navigation UI can group siblings under one user prompt.
          ...(parentMessageId != null ? { parent_message_id: parentMessageId } : {}),
        })
        const newId = res?.conversation_id
        if (newId != null && newId !== conversationId) {
          handleConversationCreated(newId)
        }
        // Refresh the sidebar so the new chat row appears (and the
        // background-renamed title eventually fades in). The actual
        // queryKey is `['thumbnails', 'conversations', params]`, so
        // we invalidate every variant via `exact: false`.
        queryClient.invalidateQueries({
          queryKey: ['thumbnails', 'conversations'],
          exact: false,
        })
        // NOTE: detail-cache hydration is now done by `linkLocalToServer`
        // in the calling handler (it has the optimistic local IDs to
        // bind to + the server response in hand). We deliberately DON'T
        // `invalidateQueries` on the conversation here — that would
        // trigger a refetch which races the local-to-server linking
        // and can briefly show duplicates before the link lands. The
        // setQueryData in `linkLocalToServer` is the authoritative
        // hydration path; refetches still fire on next mount via
        // React Query's normal cache lifecycle.
        return res
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[thumbnail] persistEvent failed:', kind, err)
        }
        return null
      }
    },
    [channelId, conversationId, handleConversationCreated, queryClient]
  )

  /**
   * Pre-persist a pending (in-flight) event BEFORE running generation.
   *
   * Writes the same user/assistant pair `persistEvent` writes, but stamps
   * `extra_data.pending = true` on the assistant row. If the user refreshes
   * mid-generation the row is already on disk — the conversation reload
   * renders a pending placeholder card (so the chat is not empty) and
   * the backend's stale-pending sweep ultimately marks an abandoned row
   * as failed (retryable) after 5 minutes if no client ever finishes it.
   *
   * Returns the same shape as `persistEvent` so callers can keep using
   * `linkLocalToServer` to bind their optimistic local entries to the
   * server-assigned IDs.
   */
  const persistPendingEvent = useCallback(
    async (kind, userContent, extraData, parentMessageId = null) => {
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return null
        const res = await thumbnailsApi.appendEvent(token, {
          conversation_id: conversationId || undefined,
          channel_id: channelId || undefined,
          kind,
          user_content: userContent || '',
          extra_data: { ...(extraData || {}), pending: true },
          // Optional regen-sibling pointer — see persistEvent above.
          ...(parentMessageId != null ? { parent_message_id: parentMessageId } : {}),
        })
        const newId = res?.conversation_id
        if (newId != null && newId !== conversationId) {
          handleConversationCreated(newId)
        }
        queryClient.invalidateQueries({
          queryKey: ['thumbnails', 'conversations'],
          exact: false,
        })
        return res
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[thumbnail] persistPendingEvent failed:', kind, err)
        }
        return null
      }
    },
    [channelId, conversationId, handleConversationCreated, queryClient]
  )

  /**
   * Finalize a pending message row in-place. Patches the assistant row's
   * `extra_data` to set `pending = false` and merge in the generation
   * result (or failure metadata). The user row is left untouched.
   *
   * Best-effort — a network blip here doesn't surface to the user
   * because the local card has already rendered the result. The
   * stale-pending sweep eventually finalizes any row this PATCH missed.
   */
  const finalizePersistedEvent = useCallback(
    async (assistantMessageId, extraDataPatch, content) => {
      if (assistantMessageId == null) return null
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return null
        const body = {
          extra_data_patch: { ...(extraDataPatch || {}), pending: false },
        }
        if (content != null) body.content = content
        return await thumbnailsApi.patchEvent(token, assistantMessageId, body)
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[thumbnail] finalizePersistedEvent failed:', err)
        }
        return null
      }
    },
    []
  )

  const handleUseTitleAsPrompt = useCallback(
    (text) => {
      const trimmed = (text || '').trim()
      if (!trimmed) return
      // Drop the title into the Prompt textarea and flip to that
      // mode so the user lands on the composer with the title
      // already typed in. Slice to the same 2000-char cap the
      // textarea enforces to keep state clean.
      setDraft(trimmed.slice(0, 2000))
      handleThumbModeTab('prompt')
      // Focus + scroll-to-end on the next tick once the Prompt form
      // re-mounts. RAF avoids racing the SmoothHeight tab transition.
      requestAnimationFrame(() => {
        const el = document.querySelector('.thumb-prompt-textarea')
        if (el && typeof el.focus === 'function') {
          el.focus()
          try {
            el.setSelectionRange(trimmed.length, trimmed.length)
          } catch (_) {
            /* selectionRange not supported on this input — ignore */
          }
        }
      })
    },
    [handleThumbModeTab]
  )

  const handleRegenerateOne = useCallback(
    async (userRequest) => {
      if (!requireCredits()) return
      if (!userRequest?.trim() || anyJobInFlight) return
      if (submitGuardRef.current) return
      submitGuardRef.current = true
      const regenConvId = conversationId
      const localIds = pushLocalAssistantMessage(userRequest, {
        content: '',
        userRequest,
        _promptPending: true,
        _promptMode: 'prompt',
        _promptCount: 1,
      })
      markConvPending(regenConvId)
      // Stable per-submit idempotency key — see handleSubmit for the
      // duplicate-conversation bug this guards against.
      const submitIdempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `regen-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      try {
        const result = await chatMutation.mutateAsync({
          message: userRequest,
          conversation_id: conversationId || undefined,
          num_thumbnails: 1,
          persona_id: selectedPersonaId || undefined,
          style_id: selectedStyleId || undefined,
          channel_id: channelId || undefined,
          _idempotencyKey: submitIdempotencyKey,
        })
        const thumbnails = result?.thumbnails || []
        const assistantContent =
          result?.assistant_message?.content || (thumbnails.length > 0 ? '' : result?.content || '')
        const assistantImageUrl = result?.assistant_message?.extra_data?.image_url || null
        patchLocalAssistantMessage(localIds.assistantId, {
          _promptPending: false,
          content: assistantContent,
          thumbnails,
          imageUrl: assistantImageUrl,
          userRequest: result?.assistant_message?.extra_data?.user_request || userRequest,
        })
        if (result?.user_message || result?.assistant_message) {
          linkLocalToServer(localIds, result, conversationId)
        }
        finishLoading(regenConvId)
      } catch (err) {
        const { code, message } = parseApiError(err, 'Regeneration failed')
        setLocalOnlyMessages((prev) =>
          prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
        )
        clearConvPending(regenConvId)
        // Persist the failed regenerate as an inline thread card —
        // same pattern as every other submit handler. The card is
        // the single source of error UI (no top-of-screen toast,
        // no `sendError` state); it lives in the message list with
        // a server-assigned id from appendEvent and orders
        // chronologically with the rest of the conversation.
        // mode='prompt' so the retry path re-fires the main
        // handleSubmit handler with the same userRequest text.
        pushFailureEntry({
          mode: 'prompt',
          userText: userRequest,
          errorCode: code,
          errorMessage: message,
          retryable: true,
        })
      } finally {
        submitGuardRef.current = false
      }
    },
    [
      chatMutation,
      conversationId,
      selectedPersonaId,
      selectedStyleId,
      channelId,
      anyJobInFlight,
      finishLoading,
      markConvPending,
      clearConvPending,
      pushLocalAssistantMessage,
      patchLocalAssistantMessage,
      pushFailureEntry,
      linkLocalToServer,
      requireCredits,
    ]
  )

  // One-click fix: redesigns the exact thumbnail that was clicked by
  // passing its image URL as a reference image to the model. The user
  // bubble shows the original thumbnail in reply-style so the thread
  // reads as "fixing THIS one". No double-charge risk — one image out.
  const handleOneClickFixWithImage = useCallback(
    async ({ prompt, imageUrl }) => {
      if (!requirePremium('one_click_fix', 'One-click fix')) return
      if (!prompt?.trim() || anyJobInFlight) return
      if (submitGuardRef.current) return
      submitGuardRef.current = true
      const ocfConvId = conversationId
      const localIds = pushLocalAssistantMessage(prompt, {
        userImageUrl: imageUrl || undefined,
        content: '',
        userRequest: prompt,
        _promptPending: true,
        _promptMode: 'prompt',
        _promptCount: 1,
      })
      markConvPending(ocfConvId)
      const submitIdempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `ocf-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      try {
        const result = await chatMutation.mutateAsync({
          message: prompt,
          conversation_id: conversationId || undefined,
          num_thumbnails: 1,
          persona_id: selectedPersonaId || undefined,
          style_id: selectedStyleId || undefined,
          channel_id: channelId || undefined,
          reference_image_urls: imageUrl ? [imageUrl] : undefined,
          _idempotencyKey: submitIdempotencyKey,
        })
        const thumbnails = result?.thumbnails || []
        const assistantContent =
          result?.assistant_message?.content || (thumbnails.length > 0 ? '' : result?.content || '')
        const assistantImageUrl = result?.assistant_message?.extra_data?.image_url || null
        patchLocalAssistantMessage(localIds.assistantId, {
          _promptPending: false,
          content: assistantContent,
          thumbnails,
          imageUrl: assistantImageUrl,
          userRequest: result?.assistant_message?.extra_data?.user_request || prompt,
        })
        if (result?.user_message || result?.assistant_message) {
          linkLocalToServer(localIds, result, conversationId)
        }
        finishLoading(ocfConvId)
      } catch (err) {
        const { code, message } = parseApiError(err, 'One-click fix failed')
        setLocalOnlyMessages((prev) =>
          prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
        )
        clearConvPending(ocfConvId)
        pushFailureEntry({
          mode: 'prompt',
          userText: prompt,
          errorCode: code,
          errorMessage: message,
          retryable: true,
        })
      } finally {
        submitGuardRef.current = false
      }
    },
    [
      requirePremium,
      chatMutation,
      conversationId,
      selectedPersonaId,
      selectedStyleId,
      channelId,
      anyJobInFlight,
      finishLoading,
      markConvPending,
      clearConvPending,
      pushLocalAssistantMessage,
      patchLocalAssistantMessage,
      pushFailureEntry,
      linkLocalToServer,
    ]
  )

  // Stable-identity wrappers for the message-row callbacks. The
  // underlying handlers keep their own deps; these wrappers never
  // change identity, so `chatMessageItemPropsEqual`'s callback guard
  // always passes and a memoised row only re-renders when its own
  // `msg` actually changes — not on every unrelated parent render
  // (composer keystroke, poll tick, mode switch). Same latest-ref
  // recipe as the per-mode submit refs below; behaviour identical
  // (wrappers always invoke the most recent handler).
  const rowHandlerLatestRef = useRef(null)
  rowHandlerLatestRef.current = {
    onReplaceThumbnail: handleReplaceThumbnail,
    onRegenerate: handleRegenerateOne,
    onOneClickFix: handleOneClickFixWithImage,
    onViewImage: openThumbLightbox,
    onEditImage: openEditorForThumbnail,
    onUseTitle: handleUseTitleAsPrompt,
    onRetry: handleRetryFailedAttempt,
  }
  const rowHandlersRef = useRef(null)
  if (rowHandlersRef.current === null) {
    rowHandlersRef.current = {
      onReplaceThumbnail: (...a) => rowHandlerLatestRef.current.onReplaceThumbnail(...a),
      onRegenerate: (...a) => rowHandlerLatestRef.current.onRegenerate(...a),
      onOneClickFix: (...a) => rowHandlerLatestRef.current.onOneClickFix(...a),
      onViewImage: (...a) => rowHandlerLatestRef.current.onViewImage(...a),
      onEditImage: (...a) => rowHandlerLatestRef.current.onEditImage(...a),
      onUseTitle: (...a) => rowHandlerLatestRef.current.onUseTitle(...a),
      onRetry: (...a) => rowHandlerLatestRef.current.onRetry(...a),
    }
  }
  const rowHandlers = rowHandlersRef.current

  // Keep the per-mode submit refs pointing at the latest closures so the
  // failure-card retry dispatcher (and the toast Retry action) always
  // invoke the most recent handler with current state. Runs after every
  // render — cheap. The other three (title / recreate / analyze) are
  // wired in their own no-dep useEffects further below, after each
  // handler is in scope.
  useEffect(() => {
    handleSubmitRef.current = handleSubmit
  })

  const handleRecreateFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    setRecreateSourceImage(await readFileAsDataUrl(file))
    setRecreatePreviewUrl(null)
    e.target.value = ''
  }

  const handleRecreateSubmit = async (e) => {
    e?.preventDefault?.()
    if (!requireCredits()) return
    if (anyJobInFlight) return
    if (submitGuardRef.current) return
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
    // The user's chat bubble shows just the source thumbnail and any
    // instructions they typed — no hardcoded "Recreate this thumbnail"
    // prose. The backend still receives `prompt: instructions` (the
    // recreate API endpoint encodes the operation, not the prompt).
    const userText = instructions
    const recreateConvId = conversationId
    submitGuardRef.current = true
    setSendError('')
    setSendErrorMeta(null)
    // In-place pending: push the placeholder (user bubble + assistant
    // card with `_promptPending: true`) into `localOnlyMessages` now;
    // patch in the result image(s) when the API returns. Loader and
    // result share one mounted card — no flash on swap.
    const localIds = pushLocalAssistantMessage(userText, {
      content: '',
      userImageUrl: sourceImageUrl,
      userRequest: instructions,
      isRecreate: true,
      _promptPending: true,
      _promptMode: 'recreate',
      _promptCount: numRecreateThumbnails,
    })
    markConvPending(recreateConvId)
    setRecreateDraft('')
    setRecreateSourceImage(null)
    setRecreateUrlInput('')
    setRecreatePreviewUrl(null)
    // Synchronous localStorage ticket: written BEFORE any await so a
    // refresh inside the pre-persist window still leaves a record.
    const op_id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `recreate-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    pendingActions.enqueue({
      op_id,
      kind: 'recreate',
      conversationId,
      userText,
      sourceImageUrl,
      extra: { count: numRecreateThumbnails },
    })
    // Pre-persist the pending pair BEFORE generation so a refresh
    // mid-flight doesn't drop the conversation. Binds the optimistic
    // local entry to the server IDs immediately. If pre-persist fails
    // we still let generation run — the UI just won't survive a
    // mid-flight refresh in that one case.
    // Strip base64 data URLs before persisting — multi-MB payloads
    // cause the POST to fail silently (same fix as analyze handler).
    const persistableSourceUrl =
      sourceImageUrl && !sourceImageUrl.startsWith('data:') ? sourceImageUrl : null
    const prePersisted = await persistPendingEvent('recreate', userText, {
      user_image_url: persistableSourceUrl,
      user_request: instructions,
      is_recreate: true,
      mode: 'recreate',
    })
    if (prePersisted) {
      linkLocalToServer(localIds, prePersisted, conversationId)
      pendingActions.markPersisted(op_id, {
        serverConvId: prePersisted.conversation_id,
        serverUserMessageId: prePersisted.user_message?.id,
        serverAssistantMessageId: prePersisted.assistant_message?.id,
      })
    }
    const assistantServerId = prePersisted?.assistant_message?.id ?? null
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
        // Single-thumbnail path: hand the server the pending row id so
        // it finalizes the row inside the handler. Multi-thumbnail path
        // can't pass a single id (N parallel calls would race), so it
        // relies on the client-side PATCH below instead.
        const res = await thumbnailsApi.regenerateWithPersona(token, {
          ...payload,
          pending_message_id: assistantServerId ?? undefined,
        })
        const imageUrl = res?.image_url
        if (!imageUrl) throw new Error('No image returned from recreate.')
        patchLocalAssistantMessage(localIds.assistantId, {
          _promptPending: false,
          imageUrl,
        })
        // The server has already PATCHed the row via `pending_message_id`,
        // but we issue this client-side PATCH as a safety net for older
        // backends and to keep the cache fresh in the same tick.
        await finalizePersistedEvent(assistantServerId, {
          image_url: imageUrl,
          user_image_url: persistableSourceUrl,
          user_request: instructions,
          is_recreate: true,
        })
      } else {
        const results = await Promise.all(
          Array.from({ length: count }, () => thumbnailsApi.regenerateWithPersona(token, payload))
        )
        const thumbnails = results.map((r, i) => ({
          image_url: r?.image_url,
          title: `Variation ${i + 1}`,
        }))
        patchLocalAssistantMessage(localIds.assistantId, {
          _promptPending: false,
          thumbnails,
        })
        await finalizePersistedEvent(assistantServerId, {
          thumbnails,
          user_image_url: persistableSourceUrl,
          user_request: instructions,
          is_recreate: true,
        })
      }
      finishLoading(recreateConvId)
    } catch (err) {
      const { code, message } = parseApiError(err, 'Could not recreate thumbnail.')
      setLocalOnlyMessages((prev) =>
        prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
      )
      clearConvPending(recreateConvId)
      // Convert the pre-persisted pending row into a failure card via
      // PATCH so a future refresh still shows the error. Falls back to
      // pushFailureEntry when pre-persist didn't succeed.
      if (assistantServerId != null) {
        await finalizePersistedEvent(assistantServerId, {
          kind: 'failure',
          failed: true,
          mode: 'recreate',
          error_code: code,
          error_message: message,
          retryable: true,
          user_image_url: persistableSourceUrl,
          user_request: instructions,
        })
      } else {
        pushFailureEntry({
          mode: 'recreate',
          userText: instructions,
          userImageUrl: sourceImageUrl,
          errorCode: code,
          errorMessage: message,
          retryable: true,
        })
      }
    } finally {
      submitGuardRef.current = false
      pendingActions.complete(op_id)
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
    // Premium feature: in-place region edit. Block if the user's
    // plan doesn't include `edit`.
    if (!requirePremium('edit', 'Edit')) return
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
    // Premium feature: in-place region edit.
    if (!requirePremium('edit', 'Edit')) return
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
    if (!requireCredits()) return
    if (anyJobInFlight) return
    if (submitGuardRef.current) return
    const imageUrl = analyzeSourceMode === 'upload' ? analyzeSourceImage : analyzePreviewUrl
    if (!imageUrl) {
      setSendError('Add an image or YouTube link to analyze.')
      setSendErrorMeta(null)
      return
    }
    submitGuardRef.current = true
    const titleTrim = analyzeTitle.trim()
    // User bubble shows the thumbnail + any title they typed — no
    // hardcoded "Analyze this thumbnail" prose. The backend still
    // gets `video_title: titleTrim` so the rating uses it for context.
    const userText = titleTrim
    setSendError('')
    setSendErrorMeta(null)
    setAnalyzeTitle('')
    setAnalyzeSourceImage(null)
    setAnalyzeUrlInput('')
    setAnalyzePreviewUrl(null)
    // In-place pending pattern (same as titles): push the optimistic
    // local message NOW with `_analyzePending: true` so the loader
    // renders INSIDE the assistant card. When the API resolves we
    // patch the same entry with the real `analysis` — the loader and
    // the result share one mounted container, so they can never both
    // be visible simultaneously.
    //
    // `userImageUrl` feeds the user bubble so the user can see what
    // they sent. The assistant card shows the same image with the
    // full toolbar (score, actions). The user bubble renders it as a
    // compact sent-image, not a duplicate full card, so no stacking.
    const localIds = pushLocalAssistantMessage(userText, {
      content: '',
      imageUrl,
      userImageUrl: imageUrl,
      userRequest: '',
      analysis: null,
      _analyzePending: true,
    })
    const op_id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `analyze-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    pendingActions.enqueue({
      op_id,
      kind: 'analyze',
      conversationId,
      userText,
      sourceImageUrl: imageUrl,
      extra: null,
    })
    // Strip base64 data URLs before persisting — multi-MB payloads cause the
    // POST to fail silently, leaving prePersisted null and breaking persistence.
    const persistableUrl = imageUrl && !imageUrl.startsWith('data:') ? imageUrl : null
    // Pre-persist the pending analyze pair BEFORE the rating call.
    const prePersisted = await persistPendingEvent('analyze', userText, {
      image_url: persistableUrl,
      user_image_url: persistableUrl,
      mode: 'analyze',
    })
    if (prePersisted) {
      linkLocalToServer(localIds, prePersisted, conversationId)
      pendingActions.markPersisted(op_id, {
        serverConvId: prePersisted.conversation_id,
        serverUserMessageId: prePersisted.user_message?.id,
        serverAssistantMessageId: prePersisted.assistant_message?.id,
      })
    }
    const assistantServerId = prePersisted?.assistant_message?.id ?? null
    // Single-flight latch: the moment the response is committed to
    // the local card via `patchLocalAssistantMessage`, this flag
    // flips so the catch / finally branches below can't push a
    // failure card or duplicate state for the same submission.
    let resolved = false
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const base64 = extractBase64FromDataUrl(imageUrl)
      const rating = await thumbnailsApi.rate(token, {
        ...(base64 ? { thumbnail_image_base64: base64 } : { thumbnail_image_url: imageUrl }),
        video_title: titleTrim || undefined,
        pending_message_id: assistantServerId ?? undefined,
      })
      // For base64 uploads persistableUrl is null (data: URLs can't be
      // stored). The rating response carries thumbnail_image_url — the
      // S3 URL the backend uploaded the image to — which IS durable and
      // can be persisted so the card survives a page refresh.
      // Guard against the legacy "uploaded" sentinel stored before the S3
      // upload fix — treat it as no URL so we don't set imageUrl to the
      // literal string "uploaded".
      const ratingImageUrl =
        rating.thumbnail_image_url && rating.thumbnail_image_url !== 'uploaded'
          ? rating.thumbnail_image_url
          : null
      const storedImageUrl = persistableUrl || ratingImageUrl || null
      // Prime the per-image rating cache keyed by BOTH the original
      // imageUrl (used during this session) and storedImageUrl (used
      // after a refresh, where msg.imageUrl = storedImageUrl). Without
      // the second seed the refreshed card fires a redundant /rate call.
      seedThumbnailRating(queryClient, imageUrl, rating)
      if (storedImageUrl && storedImageUrl !== imageUrl) {
        seedThumbnailRating(queryClient, storedImageUrl, rating)
      }
      // Patch the SAME local entry — no remount, smooth in-place
      // loader → analysis crossfade driven by AnimatePresence inside
      // ChatMessageItem. Also update imageUrl to the durable S3 URL so
      // the card keeps its image even if the data: URL is GC'd.
      patchLocalAssistantMessage(localIds.assistantId, {
        analysis: rating,
        _analyzePending: false,
        imageUrl: storedImageUrl,
      })
      // Also update the user bubble to the durable S3 URL so that the
      // live session and a post-refresh session both show the same image.
      if (storedImageUrl && storedImageUrl !== imageUrl) {
        setLocalOnlyMessages((prev) =>
          prev.map((m) => (m.id === localIds.userId ? { ...m, imageUrl: storedImageUrl } : m))
        )
      }
      resolved = true
      await finalizePersistedEvent(assistantServerId, {
        image_url: storedImageUrl,
        user_image_url: storedImageUrl,
        analysis: rating,
      })
    } catch (err) {
      if (resolved) {
        // The rating already resolved + was committed to the card;
        // a downstream throw (e.g. persistEvent quirk) shouldn't
        // surface as a failure card or duplicate the analysis.
        if (typeof console !== 'undefined') {
          console.warn('[thumbnail] analyze: post-resolve error swallowed', err)
        }
        return
      }
      const { code, message } = parseApiError(err, 'Could not analyze thumbnail.')
      // Drop the optimistic placeholder so the failure card lands
      // cleanly where the user expects.
      setLocalOnlyMessages((prev) =>
        prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
      )
      if (assistantServerId != null) {
        await finalizePersistedEvent(assistantServerId, {
          kind: 'failure',
          failed: true,
          mode: 'analyze',
          error_code: code,
          error_message: message,
          retryable: true,
          user_image_url: persistableUrl,
        })
      } else {
        pushFailureEntry({
          mode: 'analyze',
          userText: titleTrim,
          userImageUrl: imageUrl,
          errorCode: code,
          errorMessage: message,
          retryable: true,
        })
      }
    } finally {
      submitGuardRef.current = false
      pendingActions.complete(op_id)
    }
    // No pending* state was set for analyze (in-place pattern), so
    // no `finally` cleanup is needed. The optimistic placeholder is
    // either patched (success) or removed (failure) inside the try
    // / catch above.
  }

  const handleTitleIdeasSubmit = async (e) => {
    e?.preventDefault?.()
    if (!requireCredits()) return
    if (anyJobInFlight) return
    if (submitGuardRef.current) return
    const topic = titleTopic.trim()
    if (!topic) {
      setSendError('Type a topic or rough idea so we know what to brainstorm titles for.')
      setSendErrorMeta(null)
      return
    }
    submitGuardRef.current = true
    const userText = topic
    setSendError('')
    setSendErrorMeta(null)
    setTitleTopic('')
    // In-place pending pattern for titles: instead of the separate
    // `pendingAssistant` loader (which would unmount when results
    // arrive and remount the real card next to it — visible jump),
    // push the assistant placeholder NOW with `_titlesPending: true`
    // and a row count. The card renders the TitlesLoader skeleton
    // inside its body. When titles arrive we patch this same entry
    // in place so the card stays mounted and the skeleton crossfades
    // to populated rows. ChatGPT-style.
    const localIds = pushLocalAssistantMessage(userText, {
      content: '',
      userRequest: topic,
      titleIdeas: null,
      _titlesPending: true,
      titleIdeasCount: titleCount,
    })
    const op_id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `titles-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    pendingActions.enqueue({
      op_id,
      kind: 'titles',
      conversationId,
      userText,
      sourceImageUrl: null,
      extra: { titleCount },
    })
    // Pre-persist the pending titles pair so a refresh mid-generation
    // keeps the conversation. `title_ideas_count` lets the reload
    // adapter pick the right loader row count.
    const prePersisted = await persistPendingEvent('titles', userText, {
      user_request: topic,
      mode: 'titles',
      title_ideas_count: titleCount,
    })
    if (prePersisted) {
      linkLocalToServer(localIds, prePersisted, conversationId)
      pendingActions.markPersisted(op_id, {
        serverConvId: prePersisted.conversation_id,
        serverUserMessageId: prePersisted.user_message?.id,
        serverAssistantMessageId: prePersisted.assistant_message?.id,
      })
    }
    const assistantServerId = prePersisted?.assistant_message?.id ?? null
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const res = await thumbnailsApi.titleIdeas(token, {
        topic,
        count: titleCount,
        pending_message_id: assistantServerId ?? undefined,
      })
      const titles = Array.isArray(res?.titles) ? res.titles : []
      if (!titles.length) throw new Error('No titles returned.')
      // Patch the SAME local entry — no remount, smooth in-place
      // skeleton → populated transition driven by AnimatePresence
      // inside TitleIdeasBlock.
      patchLocalAssistantMessage(localIds.assistantId, {
        titleIdeas: titles,
        _titlesPending: false,
      })
      await finalizePersistedEvent(assistantServerId, {
        user_request: topic,
        title_ideas: titles,
      })
    } catch (err) {
      const { code, message } = parseApiError(err, 'Could not generate titles.')
      // Drop the optimistic placeholder so the failure card lands
      // where the user expects (immediately after the user bubble).
      setLocalOnlyMessages((prev) =>
        prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
      )
      if (assistantServerId != null) {
        await finalizePersistedEvent(assistantServerId, {
          kind: 'failure',
          failed: true,
          mode: 'titles',
          error_code: code,
          error_message: message,
          retryable: true,
          user_request: topic,
        })
      } else {
        pushFailureEntry({
          mode: 'titles',
          userText: topic,
          errorCode: code,
          errorMessage: message,
          retryable: true,
        })
      }
    } finally {
      submitGuardRef.current = false
      pendingActions.complete(op_id)
    }
    // No `finally` clearing of `pendingUserMessage` — title mode no
    // longer uses the separate pending-bubble flow; the user bubble
    // is the local-entry pushed up front and is patched/dropped
    // depending on the result.
  }

  // Refs for the mode-specific submit handlers so the failure-card
  // retry dispatcher can call the latest closures.
  useEffect(() => {
    handleTitleIdeasSubmitRef.current = handleTitleIdeasSubmit
    handleRecreateSubmitRef.current = handleRecreateSubmit
    handleAnalyzeFooterSubmitRef.current = handleAnalyzeFooterSubmit
  })

  return (
    <div
      id="coach-panel-thumbnails"
      className="coach-main coach-main--thumb"
      role="tabpanel"
      aria-labelledby="coach-tab-thumbnails"
    >
      <ThumbBackgroundFX />
      {/* Inline SVG filter defs — replaces the previous backdrop-filter
          blur effects with a single GPU-light SVG filter that elements
          can opt into via `filter: url(#tg-glass)`. The filter is
          intentionally tiny (no blur, no displacement) so it doesn't
          re-create the memory cost of backdrop-filter blur surfaces:
              - feColorMatrix lifts saturation a notch.
              - feComponentTransfer adds a subtle linear contrast lift.
          Applied to one or two key surfaces only; all other previously-
          glassy elements are now solid. */}
      <svg
        className="thumb-gen-svg-defs"
        aria-hidden
        focusable="false"
        width="0"
        height="0"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      >
        <defs>
          <filter id="tg-glass" x="0%" y="0%" width="100%" height="100%">
            <feColorMatrix
              type="matrix"
              values="1.05 0    0    0 0
                      0    1.05 0    0 0
                      0    0    1.05 0 0
                      0    0    0    1 0"
            />
            <feComponentTransfer>
              <feFuncR type="linear" slope="1.04" intercept="0" />
              <feFuncG type="linear" slope="1.04" intercept="0" />
              <feFuncB type="linear" slope="1.04" intercept="0" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <motion.section
        className={`coach-chat-shell${isScrolled ? ' coach-chat-shell--scrolled' : ''}${isEmptyScreen ? ' coach-chat-shell--empty' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: IOS_EASE }}
      >
        <div className="thumb-bg-fx-top-shadow" aria-hidden="true" />
        {/* Top-bar — owns the menu button + trial / upgrade pill +
         * credits badge. Rendered INSIDE the chat shell so it
         * inherits the shell's centring — Go Pro pill lands directly
         * above the chat heading + composer, which are siblings in
         * the same shell. The shell is `position: relative` so the
         * topbar's `position: absolute` positions against it. The
         * shell's entry transform is fine because absolute children
         * move WITH the parent (containing-block is the shell).
         * Hides the global Sidebar's .sidebar-open-btn while mounted
         * (via body.clixa-thumb-screen). */}
        <ThumbnailTopBar />
        <div
          ref={threadRef}
          className={`coach-thread ${layoutCentered ? 'coach-thread--empty' : ''} coach-thread--thumb-panel ${isHistoryLoading ? 'coach-thread--history-loading' : ''}`}
        >
          {isHistoryLoading && <ChatHistorySkeleton />}

          {!isHistoryLoading && conversationQuery.isError && conversationId != null ? (
            <div className="coach-thread-state coach-thread-error">
              <p className="coach-thread-error__msg">
                Could not load this chat.{' '}
                {conversationQuery.error
                  ? `(${friendlyMessage(conversationQuery.error)})`
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

          {/* Empty greeting: render plain, no enter/exit animation. The
           * previous AnimatePresence wrapper played a 320ms opacity + y
           * exit when the user submitted, which kept the greeting in the
           * DOM alongside the new local message bubble for a third of a
           * second — visually reading as a brief "thumbnail generator
           * screen" flash before the chat settled. Removing the
           * animation makes the transition instant: the moment local
           * content lands, the greeting is gone and the bubble is in
           * its natural list position. */}
          {isEmptyScreen && (
            <div className="coach-empty-state thumb-empty-state">
              <h1>{emptyGreeting}</h1>
            </div>
          )}

          {/* Top sentinel — when this enters the viewport we fetch the
              next older-page of messages. Only attached when more
              history exists; otherwise we don't render it so the
              observer never fires. */}
          {!isHistoryLoading && hasMoreOlder && (
            <div ref={topSentinelRef} className="thumb-load-older-sentinel" aria-hidden />
          )}
          {!isHistoryLoading && isLoadingOlder && (
            <div className="thumb-load-older-row" role="status" aria-live="polite">
              <InlineSpinner size={12} />
              <span>Loading earlier messages…</span>
            </div>
          )}

          {!isHistoryLoading &&
            renderedMessages.map((msg) =>
              msg?._kind === 'failure' ? (
                <FailedAttemptBlock key={msg.id} entry={msg} onRetry={rowHandlers.onRetry} />
              ) : (
                <ChatMessageItem
                  key={msg.id}
                  msg={msg}
                  onReplaceThumbnail={rowHandlers.onReplaceThumbnail}
                  onRegenerate={rowHandlers.onRegenerate}
                  onOneClickFix={rowHandlers.onOneClickFix}
                  onViewImage={rowHandlers.onViewImage}
                  onEditImage={rowHandlers.onEditImage}
                  onUseTitle={rowHandlers.onUseTitle}
                />
              )
            )}

          {/* The pending user-bubble + loader now live INSIDE the
           * messages list as a single mounted card (`_promptPending`
           * on the local placeholder) — see ChatMessageItem. The old
           * sibling render block lived here and was the source of the
           * first-message flash: its hard mount/unmount happened in a
           * different React subtree from the eventual server messages,
           * so the swap was visually jarring. The in-place placeholder
           * keeps the same card mounted across the loader → result
           * crossfade. */}

          <div ref={messagesEndRef} />
        </div>

        <div className="thumb-bg-fx-shadow" aria-hidden="true" />

        <motion.footer
          ref={composerFooterRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: IOS_EASE }}
          className="coach-composer-wrap coach-composer-wrap--thumb-tools"
        >
          <div className="thumb-gen-footer-chrome">
            {/* Inline error pill removed — errors now surface as a top-
             * right toast (see `useEffect` watchers on `sendError` /
             * `editFooterError` further up, plus the `ToastStack`
             * mounted globally in `AppShellLayout`). */}

            {/* Floating mode tabbar — each mode is its own pill, active
             * one fills with violet. Tab rendering lives in
             * <ThumbPillTabs/> (memoised) so typing in the composer
             * doesn't re-render the tab row. */}
            <div className="thumb-gen-tab-row" role="tablist" aria-label="Thumbnail modes">
              <ThumbPillTabs
                options={thumbModeOptions}
                value={thumbMode}
                onChange={handleThumbModeTab}
                ariaLabel="Thumbnail modes"
              />
              {thumbMode === 'recreate' && (
                <ThumbPillTabs
                  options={SRC_OPTIONS_YOUTUBE}
                  value={recreateSourceMode}
                  onChange={setRecreateSourceMode}
                  ariaLabel="Source type"
                  align="right"
                />
              )}
              {thumbMode === 'analyze' && (
                <ThumbPillTabs
                  options={SRC_OPTIONS_YOUTUBE}
                  value={analyzeSourceMode}
                  onChange={setAnalyzeSourceMode}
                  ariaLabel="Source type"
                  align="right"
                />
              )}
              {thumbMode === 'edit' && (
                <ThumbPillTabs
                  options={SRC_OPTIONS_URL}
                  value={editSourceMode}
                  onChange={setEditSourceMode}
                  ariaLabel="Source type"
                  align="right"
                />
              )}
            </div>

            {/* Single glass composer pill — mode content only. The tab row
             * floats above as a sibling. The form pane wraps in a motion.div
             * with `layout="size"` so only its bounding box grows/shrinks
             * when the user toggles Link/Upload. */}
            <div className="coach-composer script-gen-composer thumb-gen-glass-composer">
              <SmoothHeight className="thumb-gen-mode-pane">
                {thumbMode === 'prompt' && (
                  <form onSubmit={handleSubmit} className="thumb-gen-mode-form">
                    <div className="coach-composer-input-wrap thumb-prompt-input-wrap">
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={(e) => setDraft(String(e.target.value).slice(0, 2000))}
                        rows={2}
                        className="coach-composer-input thumb-prompt-textarea"
                        maxLength={2000}
                        placeholder=""
                        disabled={anyJobInFlight}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (anyJobInFlight || submitGuardRef.current) return
                            handleSubmit(e)
                          }
                        }}
                      />
                      {/* Rotating multi-line hint overlay. Fades out as
                       * one block when the user starts typing or
                       * attaches an image; otherwise cycles through the
                       * THUMB_COMPOSER_HINTS examples with the
                       * exit/enter phase classes from the shared
                       * .coach-composer-placeholder recipe. */}
                      <div
                        className={`coach-composer-placeholder thumb-prompt-placeholder ${
                          draft || promptImageDataUrl ? 'is-hidden' : ''
                        }`}
                        aria-hidden
                      >
                        <span
                          className={`coach-composer-placeholder-text thumb-prompt-placeholder-text ${
                            composerHintPhase === 'exiting'
                              ? 'is-exiting'
                              : composerHintPhase === 'entering'
                                ? 'is-entering'
                                : ''
                          }`}
                        >
                          {composerHint}
                        </span>
                      </div>
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
                        {promptImageDataUrl ? (
                          <button
                            type="button"
                            className={`thumb-attach-pill ${attachPillClosing ? 'thumb-attach-pill--closing' : ''}`}
                            key={promptImageDataUrl}
                            onClick={() => {
                              if (attachPillClosing) return
                              promptFileInputRef.current?.click()
                            }}
                            title={promptImageName || 'Attached image — click to replace'}
                          >
                            <img
                              src={promptImageDataUrl}
                              alt=""
                              className="thumb-attach-pill__thumb"
                              loading="lazy"
                              decoding="async"
                            />
                            <span className="thumb-attach-pill__name">
                              {promptImageName || 'Image'}
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              className="thumb-attach-pill__close"
                              onClick={(e) => {
                                e.stopPropagation()
                                closeAttachPillAnimated()
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  closeAttachPillAnimated()
                                }
                              }}
                              aria-label="Remove attached image"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                              </svg>
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="coach-composer-tool coach-composer-tool--circle thumb-gen-toolbar-attach"
                            onClick={() => promptFileInputRef.current?.click()}
                            aria-label="Add image"
                            title="Add image"
                          >
                            <IconPaperclip />
                          </button>
                        )}
                        <PersonaSelector onOpenLibrary={onOpenPersonas} variant="glassCircle" />
                        <StyleSelector onOpenLibrary={onOpenStyles} variant="glassCircle" />
                        <ThumbBatchCirclePicker
                          value={numThumbnails}
                          onChange={(v) => setNumThumbnails(Number(v))}
                          disabled={anyJobInFlight}
                        />
                      </div>
                      <div className="thumb-gen-submit-group">
                        <ThumbSendPill
                          featureKey="thumbnail_generate"
                          count={numThumbnails}
                          disabled={anyJobInFlight || (!draft.trim() && !promptImageDataUrl)}
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
                          <div className="thumb-source-input-wrap">
                            <input
                              type="url"
                              className="thumb-source-input"
                              placeholder=""
                              value={recreateUrlInput}
                              onChange={(e) => setRecreateUrlInput(e.target.value.slice(0, 280))}
                            />
                            <SmoothHint visible={!recreateUrlInput} variant="url">
                              Drop a YouTube link or image URL
                            </SmoothHint>
                          </div>
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
                        onChange={(e) => setRecreateDraft(String(e.target.value).slice(0, 2000))}
                        placeholder=""
                        rows={1}
                        className="coach-composer-input"
                        maxLength={2000}
                        disabled={anyJobInFlight}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (anyJobInFlight || submitGuardRef.current) return
                            handleRecreateSubmit(e)
                          }
                        }}
                      />
                      <SmoothHint visible={!recreateDraft} variant="textarea">
                        Anything you want to tweak? (optional)
                      </SmoothHint>
                    </div>
                    <div className="coach-composer-actions thumb-gen-toolbar">
                      <div className="thumb-gen-toolbar-tools">
                        <PersonaSelector onOpenLibrary={onOpenPersonas} variant="glassCircle" />
                        <StyleSelector onOpenLibrary={onOpenStyles} variant="glassCircle" />
                        <ThumbBatchCirclePicker
                          value={numRecreateThumbnails}
                          onChange={(v) => setNumRecreateThumbnails(Number(v))}
                          disabled={anyJobInFlight}
                        />
                      </div>
                      <div className="thumb-gen-submit-group">
                        <ThumbSendPill
                          featureKey="thumbnail_recreate"
                          count={1}
                          disabled={
                            anyJobInFlight ||
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
                          <div className="thumb-source-input-wrap">
                            <input
                              type="url"
                              className="thumb-source-input"
                              placeholder=""
                              value={analyzeUrlInput}
                              onChange={(e) => setAnalyzeUrlInput(e.target.value.slice(0, 280))}
                            />
                            <SmoothHint visible={!analyzeUrlInput} variant="url">
                              Drop a YouTube link or image URL
                            </SmoothHint>
                          </div>
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
                      {/* Same shape as the Recreate textarea so the two
                       * tabs share one typing-area silhouette. `rows=1`
                       * + textarea (instead of <input>) lets long titles
                       * wrap inside the bar instead of scrolling
                       * horizontally off-screen. */}
                      <textarea
                        value={analyzeTitle}
                        onChange={(e) => setAnalyzeTitle(e.target.value.slice(0, 200))}
                        placeholder=""
                        rows={1}
                        className="coach-composer-input"
                        maxLength={200}
                        disabled={anyJobInFlight}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (anyJobInFlight || submitGuardRef.current) return
                            handleAnalyzeFooterSubmit(e)
                          }
                        }}
                      />
                      <SmoothHint visible={!analyzeTitle} variant="textarea">
                        Add the video title for sharper analysis (optional)
                      </SmoothHint>
                    </div>
                    <div className="thumb-gen-analyze-submit-row">
                      <ThumbSendPill
                        featureKey="thumbnail_analyze"
                        disabled={
                          anyJobInFlight ||
                          !(analyzeSourceMode === 'upload' ? analyzeSourceImage : analyzePreviewUrl)
                        }
                        ariaLabel="Analyze thumbnail"
                      />
                    </div>
                  </form>
                )}

                {thumbMode === 'titles' && (
                  <form onSubmit={handleTitleIdeasSubmit} className="thumb-gen-mode-form">
                    <div className="coach-composer-input-wrap thumb-prompt-input-wrap">
                      <textarea
                        value={titleTopic}
                        onChange={(e) => setTitleTopic(e.target.value.slice(0, 600))}
                        placeholder=""
                        rows={2}
                        className="coach-composer-input"
                        maxLength={600}
                        disabled={anyJobInFlight}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            if (anyJobInFlight || submitGuardRef.current) return
                            handleTitleIdeasSubmit(e)
                          }
                        }}
                      />
                      <SmoothHint visible={!titleTopic} variant="textarea">
                        Topic, rough idea, or angle — what should the titles be about?
                      </SmoothHint>
                    </div>
                    <div className="coach-composer-actions thumb-gen-toolbar">
                      <div className="thumb-gen-toolbar-tools">
                        <ThumbTitleCountPicker
                          value={titleCount}
                          onChange={setTitleCount}
                          disabled={anyJobInFlight}
                        />
                      </div>
                      <div className="thumb-gen-submit-group">
                        <ThumbSendPill
                          featureKey="thumbnail_title_ideas"
                          count={titleCount}
                          disabled={anyJobInFlight || !titleTopic.trim()}
                          ariaLabel="Brainstorm titles"
                        />
                      </div>
                    </div>
                  </form>
                )}

                {thumbMode === 'edit' && (
                  <form onSubmit={handleEditSubmit} className="thumb-gen-mode-form">
                    <div className="thumb-source-inline-row">
                      {editSourceMode === 'url' ? (
                        <div className="thumb-source-input-wrap">
                          <input
                            type="url"
                            value={editUrlInput}
                            onChange={(e) => {
                              setEditUrlInput(e.target.value.slice(0, 800))
                              setEditDataUrl(null)
                              setEditFooterError('')
                            }}
                            placeholder=""
                            className="thumb-source-input"
                          />
                          <SmoothHint visible={!editUrlInput} variant="url">
                            Drop a YouTube link or image URL
                          </SmoothHint>
                        </div>
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
                      <span
                        className={`thumb-gen-edit-submit-wrap${canUseEdit ? '' : ' thumb-gen-edit-submit-wrap--premium'}`}
                      >
                        <ThumbSendPill
                          type="button"
                          disabled={editSourceMode === 'upload' ? !editDataUrl : !editPreviewUrl}
                          onClick={handleOpenEditFromFooter}
                          ariaLabel="Open editor"
                          label="Edit"
                          icon={
                            // Magic-wand glyph — matches the Edit tab icon.
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                              <path d="m18 9.064a3.049 3.049 0 0 0 -.9-2.164 3.139 3.139 0 0 0 -4.334 0l-11.866 11.869a3.064 3.064 0 0 0 4.33 4.331l11.87-11.869a3.047 3.047 0 0 0 .9-2.167zm-14.184 12.624a1.087 1.087 0 0 1 -1.5 0 1.062 1.062 0 0 1 0-1.5l7.769-7.77 1.505 1.505zm11.872-11.872-2.688 2.689-1.5-1.505 2.689-2.688a1.063 1.063 0 1 1 1.5 1.5zm-10.825-6.961 1.55-.442.442-1.55a1.191 1.191 0 0 1 2.29 0l.442 1.55 1.55.442a1.191 1.191 0 0 1 0 2.29l-1.55.442-.442 1.55a1.191 1.191 0 0 1 -2.29 0l-.442-1.55-1.55-.442a1.191 1.191 0 0 1 0-2.29zm18.274 14.29-1.55.442-.442 1.55a1.191 1.191 0 0 1 -2.29 0l-.442-1.55-1.55-.442a1.191 1.191 0 0 1 0-2.29l1.55-.442.442-1.55a1.191 1.191 0 0 1 2.29 0l.442 1.55 1.55.442a1.191 1.191 0 0 1 0 2.29zm-5.382-14.645 1.356-.387.389-1.358a1.042 1.042 0 0 1 2 0l.387 1.356 1.356.387a1.042 1.042 0 0 1 0 2l-1.356.387-.387 1.359a1.042 1.042 0 0 1 -2 0l-.387-1.355-1.358-.389a1.042 1.042 0 0 1 0-2z" />
                            </svg>
                          }
                        />
                        {!canUseEdit ? (
                          <span className="clixa-pro-crown" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path d="M3 8.5l3.5 3 3-5 2.5 4 2.5-4 3 5L21 8.5l-1.5 8.5h-15L3 8.5z" />
                              <path d="M4.5 18.5h15v1.5h-15z" />
                            </svg>
                          </span>
                        ) : null}
                      </span>
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
          onBeforeSubmit={async ({ mode, prompt, sourceImageUrl, persona, maskPreviewDataUrl }) => {
            // Store the composite preview for use in onSubmitFinalize.
            editMaskPreviewRef.current = maskPreviewDataUrl || null
            const kind = mode === 'faceswap' ? 'faceswap' : 'edit'
            const userText =
              mode === 'faceswap'
                ? `Face swap${persona?.name ? ` · ${persona.name}` : ''}`
                : prompt || ''
            // Strip base64 data URLs — large payloads cause POST to fail silently.
            const persistableSrc =
              sourceImageUrl && !sourceImageUrl.startsWith('data:') ? sourceImageUrl : null
            const prePersisted = await persistPendingEvent(kind, userText, {
              user_image_url: persistableSrc,
              user_request: userText,
              mode,
              ...(persona?.image_url ? { persona_image_url: persona.image_url } : {}),
            })
            return {
              pendingMessageId: prePersisted?.assistant_message?.id ?? null,
              pendingUserMessageId: prePersisted?.user_message?.id ?? null,
              pendingConversationId: prePersisted?.conversation_id ?? null,
            }
          }}
          onSubmitFinalize={async ({
            pendingMessageId,
            pendingUserMessageId,
            pendingConversationId,
            mode,
            prompt,
            sourceImageUrl,
            urls,
          }) => {
            // Use the mask-composite preview for the user bubble (shows drawn
            // region on the thumbnail). Falls back to the source URL.
            const bubbleImageUrl = editMaskPreviewRef.current || sourceImageUrl
            editMaskPreviewRef.current = null
            const userText = mode === 'faceswap' ? 'Face swap' : prompt || ''
            // Strip base64 data URLs before persisting.
            const persistableSrc =
              sourceImageUrl && !sourceImageUrl.startsWith('data:') ? sourceImageUrl : null
            if (urls.length <= 1) {
              const localIds = pushLocalAssistantMessage('', {
                content: '',
                imageUrl: urls[0] || null,
                userImageUrl: bubbleImageUrl,
              })
              if (pendingMessageId != null) {
                // Server has likely already PATCHed via pending_message_id
                // — this client-side PATCH is a safety net that also
                // stamps the user_image_url + final user_request label.
                await finalizePersistedEvent(pendingMessageId, {
                  kind: mode === 'faceswap' ? 'faceswap' : 'edit',
                  image_url: urls[0] || null,
                  user_image_url: persistableSrc,
                  user_request: userText,
                })
                // Bind BOTH local optimistic IDs to their server rows so the
                // post-finalize refetch doesn't ghost-render duplicates.
                const convIdForLink = pendingConversationId || conversationId
                if (convIdForLink) {
                  linkLocalToServer(
                    localIds,
                    {
                      conversation_id: convIdForLink,
                      user_message: pendingUserMessageId ? { id: pendingUserMessageId } : undefined,
                      assistant_message: { id: pendingMessageId },
                    },
                    convIdForLink
                  )
                }
              } else {
                // No pre-persist context — legacy post-hoc persist.
                const persisted = await persistEvent(
                  mode === 'faceswap' ? 'faceswap' : 'edit',
                  '',
                  {
                    image_url: urls[0] || null,
                    user_image_url: persistableSrc,
                  }
                )
                if (persisted) linkLocalToServer(localIds, persisted, conversationId)
              }
            } else {
              const thumbnails = urls.map((image_url, i) => ({
                title: `${i + 1}x`,
                image_url,
                emotion: '',
                psychology_angle: '',
              }))
              const localIds = pushLocalAssistantMessage('', {
                content: '',
                thumbnails,
                userImageUrl: bubbleImageUrl,
              })
              if (pendingMessageId != null) {
                await finalizePersistedEvent(pendingMessageId, {
                  kind: mode === 'faceswap' ? 'faceswap' : 'edit',
                  thumbnails,
                  user_image_url: persistableSrc,
                  user_request: userText,
                })
                const convIdForLink = pendingConversationId || conversationId
                if (convIdForLink) {
                  linkLocalToServer(
                    localIds,
                    {
                      conversation_id: convIdForLink,
                      user_message: pendingUserMessageId ? { id: pendingUserMessageId } : undefined,
                      assistant_message: { id: pendingMessageId },
                    },
                    convIdForLink
                  )
                }
              } else {
                const persisted = await persistEvent(
                  mode === 'faceswap' ? 'faceswap' : 'edit',
                  '',
                  {
                    thumbnails,
                    user_image_url: persistableSrc,
                  }
                )
                if (persisted) linkLocalToServer(localIds, persisted, conversationId)
              }
            }
            setShowEditDialog(false)
            setEditDialogUrl(null)
            setEditDataUrl(null)
            setEditUrlInput('')
            setEditPreviewUrl(null)
          }}
          onSubmitErrorFinalize={async ({
            pendingMessageId,
            mode,
            prompt,
            sourceImageUrl,
            error,
          }) => {
            // Convert the pending row into a durable failure row so the
            // chat reload shows the failed attempt (FailedGenerationCard).
            // Also push the local in-thread failure entry for the dialog
            // user (matches recreate/analyze UX).
            const editMode = mode || 'edit'
            const userText = mode === 'faceswap' ? '' : prompt || ''
            const failureKind = editMode === 'faceswap' ? 'faceswap' : 'edit'
            const persistableSrc =
              sourceImageUrl && !sourceImageUrl.startsWith('data:') ? sourceImageUrl : null
            pushFailureEntry({
              mode: failureKind,
              userText,
              userImageUrl: sourceImageUrl,
              errorCode: error?.code || null,
              errorMessage: error?.friendly || 'Edit failed.',
              retryable: !!error?.retryable,
              options: {
                base_image_url: sourceImageUrl,
                edit_mode: editMode,
                prompt: userText,
              },
            })
            if (pendingMessageId != null) {
              await finalizePersistedEvent(pendingMessageId, {
                kind: 'failure',
                failed: true,
                mode: editMode,
                error_code: error?.code || null,
                error_message: error?.friendly || 'Edit failed.',
                retryable: !!error?.retryable,
                user_image_url: persistableSrc,
                user_request: userText,
              })
            } else {
              // Pre-persist missed → write a fresh failure event so the
              // attempt still survives reload.
              persistEvent('failure', userText, {
                failed: true,
                mode: editMode,
                error_code: error?.code || null,
                error_message: error?.friendly || 'Edit failed.',
                retryable: !!error?.retryable,
                user_image_url: persistableSrc,
                user_request: userText,
              })
            }
          }}
          onError={(err) => {
            // Persist the editor failure as an in-thread card so it
            // survives a navigate-away. The dialog stays open so the
            // user can retry inside it; this card is the permanent
            // record. mode='edit' so handleRetryFailedAttempt's
            // `edit` case can re-open the dialog pre-loaded.
            const editMode = err?.editMode || 'edit'
            const failureKind = editMode === 'faceswap' ? 'faceswap' : 'edit'
            const userText = err?.prompt || ''
            const sourceImageUrl = err?.baseImageUrl || editDialogUrl
            const persistableSrc =
              sourceImageUrl && !sourceImageUrl.startsWith('data:') ? sourceImageUrl : null
            pushFailureEntry({
              mode: failureKind,
              userText,
              userImageUrl: sourceImageUrl,
              errorCode: err?.code || null,
              errorMessage: err?.friendly || 'Edit failed.',
              retryable: !!err?.retryable,
              options: {
                base_image_url: sourceImageUrl,
                edit_mode: editMode,
                prompt: userText,
              },
            })
            // Mirror the recreate / analyze / titles failure-persistence
            // contract: write a `kind='failure'` event into the active
            // conversation so a reload still shows the attempt. Without
            // this row, a failed edit/face-swap leaves only an in-memory
            // toast that dies the moment the user refreshes. Backend
            // stamps extra_data.kind from the first arg — pass 'failure'
            // here so buildMessagesFromApi's FailedGenerationCard reader
            // picks the row up on reload.
            persistEvent('failure', userText, {
              failed: true,
              mode: editMode,
              error_code: err?.code || null,
              error_message: err?.friendly || 'Edit failed.',
              retryable: !!err?.retryable,
              user_image_url: persistableSrc,
              user_request: userText,
            })
          }}
          onApply={async (result) => {
            // Editor returns either a single URL (batch = 1) or an array
            // (batch > 1). Grid render matches the normal multi-thumbnail
            // response shape so cards look identical in the chat. The
            // user bubble shows just the source thumbnail (no hardcoded
            // prose), so we render an image-only user message.
            const urls = Array.isArray(result) ? result : [result]
            const sourceImageUrl = editDialogUrl
            const persistableSrc =
              sourceImageUrl && !sourceImageUrl.startsWith('data:') ? sourceImageUrl : null
            if (urls.length <= 1) {
              const localIds = pushLocalAssistantMessage('', {
                content: '',
                imageUrl: urls[0] || null,
                userImageUrl: sourceImageUrl,
              })
              const persisted = await persistEvent('edit', '', {
                image_url: urls[0] || null,
                user_image_url: persistableSrc,
              })
              if (persisted) linkLocalToServer(localIds, persisted, conversationId)
            } else {
              const thumbnails = urls.map((image_url, i) => ({
                title: `${i + 1}x`,
                image_url,
                emotion: '',
                psychology_angle: '',
              }))
              const localIds = pushLocalAssistantMessage('', {
                content: '',
                thumbnails,
                userImageUrl: sourceImageUrl,
              })
              const persisted = await persistEvent('edit', '', {
                thumbnails,
                user_image_url: persistableSrc,
              })
              if (persisted) linkLocalToServer(localIds, persisted, conversationId)
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
