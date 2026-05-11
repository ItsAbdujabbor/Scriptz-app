import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect, memo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import {
  ArrowUp as LucideArrowUp,
  Check as LucideCheck,
  CloudUpload as LucideUploadCloud,
  Copy as LucideCopy,
  Download as LucideDownload,
  Pencil as LucidePencil,
  RefreshCw as LucideRefreshCw,
  Sparkles as LucideSparkles,
} from 'lucide-react'
import { getAccessTokenOrNull } from '../lib/query/authToken'
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
  useCreateThumbnailConversationMutation,
  useLoadOlderThumbnailMessagesMutation,
  useThumbnailRatingQuery,
  seedThumbnailRating,
} from '../queries/thumbnails/thumbnailQueries'
import { useThumbnailChatActivityStore } from '../stores/thumbnailChatActivityStore'
import { useThumbnailJobStatusStore } from '../stores/thumbnailJobStatusStore'
import { EditThumbnailDialog } from '../components/EditThumbnailDialog'
import { HeaderCreditsBadge } from '../components/HeaderCreditsBadge'
import { TabBar } from '../components/TabBar'
import { Dropdown, InlineSpinner, PrimaryPill } from '../components/ui'
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
import { useFloatingPosition } from '../lib/useFloatingPosition'
import { extractYoutubeUrl } from '../lib/youtubeUrl'
import { renderMessageContent } from '../lib/messageRender.jsx'
import { CostHint } from '../components/CostHint'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { toast } from '../lib/toast'
import { friendlyTitleFor, parseApiError } from '../lib/errorMessages'
import FailedGenerationCard from '../components/FailedGenerationCard'
import { canvasToBase64Png } from '../lib/canvasToBase64'
import { queryKeys } from '../lib/query/queryKeys'
import { broadcastCacheEvent } from '../lib/query/broadcastSync'
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

/* ─────────────────────────────────────────────────────────────────────
 * ICON WRAPPERS — thin pass-throughs over `lucide-react` so the rest of
 * the file keeps using `<IconPaperclip />`, `<IconArrowUp />`, etc.
 * exactly as before. Lucide gives us refined rounded line-caps and a
 * uniform stroke weight, which reads as the modern AI-app icon style.
 * `strokeWidth: 2.2` is a hair thicker than the default 2 — tightens
 * the visual density at small sizes (16-22 px).
 * ─────────────────────────────────────────────────────────────────── */
function IconCopy(props) {
  return <LucideCopy strokeWidth={2.2} {...props} />
}

function IconArrowUp(props) {
  return <LucideArrowUp strokeWidth={2.4} {...props} />
}

/**
 * SmoothHint — sibling overlay used as a fading placeholder over the
 * Recreate / Analyze / Edit inputs. Visible while the field is empty;
 * fades to opacity 0 the moment the user types or pastes anything,
 * mirroring the prompt-tab animated hint's behaviour. Set `variant` to
 * `textarea` for top-aligned hints (multi-line composer inputs) or
 * `url` for the centred pill-shaped URL inputs.
 */
function SmoothHint({ visible, variant = 'textarea', children }) {
  return (
    <span
      className={`smooth-hint smooth-hint--${variant} ${visible ? '' : 'is-hidden'}`}
      aria-hidden
    >
      {children}
    </span>
  )
}

/**
 * Top-of-screen plan callout. Floats at the top centre of the chat
 * shell. Hidden entirely for paid Pro users (active subscription that
 * isn't a trial); shown to free users and trialing users with the
 * appropriate CTA. Both CTAs route to #pro.
 *
 * Visual: dark-glass body, violet-tinted border + glow, sparkle icon
 * in brand violet, inset accent-gradient button on the right. Reads
 * as a single unified chip — info on the left, action on the right.
 */
function PlanCallout() {
  const { isSubscribed, isTrial } = usePlanEntitlements()
  // Hook must be called unconditionally before any early return to
  // satisfy rules-of-hooks.
  const handleClick = useCallback(() => {
    if (typeof window !== 'undefined') window.location.hash = 'pro'
  }, [])
  // Paid Pro (active subscription, not a trial) — nothing to upsell.
  if (isSubscribed && !isTrial) return null
  const onTrial = !!isTrial
  return (
    <div className="thumb-plan-callout" role="status" aria-live="polite">
      <span className="thumb-plan-callout__icon" aria-hidden>
        <LucideSparkles strokeWidth={2.2} />
      </span>
      <span className="thumb-plan-callout__text">
        {onTrial ? (
          <>
            <span className="thumb-plan-callout__label">Trial active</span>
            <span className="thumb-plan-callout__sub"> · finish setup</span>
          </>
        ) : (
          <>
            <span className="thumb-plan-callout__label">Unlock Pro</span>
            <span className="thumb-plan-callout__sub"> · unlimited thumbnails</span>
          </>
        )}
      </span>
      <button type="button" className="thumb-plan-callout__cta" onClick={handleClick}>
        <span className="thumb-plan-callout__cta-shine" aria-hidden />
        <span className="thumb-plan-callout__cta-label">{onTrial ? 'Skip Trial' : 'Go Pro'}</span>
      </button>
    </div>
  )
}

/**
 * Thin wrapper around the shared <PrimaryPill> primitive that keeps the
 * old ThumbSendPill call sites working without change, while routing the
 * visual spec to the canonical component. The credit chip is shown for
 * every user so the cost is always visible alongside the send arrow.
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
  return (
    <PrimaryPill
      type={type}
      featureKey={featureKey || undefined}
      count={count}
      showCost
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

function IconCheck(props) {
  return <LucideCheck strokeWidth={2.5} {...props} />
}

function IconPaperclip(props) {
  // Custom add-image glyph (src/assets/add-image.svg) — fill-based
  // icon that replaces the previous Lucide paperclip. Name kept for
  // backwards-compat with existing call sites.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="m12,21c0,.553-.448,1-1,1h-6c-2.757,0-5-2.243-5-5V5C0,2.243,2.243,0,5,0h12c2.757,0,5,2.243,5,5v6c0,.553-.448,1-1,1s-1-.447-1-1v-6c0-1.654-1.346-3-3-3H5c-1.654,0-3,1.346-3,3v6.959l2.808-2.808c1.532-1.533,4.025-1.533,5.558,0l5.341,5.341c.391.391.391,1.023,0,1.414-.195.195-.451.293-.707.293s-.512-.098-.707-.293l-5.341-5.341c-.752-.751-1.976-.752-2.73,0l-4.222,4.222v2.213c0,1.654,1.346,3,3,3h6c.552,0,1,.447,1,1ZM15,3.5c1.654,0,3,1.346,3,3s-1.346,3-3,3-3-1.346-3-3,1.346-3,3-3Zm0,2c-.551,0-1,.448-1,1s.449,1,1,1,1-.448,1-1-.449-1-1-1Zm8,12.5h-3v-3c0-.553-.448-1-1-1s-1,.447-1,1v3h-3c-.552,0-1,.447-1,1s.448,1,1,1h3v3c0,.553.448,1,1,1s1-.447,1-1v-3h3c.552,0,1-.447,1-1s-.448-1-1-1Z" />
    </svg>
  )
}

// Estimated durations for the GenerationProgress confidence bar. The
// bar is decoupled from real backend progress (we have no signal); these
// are tuned so the asymptotic ease lands ~92 % around the median wait.
// Calibrated for the current pipeline: Gemini rewrite (~1-2 s) + gpt-
// image-2 medium quality render (~8-14 s for single, ~20 s for a 4-up
// batch). Trim further if gpt-image-2 gets faster.
const GEN_DURATION_SINGLE_MS = 16000
const GEN_DURATION_BATCH_MS = 24000
const GEN_DURATION_RECREATE_MS = 18000

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
        "The image model wouldn't accept this prompt or reference image. " +
        'Try rephrasing or removing the reference image and generating again. ' +
        'Nothing was charged.'
      )
    case 'PROVIDER_RATE_LIMITED':
    case 'PROVIDER_BUSY':
      return (
        "Sorry — we're getting a lot of demand right now. Please try again " +
        'in a moment. Nothing was charged.'
      )
    case 'queue_full':
    case 'QUEUE_FULL':
      // Use the backend's friendly message verbatim — aiErrors.parseApiError
      // already formats it as "High demand right now — try again in Ns" with
      // the actual ETA from `extra.eta_seconds` or the `Retry-After` header.
      return (
        backendMsg || 'High demand right now — please try again in a moment. Nothing was charged.'
      )
    case 'HIGH_DEMAND':
      return "We're at capacity right now — please try again in a minute. " + 'Nothing was charged.'
    case 'PROVIDER_QUOTA_EXCEEDED':
      return (
        "We've hit a usage limit on our side and we're working on it. " +
        'Please try again later — nothing was charged.'
      )
    case 'PROVIDER_MISCONFIGURED':
      return (
        "Something's off on our end and we're investigating. Please try " +
        'again later — nothing was charged.'
      )
    case 'THUMBNAIL_BAD_REQUEST':
      return (
        "Something in this request didn't work. Try rewording the prompt or " +
        'using a different reference image. Nothing was charged.'
      )
    case 'PROVIDER_UNAVAILABLE':
      return 'Sorry — our image provider hiccupped. Nothing was charged. Want to try again?'
    case 'INSUFFICIENT_CREDITS':
      return "You don't have enough credits for this. Top up or upgrade your plan."
    case 'NO_ACTIVE_SUBSCRIPTION':
      return backendMsg // billing flow handles this via other UI paths
    default:
      return (
        backendMsg ||
        'Sorry — something went wrong on our end. Nothing was charged. Please try again.'
      )
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

// iOS-style cubic-bezier for layout/size transitions and screen fade-ins.
// (0.32, 0.72, 0, 1) is the standard approximation Apple uses across iOS.
const IOS_EASE = [0.32, 0.72, 0, 1]
const IOS_RESIZE_TRANSITION = { duration: 0.22, ease: IOS_EASE }

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
 * SmoothHeight — animates its container's height as children change.
 *
 * Previous revisions used framer-motion's `animate={{ height }}` plus a
 * ResizeObserver + React state roundtrip. That chain woke the React
 * reconciler and framer-motion's imperative animator on every nested
 * resize (textarea growth, DropZone mounts, etc.) — cheap individually
 * but it accumulated during long sessions.
 *
 * This version is plain DOM + one ResizeObserver that writes
 * `element.style.height` directly. CSS handles the actual interpolation
 * via a `height` transition. No React re-renders, no animation objects,
 * no motion lib. Cheapest way to get a smooth height animation.
 */
function SmoothHeight({ children, className = '' }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return undefined
    const apply = () => {
      const h = inner.scrollHeight
      if (outer.style.height !== `${h}px`) outer.style.height = `${h}px`
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(apply)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={outerRef}
      className={`thumb-smooth-height ${className}`}
      style={{ overflow: 'hidden' }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

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

// Reshape into the `{value,label,icon}` contract expected by ThumbPillTabs.
// Done once at module load — stable reference so the memoised tab row
// never invalidates on parent re-renders.
const THUMB_GEN_MODE_OPTIONS = THUMB_GEN_SUB_TABS.map((t) => ({
  value: t.id,
  label: t.label,
  icon: t.icon,
}))

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

/**
 * ThumbTitleCountPicker — glassCircle-styled chooser for the Titles
 * tab. Same silhouette as `ThumbBatchCirclePicker` (single circle
 * trigger + portaled popover) so the toolbar reads identically across
 * modes; only the option set differs (10 / 20 instead of 1-4).
 */
function ThumbTitleCountPicker({ value, onChange, disabled }) {
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
        aria-label={`Title ideas: ${value}`}
        title={disabled ? 'Title count' : 'How many titles to generate'}
      >
        <span className="thumb-batch-circle-trigger-badge thumb-batch-circle-trigger-badge--solo">
          {value}
        </span>
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={popoverRef}
            className="thumb-batch-circle-popover thumb-batch-circle-popover--floating"
            role="listbox"
            aria-label="Title count"
            style={popoverStyle}
          >
            <p className="thumb-batch-circle-popover-title">Titles</p>
            {[4, 8, 12].map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                className={`thumb-batch-circle-option ${n === value ? 'is-active' : ''}`}
                aria-selected={n === value}
                aria-label={`${n} title ideas per run`}
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

function IconDownload(props) {
  return <LucideDownload strokeWidth={2.2} {...props} />
}
function IconRefresh(props) {
  return <LucideRefreshCw strokeWidth={2.2} {...props} />
}
function IconEdit(props) {
  return <LucidePencil strokeWidth={2.2} {...props} />
}
function IconSparkle(props) {
  return <LucideSparkles strokeWidth={2.2} {...props} />
}
function extractBase64FromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const i = dataUrl.indexOf(';base64,')
  return i >= 0 ? dataUrl.slice(i + 8) : null
}

function IconUploadCloud(props) {
  return <LucideUploadCloud strokeWidth={1.8} {...props} />
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
    if (!onRegenerate || !recommendations.length) return
    const fixes = recommendations.slice(0, 3).join('; ')
    onRegenerate(`${baseRegeneratePrompt} Apply these improvements: ${fixes}.`)
  }, [onRegenerate, recommendations, baseRegeneratePrompt])
  const canOneClickFix =
    !!onRegenerate && canRegenerate && recommendations.length > 0 && !loadingScore && !scoreError

  // The score pill mounts whenever there's *something* to show — a real
  // score, a loading state, or an error. The component handles the
  // tier-colour palette + state-specific layout itself.
  const showScorePill = loadingScore || !!scoreError || score != null

  return (
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
                    {/* Refresh glyph from src/assets/refresh.svg —
                     * fill-based icon (paths default to currentColor)
                     * so it tints with the surrounding button colour. */}
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12,2a10.032,10.032,0,0,1,7.122,3H16a1,1,0,0,0-1,1h0a1,1,0,0,0,1,1h4.143A1.858,1.858,0,0,0,22,5.143V1a1,1,0,0,0-1-1h0a1,1,0,0,0-1,1V3.078A11.981,11.981,0,0,0,.05,10.9a1.007,1.007,0,0,0,1,1.1h0a.982.982,0,0,0,.989-.878A10.014,10.014,0,0,1,12,2Z" />
                      <path d="M22.951,12a.982.982,0,0,0-.989.878A9.986,9.986,0,0,1,4.878,19H8a1,1,0,0,0,1-1H9a1,1,0,0,0-1-1H3.857A1.856,1.856,0,0,0,2,18.857V23a1,1,0,0,0,1,1H3a1,1,0,0,0,1-1V20.922A11.981,11.981,0,0,0,23.95,13.1a1.007,1.007,0,0,0-1-1.1Z" />
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
})

const ThumbnailGridBlock = memo(function ThumbnailGridBlock({
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
})

/**
 * Card-filling progress for the pending-thumbnail slot. Whole card grows
 * left → right in a bright purple → pink gradient with a centred
 * percentage overlay. rAF-driven asymptotic ease toward ~92 %, then snaps
 * to 100 % when the parent flips `done`. No real backend signal — this is
 * a confidence-building animation calibrated by `estimatedDurationMs`.
 *
 * Memoised so unrelated parent re-renders during generation don't reset
 * the rAF loop or jump the percentage backward.
 */
const ThumbnailGenFill = memo(function ThumbnailGenFill({
  estimatedDurationMs = 25000,
  done = false,
}) {
  const [pct, setPct] = useState(0)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const doneRef = useRef(false)
  // Mirror pct in a ref so the `done` effect can read the *current*
  // pct without depending on it (avoids effect re-runs on every frame).
  const pctRef = useRef(0)
  useEffect(() => {
    pctRef.current = pct
  }, [pct])

  // Live backend progress wins when available — driven by the SSE job
  // stream (`/api/thumbnails/chat-jobs/...` events) → updates
  // `useThumbnailJobStatusStore` → here. Ranges 0..1 in the store; the
  // bar animates smoothly toward whatever the worker last reported.
  // Falls back to the estimated curve when the worker hasn't started
  // emitting progress yet (queued / very fresh submission).
  const livePct = useThumbnailJobStatusStore((s) => {
    const p = s.status?.progress
    if (typeof p !== 'number' || !Number.isFinite(p)) return null
    // Backend may emit 0..1 OR 0..100 depending on worker; normalize.
    const normalized = p > 1 ? p / 100 : p
    return Math.max(0, Math.min(0.99, normalized))
  })

  useEffect(() => {
    doneRef.current = false
    /* eslint-disable react-hooks/set-state-in-effect */
    setPct(0)
    /* eslint-enable react-hooks/set-state-in-effect */
    startRef.current = performance.now()

    const tick = (now) => {
      if (doneRef.current) return
      const elapsed = now - startRef.current
      const t = Math.max(0, Math.min(1, elapsed / estimatedDurationMs))
      // 1 - e^(-k*t) reaches ~0.92 at t=1 when k=2.55. Same curve the
      // shared GenerationProgress uses, kept consistent so percentages
      // feel the same speed across the app.
      const k = 2.55
      const v = ((1 - Math.exp(-k * t)) / (1 - Math.exp(-k))) * 0.92
      // If the backend has reported real progress, snap the floor to
      // that number so we never visually rewind below truth, then keep
      // the smooth curve animating forward from whichever is higher.
      const curveValue = Math.min(0.92, v)
      const target = livePct != null ? Math.max(curveValue, livePct) : curveValue
      setPct(Math.round(target * 100))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [estimatedDurationMs, livePct])

  // On `done` flip, the parent's `finishLoading` now drops
  // `pendingAssistant` immediately (single-frame swap with the result
  // card) so this branch effectively never plays — the article is
  // unmounted on the same commit. Kept for safety: if a future caller
  // sets `done` without unmounting, the bar still tweens to 100 over
  // ~280 ms instead of snapping.
  useEffect(() => {
    if (!done) return
    doneRef.current = true
    cancelAnimationFrame(rafRef.current)

    const startPct = pctRef.current
    if (startPct >= 100) return // already at 100, nothing to animate

    const startTime = performance.now()
    const duration = 280

    const animate = (now) => {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 2) // easeOut quad
      const next = Math.round(startPct + (100 - startPct) * eased)
      // Set-state-in-effect is intentional — fires only once per
      // generation completion, no cascading-render risk.

      setPct(next)
      if (t < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [done])

  return (
    <div
      className="thumb-gen-fill"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-busy={!done}
    >
      <div className="thumb-gen-fill__bar" style={{ width: `${pct}%` }}>
        <span className="thumb-gen-fill__sheen" aria-hidden="true" />
      </div>
      <div className="thumb-gen-fill__pct">
        {pct}
        <span className="thumb-gen-fill__pct-sign">%</span>
      </div>
    </div>
  )
})

/**
 * Pending-state loader for analyze mode. Cinematic + minimal:
 *
 *   * The user's thumbnail sits behind a soft violet sheen so it
 *     feels "intelligent" without going dark.
 *   * A vertical scan ribbon sweeps top → bottom on a slow loop.
 *   * A small bottom-corner pulse indicator (3 dots cycling) signals
 *     activity. NO rotating phase text, NO percentage, NO "Analyzing
 *     visuals…" copy. The motion alone reads as alive.
 *
 * Sized to the same 16:9 stage as the eventual `<AnalysisBreakdown>`
 * card so the in-place crossfade in `ChatMessageItem` never reflows.
 *
 * (`memo` because the parent re-renders on every keystroke in the
 * composer; the loader has no props that change inside one
 * generation, so memo skips re-renders entirely.)
 */
const ThumbnailAnalyzeLoader = memo(function ThumbnailAnalyzeLoader({ imageUrl }) {
  return (
    <div className="thumb-analyze-loader" aria-busy="true" aria-label="Analyzing thumbnail">
      <div className="thumb-analyze-loader__stage">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="thumb-analyze-loader__img"
            decoding="async"
            aria-hidden="true"
          />
        ) : null}
        <div className="thumb-analyze-loader__sheen" aria-hidden="true" />
        <div className="thumb-analyze-loader__scan" aria-hidden="true" />
        <div className="thumb-analyze-loader__pulse" aria-hidden="true">
          <span className="thumb-analyze-loader__pulse-dot" />
          <span className="thumb-analyze-loader__pulse-dot" />
          <span className="thumb-analyze-loader__pulse-dot" />
        </div>
      </div>
    </div>
  )
})

/**
 * TitlesLoader — placeholder block for the Titles tab. Renders one
 * skeleton card per requested title (4 / 8 / 12) so the layout
 * matches the eventual `<TitleIdeasBlock>` exactly — no jump when
 * results arrive. Each card stagger-fades in and shimmers a
 * pulsing gradient across the title + reasoning placeholders. No
 * percentage text, no progress bar — the shimmer alone reads as
 * "thinking" and keeps the surface calm.
 */
const TitlesLoader = memo(function TitlesLoader({ count = 4 }) {
  const rows = Math.max(1, Math.min(count, 12))
  return (
    <div className="thumb-titles-loader" aria-busy="true" aria-label="Generating titles">
      <div className="thumb-titles-grid">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="thumb-title-card thumb-title-card--skeleton"
            style={{ animationDelay: `${i * 70}ms` }}
            aria-hidden
          >
            <span className="thumb-title-card__index thumb-title-card__index--skel">{i + 1}</span>
            <span className="thumb-title-card__body">
              <span className="thumb-title-card__title-skel" />
              <span className="thumb-title-card__reason-skel" />
              <span className="thumb-title-card__score-skel" />
            </span>
            <span className="thumb-title-card__actions-skel" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  )
})

function gradeFromScore(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return null
  if (n >= 90) return 'A+'
  if (n >= 80) return 'A'
  if (n >= 70) return 'B'
  if (n >= 60) return 'C'
  if (n >= 50) return 'D'
  return 'F'
}

function gradeTierClass(grade) {
  const g = String(grade || '').toUpperCase()
  if (g.startsWith('A')) return 'thumb-grade--a'
  if (g.startsWith('B')) return 'thumb-grade--b'
  if (g.startsWith('C')) return 'thumb-grade--c'
  if (g.startsWith('D')) return 'thumb-grade--d'
  if (g.startsWith('F')) return 'thumb-grade--f'
  return ''
}

/**
 * Why-the-thumbnail-got-that-score block. One compact card under the
 * analyzed thumbnail: grade + score on the left, the AI's one-line
 * reason on the right, and up to three terse "fix this" bullets below.
 * Same width as the thumbnail card so the two read as a single unit.
 */
const AnalysisBreakdown = memo(function AnalysisBreakdown({ analysis }) {
  const overallScore = useMemo(() => {
    const n = Number(analysis?.overall_score)
    return Number.isFinite(n) ? Math.round(n) : null
  }, [analysis])
  const grade = useMemo(() => {
    if (analysis?.overall_grade) return String(analysis.overall_grade)
    return gradeFromScore(analysis?.overall_score)
  }, [analysis])
  const fixes = useMemo(() => {
    const list =
      Array.isArray(analysis?.top_fixes) && analysis.top_fixes.length > 0
        ? analysis.top_fixes
        : Array.isArray(analysis?.recommendations)
          ? analysis.recommendations
          : []
    return list.filter(Boolean).slice(0, 3)
  }, [analysis])
  const oneLiner = analysis?.one_liner || analysis?.specific_advice || ''

  if (!analysis) return null
  return (
    <div className={`thumb-analysis-card coach-stream-block ${gradeTierClass(grade)}`}>
      <div className="thumb-analysis-card-head">
        <div className="thumb-analysis-card-grade">
          <span className="thumb-analysis-card-grade-letter">{grade || '—'}</span>
          <span className="thumb-analysis-card-score">
            {overallScore != null ? overallScore : '—'}
            <span className="thumb-analysis-card-score-max"> / 100</span>
          </span>
        </div>
        {oneLiner && <p className="thumb-analysis-card-oneliner">{oneLiner}</p>}
      </div>
      {fixes.length > 0 && (
        <ul className="thumb-analysis-card-fixes">
          {fixes.map((s, i) => (
            <li key={`fix-${i}`}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  )
})

// Map a Gemini click-likelihood score (0-100) to a tier so the score
// badge picks an appropriate accent colour without exposing raw
// thresholds in the JSX. Same buckets the model uses internally.
function titleScoreTier(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return 'na'
  if (n >= 90) return 'a'
  if (n >= 80) return 'b'
  if (n >= 70) return 'c'
  return 'd'
}

/**
 * TitleIdeasBlock — renders Gemini-generated YouTube title ideas as a
 * grid of cards with the title up top, a one-line "why this works"
 * reasoning below, and two action chips on the right: Copy (writes
 * the title to the clipboard) and Generate thumbnail (drops the
 * title into the Prompt-tab textarea and switches mode). Cards use
 * the same surface family as the thumbnail batch card and
 * stagger-enter via a CSS keyframe so the list reveals smoothly.
 */
function TitleIdeasBlock({ titles, onUseTitle }) {
  const [copiedIndex, setCopiedIndex] = useState(null)
  const handleCopy = useCallback((text, idx) => {
    if (!text) return
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {})
    }
    setCopiedIndex(idx)
    setTimeout(() => {
      setCopiedIndex((current) => (current === idx ? null : current))
    }, 1400)
  }, [])
  return (
    <div className="thumb-titles-block coach-stream-block">
      <div className="thumb-titles-grid">
        {titles.map((t, i) => {
          const title = (t?.title || '').trim()
          if (!title) return null
          const copied = copiedIndex === i
          return (
            <div
              key={`${i}-${title}`}
              className="thumb-title-card"
              style={{ animationDelay: `${Math.min(i * 32, 600)}ms` }}
            >
              <span className="thumb-title-card__index">{i + 1}</span>
              <span className="thumb-title-card__body">
                <span className="thumb-title-card__title">{title}</span>
                {t?.reasoning ? (
                  <span className="thumb-title-card__reason">{t.reasoning}</span>
                ) : null}
                {Number.isFinite(t?.score) && (
                  <span
                    className={`thumb-title-card__score thumb-title-card__score--${titleScoreTier(t.score)}`}
                    aria-label={`Click-likelihood score: ${t.score} of 100`}
                    title="Click-likelihood score"
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
                      <path d="M12 2 14.55 8.5 21.5 9 16.25 13.6 17.85 20.5 12 17.1 6.15 20.5 7.75 13.6 2.5 9l6.95-.5L12 2z" />
                    </svg>
                    <span className="thumb-title-card__score-num">{t.score}</span>
                  </span>
                )}
              </span>
              <span className="thumb-title-card__actions">
                <button
                  type="button"
                  className={`thumb-title-action thumb-title-action--icon ${copied ? 'thumb-title-action--copied' : ''}`}
                  onClick={() => handleCopy(title, i)}
                  aria-label={copied ? 'Copied' : `Copy title: ${title}`}
                  title={copied ? 'Copied' : 'Copy title'}
                >
                  {copied ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
                {onUseTitle && (
                  <button
                    type="button"
                    className="thumb-title-action thumb-title-action--primary"
                    onClick={() => onUseTitle(title)}
                    aria-label={`Generate a thumbnail for: ${title}`}
                    title="Generate a thumbnail with this title"
                  >
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
                      <path d="M19.5,24a1,1,0,0,1-.929-.628l-.844-2.113-2.116-.891a1.007,1.007,0,0,1,.035-1.857l2.088-.791.837-2.092a1.008,1.008,0,0,1,1.858,0l.841,2.1,2.1.841a1.007,1.007,0,0,1,0,1.858l-2.1.841-.841,2.1A1,1,0,0,1,19.5,24ZM10,21a2,2,0,0,1-1.936-1.413L6.45,14.54,1.387,12.846a2.032,2.032,0,0,1,.052-3.871L6.462,7.441,8.154,2.387A1.956,1.956,0,0,1,10.108,1a2,2,0,0,1,1.917,1.439l1.532,5.015,5.03,1.61a2.042,2.042,0,0,1,0,3.872h0l-5.039,1.612-1.612,5.039A2,2,0,0,1,10,21Z" />
                    </svg>
                    <span>Generate</span>
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
  onViewImage,
  onEditImage,
  onUseTitle,
}) {
  return (
    <article
      className={`coach-message coach-message--enter ${msg.role === 'user' ? 'coach-message--user' : 'coach-message--assistant'}`}
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
          {msg.imageUrl ? (
            <ThumbnailImageBlock
              imageUrl={msg.imageUrl}
              userRequest={msg.userRequest}
              msgId={msg.id}
              onReplaceThumbnail={onReplaceThumbnail}
              onRegenerate={onRegenerate}
              onViewImage={onViewImage}
              onEditImage={onEditImage}
              canRegenerate
            />
          ) : null}
          {/* Prompt / recreate in-place pending: when the placeholder is
           * pushed with `_promptPending: true`, render the existing
           * <ThumbnailGenFill> loader inside the SAME mounted card. When
           * the API result is patched in (clearing `_promptPending` and
           * filling `thumbnails`), AnimatePresence crossfades to the
           * populated grid below. The old sibling-loader block (rendered
           * outside the messages list) used to flash on first message
           * because the loader and the result lived in different React
           * subtrees — this in-place pattern keeps the assistant card
           * mounted across the swap. */}
          {msg._promptPending && (
            <motion.div
              key="prompt-loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: IOS_EASE }}
              style={{ width: '100%' }}
            >
              <div className="thumb-gen-loader" aria-busy="true" aria-label="Generating thumbnail">
                <div className="thumb-gen-loader__stage">
                  <ThumbnailGenFill
                    estimatedDurationMs={(() => {
                      const lockedMode = msg._promptMode || 'prompt'
                      const count = msg._promptCount || 1
                      if (lockedMode === 'recreate') {
                        return count > 1 ? GEN_DURATION_BATCH_MS : GEN_DURATION_RECREATE_MS
                      }
                      return count > 1 ? GEN_DURATION_BATCH_MS : GEN_DURATION_SINGLE_MS
                    })()}
                  />
                </div>
                <ThumbnailGenSlowHint
                  estimatedDurationMs={(() => {
                    const lockedMode = msg._promptMode || 'prompt'
                    const count = msg._promptCount || 1
                    if (lockedMode === 'recreate') {
                      return count > 1 ? GEN_DURATION_BATCH_MS : GEN_DURATION_RECREATE_MS
                    }
                    return count > 1 ? GEN_DURATION_BATCH_MS : GEN_DURATION_SINGLE_MS
                  })()}
                />
              </div>
            </motion.div>
          )}
          {/* Analyze branch: same in-place pending pattern as titles. The
           * submit handler pushes a placeholder local message with
           * `_analyzePending: true` + `userImageUrl` set; we render the
           * minimal cinematic loader inside the SAME card. When the
           * /rate response lands, `patchLocalAssistantMessage` fills in
           * `analysis` and clears the flag — AnimatePresence crossfades
           * loader → AnalysisBreakdown within one mounted container, so
           * the loader and the result are NEVER both visible at once
           * (which was the duplicate the user reported). */}
          {(msg._analyzePending || msg.analysis) && (
            <motion.div layout style={{ width: '100%' }}>
              <AnimatePresence mode="wait" initial={false}>
                {msg._analyzePending ? (
                  <motion.div
                    key="analyze-loader"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: IOS_EASE }}
                  >
                    <ThumbnailAnalyzeLoader imageUrl={msg.userImageUrl || msg.imageUrl} />
                  </motion.div>
                ) : msg.analysis ? (
                  <motion.div
                    key="analyze-populated"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.28, ease: IOS_EASE }}
                  >
                    <AnalysisBreakdown analysis={msg.analysis} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
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
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: IOS_EASE }}
                  >
                    <TitlesLoader count={msg.titleIdeasCount || 4} />
                  </motion.div>
                ) : msg.titleIdeas?.length > 0 ? (
                  <motion.div
                    key="titles-populated"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: IOS_EASE }}
                  >
                    <TitleIdeasBlock titles={msg.titleIdeas} onUseTitle={onUseTitle} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
          {msg.thumbnails?.length > 0 && (
            <ThumbnailGridBlock
              thumbnails={msg.thumbnails}
              userRequest={msg.userRequest}
              msgId={msg.id}
              onReplaceThumbnail={onReplaceThumbnail}
              onRegenerate={onRegenerate}
              onViewImage={onViewImage}
              onEditImage={onEditImage}
              canRegenerate
            />
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
    a._editPending !== b._editPending ||
    a._serverMessageId !== b._serverMessageId
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
    const ed = (isAssistant && m.extra_data) || {}
    const isUser = m.role === 'user'
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
    // User-message side: a persisted event flow stores the source
    // thumbnail on the ASSISTANT row's `extra_data.user_image_url`.
    // The user row in the chat thread reads the same field forwarded
    // from its sibling so the bubble can render an image-only message.
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      userRequest: ed.user_request || '',
      thumbnails: ed.thumbnails || [],
      imageUrl: ed.image_url || null,
      // Source thumbnail used for the user bubble in recreate /
      // analyze / edit / faceswap flows.
      _userImageUrl: ed.user_image_url || null,
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
function mergeFailurePairs(messages) {
  const next = []
  for (let i = 0; i < messages.length; i++) {
    const cur = messages[i]
    if (cur._kind === 'failure') {
      const prior = next[next.length - 1]
      if (prior && prior._isUser) {
        // Pull user content into the failure entry, then remove the
        // user row from the rendered list — FailedAttemptBlock owns
        // the user bubble for failure rows.
        const folded = {
          ...cur,
          userText: cur.userText || prior.content || '',
          userImageUrl: cur.userImageUrl || prior.imageUrl || null,
        }
        next.pop()
        next.push(folded)
        continue
      }
    }
    next.push(cur)
  }
  return next
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
 * Sort messages strictly by their server-assigned numeric id. Server ids
 * are monotonic (Postgres SERIAL), so ascending id == chronological order
 * with no ambiguity. Non-numeric ids (local-only recreate / analyze
 * messages, see `localOnlyMessages` state) sort to the end in insertion
 * order — those don't intermix with chat-mode messages anyway.
 */
function sortByServerId(messages) {
  return [...messages].sort((a, b) => {
    const ai = typeof a.id === 'number' ? a.id : Number.MAX_SAFE_INTEGER
    const bi = typeof b.id === 'number' ? b.id : Number.MAX_SAFE_INTEGER
    return ai - bi
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
  const queryClient = useQueryClient()
  // Paywall gate. Trial users are subscribed; pure free users (no
  // active subscription, no trial) are not. When they try to fire any
  // generate/analyze/edit submit, we route them to #pro instead of
  // running the action — `requirePaywall()` returns false in that
  // case so handlers can short-circuit cleanly.
  const { isSubscribed: hasPaidOrTrialPlan } = usePlanEntitlements()
  const requirePaywall = useCallback(() => {
    if (hasPaidOrTrialPlan) return true
    toast.info('Start a plan to generate thumbnails.', {
      title: 'Upgrade required',
    })
    if (typeof window !== 'undefined') window.location.hash = 'pro'
    return false
  }, [hasPaidOrTrialPlan])
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
  // Server-canonical chat thread. Every entry has a numeric server-assigned
  // id. Conversation refetches replace this wholesale — no merges, no
  // dedupe. Submit handlers commit the (user_message, assistant_message)
  // pair returned by the chat endpoint atomically.
  const [messages, setMessages] = useState([])
  // Local-only thread for flows that don't write through the chat endpoint:
  // recreate (regenerateWithPersona) and analyze (rate). These don't have
  // a server record so we keep them in a separate bucket — they survive
  // chat refetches and are rendered AFTER the server messages.
  const [localOnlyMessages, setLocalOnlyMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [numThumbnails, setNumThumbnails] = useState(1)
  const [numRecreateThumbnails, setNumRecreateThumbnails] = useState(1)
  const [sendError, setSendError] = useState('')
  // Structured metadata for the most recent sendError — lets the footer
  // render a Retry pill only when the error is retryable.
  const [sendErrorMeta, setSendErrorMeta] = useState(null)
  // `pendingAssistant` gates submit handlers + composer disable while a
  // chat-mode generation is running. The user-bubble + loader are no
  // longer rendered as siblings (they live INSIDE the assistant card
  // via `_promptPending` on the local placeholder), so the only
  // remaining role of this flag is double-submit / disabled-state.
  const [pendingAssistant, setPendingAssistant] = useState(false)
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
  const conversationQuery = useThumbnailConversationQuery(conversationId, {
    pollWhilePending: isCurrentConversationPending,
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
      onConversationCreated?.(id)
    },
    [onConversationCreated]
  )
  const chatMutation = useThumbnailChatMutation(handleConversationCreated)
  const createConversationMutation = useCreateThumbnailConversationMutation()
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
          handleConversationCreated(id)
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
    [channelId, createConversationMutation, handleConversationCreated, startPending]
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
      // Full reset on "New Chat" / blank chat screen.
      setMessages([])
      setLocalOnlyMessages([])
      setDraft('')
      setSendError('')
      setSendErrorMeta(null)
      setPendingAssistant(false)
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
      setMessages(mergeFailurePairs(stitchPersistedUserImages(built)))
    } else if (!matchesCurrent || !conversationQuery.data) {
      setMessages([])
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
    // null → N (creation): keep the optimistic local content visible.
    // Initial mount (prev === conversationId): nothing to wipe.
    if (prev == null || prev === conversationId) return
    // Real switch (N → M, or N → null): drop stale per-session content.
    setLocalOnlyMessages([])
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
      setPendingAssistant(false)
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
  const isLocallyCreatedConversation =
    conversationId != null && locallyCreatedConvIdsRef.current.has(Number(conversationId))
  const isHistoryLoading =
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
    const linkedServerIds = new Set()
    for (const m of localOnlyMessages) {
      if (m && m._serverMessageId != null) linkedServerIds.add(m._serverMessageId)
    }
    const sortedServer = sortByServerId(messages).filter((m) => !linkedServerIds.has(m.id))
    return [...sortedServer, ...localOnlyMessages]
  }, [messages, localOnlyMessages])
  const isEmptyScreen = !isHistoryLoading && renderedMessages.length === 0 && !pendingAssistant
  const layoutCentered = isEmptyScreen || isHistoryLoading

  // Auto-scroll on new messages or when a job kicks off / lands. Tab
  // changes (`thumbMode`) deliberately don't trigger a scroll: the
  // message list is conversation history and shouldn't move when the
  // user is just toggling the composer's mode chip. The composer's
  // height changes are absorbed by the ResizeObserver below that
  // updates `--coach-composer-stack-px`, so the bottom of the list
  // remains visible even as the toolbar grows/shrinks.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, localOnlyMessages.length, pendingAssistant])

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
  const openEditorForThumbnail = useCallback((url) => {
    if (!url) return
    setEditDialogUrl(url)
    setShowEditDialog(true)
  }, [])

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

  // Call on successful API completion. Drops the in-flight gate
  // immediately so the composer re-enables. The loader is no longer
  // a sibling — it lives inside the assistant card and is unmounted
  // by the `_promptPending: false` patch the caller already applied
  // before this runs. The result mounts in its place via the
  // AnimatePresence crossfade in ChatMessageItem.
  const finishLoading = useCallback(() => {
    if (finishLoadingRef.current) {
      clearTimeout(finishLoadingRef.current)
      finishLoadingRef.current = null
    }
    setPendingAssistant(false)
  }, [])

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

  // YouTube → thumbnail extraction is gated behind a trial / paid plan
  // (`hasPaidOrTrialPlan`). Free users never trigger the backend
  // `fetchExistingThumbnail` call from any of the three URL inputs;
  // direct image URLs still resolve locally for the edit form.
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
    if (!hasPaidOrTrialPlan) {
      setRecreatePreviewUrl(null)
      setRecreateFetchingPreview(false)
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
  }, [recreateSourceMode, recreateUrlInput, hasPaidOrTrialPlan])

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
    if (!hasPaidOrTrialPlan) {
      setAnalyzePreviewUrl(null)
      setAnalyzeFetchingPreview(false)
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
  }, [analyzeSourceMode, analyzeUrlInput, hasPaidOrTrialPlan])

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
          // Free users skip the YouTube extraction call entirely.
          if (!hasPaidOrTrialPlan || !token) {
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
  }, [editSourceMode, editUrlInput, editDataUrl, hasPaidOrTrialPlan])

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
    setLocalOnlyMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: 'user',
        content: userContent,
        imageUrl: assistant.userImageUrl || null,
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
    async (failure) => {
      const localId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const localEntry = {
        id: localId,
        _kind: 'failure',
        createdAt: Date.now(),
        ...failure,
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
        // Drop the optimistic local entry — the server pair will surface
        // through `buildMessagesFromApi` (next reload) or via the cache
        // we just hydrated (immediate). Either way, dedup is by server
        // id so we don't get a stale double.
        setLocalOnlyMessages((prev) => prev.filter((m) => m.id !== localId))
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
    if (!requirePaywall()) return
    const combined = draft.trim()
    if (!combined || pendingAssistant) return
    if (!promptImageDataUrl && combined.length < 5) {
      return
    }

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
      setSendError(friendly)
      setSendErrorMeta({
        code,
        retryable,
        retryAfterSeconds:
          extra?.retry_after_seconds ?? extra?.eta_seconds ?? err?.retryAfterSeconds ?? null,
        draft: combined,
      })
      toast.error(backendMsg, {
        code: code || undefined,
        title: friendlyTitleFor(code),
      })
      // Drop the in-place placeholders we pushed on submit; the failure
      // card below replaces them. (Without this, the user bubble +
      // empty assistant card would linger above the failure card.)
      setLocalOnlyMessages((prev) =>
        prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
      )
      // Persist the failed attempt in the chat thread so the user keeps
      // a visible record of what they asked for and can retry without
      // re-typing.
      pushFailureEntry({
        mode: 'prompt',
        userText: combined,
        userImageUrl: userImageAtSubmit,
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
      })
      setDraft(combined)
      setPendingAssistant(false)
      if (activeConversationId) clearPending(activeConversationId)
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
    async (kind, userContent, extraData) => {
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return null
        const res = await thumbnailsApi.appendEvent(token, {
          conversation_id: conversationId || undefined,
          channel_id: channelId || undefined,
          kind,
          user_content: userContent || '',
          extra_data: extraData || {},
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
      if (!userRequest?.trim() || pendingAssistant) return
      const localIds = pushLocalAssistantMessage(userRequest, {
        content: '',
        userRequest,
        _promptPending: true,
        _promptMode: 'prompt',
        _promptCount: 1,
      })
      setPendingAssistant(true)
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
        finishLoading()
      } catch (err) {
        const { code, message } = parseApiError(err, 'Regeneration failed')
        setLocalOnlyMessages((prev) =>
          prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
        )
        setSendError(message)
        setSendErrorMeta(null)
        setPendingAssistant(false)
        toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
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
      pushLocalAssistantMessage,
      patchLocalAssistantMessage,
      linkLocalToServer,
    ]
  )

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
    if (!requirePaywall()) return
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
    // The user's chat bubble shows just the source thumbnail and any
    // instructions they typed — no hardcoded "Recreate this thumbnail"
    // prose. The backend still receives `prompt: instructions` (the
    // recreate API endpoint encodes the operation, not the prompt).
    const userText = instructions
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
        patchLocalAssistantMessage(localIds.assistantId, {
          _promptPending: false,
          imageUrl,
        })
        const persisted = await persistEvent('recreate', userText, {
          image_url: imageUrl,
          user_image_url: sourceImageUrl,
          user_request: instructions,
          is_recreate: true,
        })
        if (persisted) linkLocalToServer(localIds, persisted, conversationId)
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
        const persisted = await persistEvent('recreate', userText, {
          thumbnails,
          user_image_url: sourceImageUrl,
          user_request: instructions,
          is_recreate: true,
        })
        if (persisted) linkLocalToServer(localIds, persisted, conversationId)
      }
      finishLoading()
    } catch (err) {
      const { code, message } = parseApiError(err, 'Could not recreate thumbnail.')
      setLocalOnlyMessages((prev) =>
        prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
      )
      setPendingAssistant(false)
      pushFailureEntry({
        mode: 'recreate',
        userText: instructions,
        userImageUrl: sourceImageUrl,
        errorCode: code,
        errorMessage: message,
        retryable: true,
      })
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
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
    if (!requirePaywall()) return
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
    if (!requirePaywall()) return
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
    if (!requirePaywall()) return
    const imageUrl = analyzeSourceMode === 'upload' ? analyzeSourceImage : analyzePreviewUrl
    if (!imageUrl) {
      setSendError('Add an image or YouTube link to analyze.')
      setSendErrorMeta(null)
      return
    }
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
    // be visible simultaneously (which used to cause the duplicate
    // the user reported during the `finishLoading` 360 ms tail).
    // No `pendingAssistant` / `pendingUserMessage` is set for analyze.
    const localIds = pushLocalAssistantMessage(userText, {
      content: '',
      userImageUrl: imageUrl,
      imageUrl,
      userRequest: '',
      analysis: null,
      _analyzePending: true,
    })
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
      })
      // Prime the per-image rating cache so the analyze card's
      // ScorePill resolves instantly from cache instead of firing a
      // second /rate (which would double-charge credits).
      seedThumbnailRating(queryClient, imageUrl, rating)
      // Patch the SAME local entry — no remount, smooth in-place
      // loader → analysis crossfade driven by AnimatePresence inside
      // ChatMessageItem.
      patchLocalAssistantMessage(localIds.assistantId, {
        analysis: rating,
        _analyzePending: false,
      })
      resolved = true
      const persisted = await persistEvent('analyze', userText, {
        image_url: imageUrl,
        user_image_url: imageUrl,
        analysis: rating,
      })
      if (persisted) linkLocalToServer(localIds, persisted, conversationId)
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
      pushFailureEntry({
        mode: 'analyze',
        userText: titleTrim,
        userImageUrl: imageUrl,
        errorCode: code,
        errorMessage: message,
        retryable: true,
      })
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
    }
    // No pending* state was set for analyze (in-place pattern), so
    // no `finally` cleanup is needed. The optimistic placeholder is
    // either patched (success) or removed (failure) inside the try
    // / catch above.
  }

  const handleTitleIdeasSubmit = async (e) => {
    e?.preventDefault?.()
    if (!requirePaywall()) return
    if (pendingAssistant) return
    const topic = titleTopic.trim()
    if (!topic) {
      setSendError('Type a topic or rough idea so we know what to brainstorm titles for.')
      setSendErrorMeta(null)
      return
    }
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
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const res = await thumbnailsApi.titleIdeas(token, {
        topic,
        count: titleCount,
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
      const persisted = await persistEvent('titles', userText, {
        user_request: topic,
        title_ideas: titles,
      })
      if (persisted) linkLocalToServer(localIds, persisted, conversationId)
    } catch (err) {
      const { code, message } = parseApiError(err, 'Could not generate titles.')
      // Drop the optimistic placeholder so the failure card lands
      // where the user expects (immediately after the user bubble).
      setLocalOnlyMessages((prev) =>
        prev.filter((m) => m.id !== localIds.userId && m.id !== localIds.assistantId)
      )
      // Persist as an inline failure card (mode='titles' so retry
      // re-fires this same handler with the same topic). Toast still
      // fires for top-of-screen visibility but the card stays in the
      // thread.
      pushFailureEntry({
        mode: 'titles',
        userText: topic,
        errorCode: code,
        errorMessage: message,
        retryable: true,
      })
      toast.error(message, { code: code || undefined, title: friendlyTitleFor(code) })
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
        {/* Top-right credits badge — pinned over the chat shell so it's
         * always reachable. Click → CreditPacks top-up dialog (same one
         * the rest of the app uses via the `app:open-credits-modal`
         * event). Hidden for unsubscribed users by HeaderCreditsBadge. */}
        <div className="thumb-screen-credits">
          <HeaderCreditsBadge />
        </div>
        <PlanCallout />
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
                <FailedAttemptBlock key={msg.id} entry={msg} onRetry={handleRetryFailedAttempt} />
              ) : (
                <ChatMessageItem
                  key={msg.id}
                  msg={msg}
                  onReplaceThumbnail={handleReplaceThumbnail}
                  onRegenerate={handleRegenerateOne}
                  onViewImage={openThumbLightbox}
                  onEditImage={openEditorForThumbnail}
                  onUseTitle={handleUseTitleAsPrompt}
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
                options={THUMB_GEN_MODE_OPTIONS}
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
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
                          pendingAssistant ||
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
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
                          disabled={pendingAssistant}
                        />
                      </div>
                      <div className="thumb-gen-submit-group">
                        <ThumbSendPill
                          featureKey="thumbnail_title_ideas"
                          count={titleCount}
                          disabled={pendingAssistant || !titleTopic.trim()}
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
                      <ThumbSendPill
                        type="button"
                        disabled={editSourceMode === 'upload' ? !editDataUrl : !editPreviewUrl}
                        onClick={handleOpenEditFromFooter}
                        ariaLabel="Open editor"
                        label="Edit"
                        icon={
                          // Magic-wand glyph from src/assets/magic-wand.svg —
                          // matches the icon used on the Edit tab itself so
                          // the action button on the edit form reads as the
                          // same family.
                          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="m18 9.064a3.049 3.049 0 0 0 -.9-2.164 3.139 3.139 0 0 0 -4.334 0l-11.866 11.869a3.064 3.064 0 0 0 4.33 4.331l11.87-11.869a3.047 3.047 0 0 0 .9-2.167zm-14.184 12.624a1.087 1.087 0 0 1 -1.5 0 1.062 1.062 0 0 1 0-1.5l7.769-7.77 1.505 1.505zm11.872-11.872-2.688 2.689-1.5-1.505 2.689-2.688a1.063 1.063 0 1 1 1.5 1.5zm-10.825-6.961 1.55-.442.442-1.55a1.191 1.191 0 0 1 2.29 0l.442 1.55 1.55.442a1.191 1.191 0 0 1 0 2.29l-1.55.442-.442 1.55a1.191 1.191 0 0 1 -2.29 0l-.442-1.55-1.55-.442a1.191 1.191 0 0 1 0-2.29zm18.274 14.29-1.55.442-.442 1.55a1.191 1.191 0 0 1 -2.29 0l-.442-1.55-1.55-.442a1.191 1.191 0 0 1 0-2.29l1.55-.442.442-1.55a1.191 1.191 0 0 1 2.29 0l.442 1.55 1.55.442a1.191 1.191 0 0 1 0 2.29zm-5.382-14.645 1.356-.387.389-1.358a1.042 1.042 0 0 1 2 0l.387 1.356 1.356.387a1.042 1.042 0 0 1 0 2l-1.356.387-.387 1.359a1.042 1.042 0 0 1 -2 0l-.387-1.355-1.358-.389a1.042 1.042 0 0 1 0-2z" />
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
          onError={(err) => {
            // Persist the editor failure as an in-thread card so it
            // survives a navigate-away. The dialog stays open so the
            // user can retry inside it; this card is the permanent
            // record. mode='edit' so handleRetryFailedAttempt's
            // `edit` case can re-open the dialog pre-loaded.
            pushFailureEntry({
              mode: 'edit',
              userText: err?.prompt || '',
              userImageUrl: err?.baseImageUrl || editDialogUrl,
              errorCode: err?.code || null,
              errorMessage: err?.friendly || 'Edit failed.',
              retryable: !!err?.retryable,
              options: {
                base_image_url: err?.baseImageUrl || editDialogUrl,
                edit_mode: err?.editMode || 'edit',
                prompt: err?.prompt || '',
              },
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
            if (urls.length <= 1) {
              const localIds = pushLocalAssistantMessage('', {
                content: '',
                imageUrl: urls[0] || null,
                userImageUrl: sourceImageUrl,
              })
              const persisted = await persistEvent('edit', '', {
                image_url: urls[0] || null,
                user_image_url: sourceImageUrl,
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
                user_image_url: sourceImageUrl,
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

/**
 * Renders a single failed-generation pair in the chat thread: the user's
 * prompt bubble (mirroring `ChatMessageItem`'s user-bubble shape) plus
 * the inline error card with retry / dismiss controls. Lives at the bottom
 * of the file so the chat list can call it as a regular component.
 */
function FailedAttemptBlock({ entry, onRetry }) {
  return (
    <>
      <article className="coach-message coach-message--user coach-message--enter">
        <div className="coach-user-message-stack">
          {entry.userImageUrl ? (
            <div className="thumb-user-sent-image">
              <img
                src={entry.userImageUrl}
                alt="Sent thumbnail"
                className="thumb-user-sent-img"
                decoding="async"
              />
            </div>
          ) : null}
          {entry.userText ? (
            <div className="coach-message-bubble">
              <p>{entry.userText}</p>
            </div>
          ) : null}
        </div>
      </article>
      <article className="coach-message coach-message--assistant coach-message--enter">
        <FailedGenerationCard entry={entry} onRetry={onRetry} />
      </article>
    </>
  )
}

/**
 * Staged loader hint that fades in inside the in-flight loader. Cycles
 * through three honest messages based on elapsed time:
 *
 *   stage 0 (0–1× estimated)  : silent — loader handles its own UI
 *   stage 1 (1–2× estimated)  : "Taking a little longer than usual…"
 *   stage 2 (2×+ estimated)   : "High demand right now — your thumbnail
 *                                is queued, hang tight."
 *
 * This gives users honest staged feedback during the wait without needing
 * SSE/polling. Auto-unmounts with the parent loader, so the timer is
 * cleaned up on every mount/unmount cycle.
 */
function ThumbnailGenSlowHint({ estimatedDurationMs }) {
  const [stage, setStage] = useState(0)
  // Live worker-side status drives the message when it's available.
  // The submit+poll wrapper writes here on every poll, so the hint
  // reflects what the worker is actually doing — "Calling provider",
  // "One quick retry — provider had a small hiccup", "Almost there" —
  // rather than a generic "taking longer". Backs the silent-retry UX:
  // the user sees friendly progress text instead of an alarming error
  // during transient blips.
  const liveStatus = useThumbnailJobStatusStore((s) => s.status)
  useEffect(() => {
    const baseline = Math.max(0, estimatedDurationMs || 0)
    if (baseline <= 0) return undefined
    const t1 = setTimeout(() => setStage(1), baseline)
    const t2 = setTimeout(() => setStage(2), baseline * 2)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [estimatedDurationMs])

  // Live worker status wins when present — but only show it once the
  // user has been waiting at least the baseline duration. For a job
  // that resolves in 4 s we don't want a "Queued — your turn is coming
  // up" message to flash; the silent loader handles fast cases.
  const liveMessage = liveStatus?.status_message
  if (liveMessage && stage >= 1) {
    return (
      <div className="thumb-gen-loader__slow-hint" role="status" aria-live="polite">
        {liveMessage}
      </div>
    )
  }

  if (stage === 0) return null
  const message =
    stage === 1
      ? 'Taking a little longer than usual — hang tight while the provider catches up.'
      : "High demand right now — your thumbnail is queued. We'll have it ready shortly."
  return (
    <div className="thumb-gen-loader__slow-hint" role="status" aria-live="polite">
      {message}
    </div>
  )
}
