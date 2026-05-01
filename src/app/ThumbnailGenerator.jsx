import { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect, memo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import {
  ArrowUp as LucideArrowUp,
  Check as LucideCheck,
  ChevronDown as LucideChevronDown,
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
import { EditThumbnailDialog } from '../components/EditThumbnailDialog'
import { TabBar } from '../components/TabBar'
import { Dropdown, InlineSpinner, PrimaryPill } from '../components/ui'
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
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
import { useThreadScrollToBottom } from '../lib/useThreadScrollToBottom'
import { CostHint } from '../components/CostHint'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { toast } from '../lib/toast'
import { friendlyTitleFor, parseApiError } from '../lib/errorMessages'
import { canvasToBase64Png } from '../lib/canvasToBase64'
// import './ScriptGenerator.css' // next update — ScriptGenerator moved to src/next-update-ideas
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

// Two-line example hints. The blank line break is rendered by the
// browser inside the native textarea placeholder, so users see the
// full idea — subject on line 1, mood / title / styling on line 2 —
// before they type anything.
const THUMB_COMPOSER_HINTS = [
  'A smiling explorer on a misty mountain peak at golden hour\nbold yellow Impact title “I SURVIVED 7 DAYS”, dramatic backlight',
  'Shocked face next to a huge pile of cash with red glow accents\nthick white outline, bold red title “I WON $1,000,000?!”',
  'Close-up iPhone 16 floating on a neon-purple gradient backdrop\nglossy reflection, bold white sans title “WORTH THE HYPE?”',
  'Ripped athlete mid-lift under dramatic red rim lighting\nblack vignette, bold yellow title “30-DAY TRANSFORMATION”',
  'Dark desk with a glowing laptop and cyan LED strips behind it\nfilm-noir mood, bold cyan title “I BUILT A SAAS IN 24 HOURS”',
  'Split before/after of a messy room and a clean room with arrow\nhigh-contrast lighting, bold green title “EXTREME CLEAN”',
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

function IconChevronDown(props) {
  return <LucideChevronDown strokeWidth={2.2} {...props} />
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
      setPct(Math.round(Math.min(0.92, v) * 100))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [estimatedDurationMs])

  // On `done` flip, smoothly animate from the current pct → 100 over
  // ~280 ms (easeOut), instead of snapping in a single frame. The
  // parent's finishLoading() holds the loader on screen for 360 ms,
  // so the fill completes naturally and rests at 100 % for ~80 ms
  // before the article unmounts and the real thumbnail card animates
  // in via `thumb-assistant-msg-in`. Total handoff feels snappy.
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

const ANALYZE_PHASES = [
  'Analyzing visuals',
  'Reading composition',
  'Rating each criterion',
  'Scoring CTR potential',
  'Almost done',
]

/**
 * Pending-state loader for analyze mode. Replaces the percentage-fill bar
 * (which would lie — /rate returns synchronously, no real progress signal)
 * with a scan sweep over the user's actual thumbnail and a rotating phase
 * label. Same 16:9 stage as the generation loader so the layout doesn't
 * jump when the result swaps in.
 */
const ThumbnailAnalyzeLoader = memo(function ThumbnailAnalyzeLoader({ imageUrl }) {
  const [phaseIdx, setPhaseIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % ANALYZE_PHASES.length)
    }, 1400)
    return () => clearInterval(id)
  }, [])
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
        <div className="thumb-analyze-loader__veil" aria-hidden="true" />
        <div className="thumb-analyze-loader__scan" aria-hidden="true" />
        <div className="thumb-analyze-loader__phase">
          <span className="thumb-analyze-loader__phase-dot" aria-hidden="true" />
          <span className="thumb-analyze-loader__phase-text" aria-live="polite">
            {ANALYZE_PHASES[phaseIdx]}
          </span>
          <span className="thumb-analyze-loader__phase-ellipsis" aria-hidden="true">
            …
          </span>
        </div>
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
              onReplaceThumbnail={onReplaceThumbnail}
              onRegenerate={onRegenerate}
              onViewImage={onViewImage}
              onEditImage={onEditImage}
              canRegenerate
            />
          ) : null}
          {msg.analysis ? <AnalysisBreakdown analysis={msg.analysis} /> : null}
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
})

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
  const chatMutation = useThumbnailChatMutation(onConversationCreated)
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
      // Full reset on "New Chat" / blank chat screen.
      setMessages([])
      setLocalOnlyMessages([])
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
      setMessages(buildMessagesFromApi(conversationQuery.data.messages.items))
    } else if (!matchesCurrent || !conversationQuery.data) {
      setMessages([])
    }
  }, [conversationId, conversationQuery.data])

  // Conversation switch wipes local-only messages — they belong to the
  // session the user just left. Without this the recreate/analyze
  // bubbles from one conversation would bleed into the next.
  useEffect(() => {
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
      setPendingUserMessage(null)
      markSeen(conversationId)
    }
  }, [isCurrentConversationPending, conversationQuery.data, conversationId, clearPending, markSeen])

  const isHistoryLoading =
    conversationId != null && (conversationQuery.isPending || conversationQuery.isPlaceholderData)
  // Combined render list: server-canonical chat thread first (sorted by
  // numeric server id), then local-only recreate / analyze results
  // appended in the order they happened. The two buckets never overlap
  // by id (server ids are numeric, local-only ids are tagged strings).
  const renderedMessages = useMemo(
    () => [...sortByServerId(messages), ...localOnlyMessages],
    [messages, localOnlyMessages]
  )
  const isEmptyScreen =
    !isHistoryLoading && renderedMessages.length === 0 && !pendingUserMessage && !pendingAssistant
  const layoutCentered = isEmptyScreen || isHistoryLoading
  const { showScrollToBottom, scrollToBottom } = useThreadScrollToBottom(threadRef, {
    enabled: !isHistoryLoading,
    deps: [renderedMessages.length, pendingUserMessage, pendingAssistant, thumbMode],
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

  // Call on successful API completion. Flips `pendingDone` (which the
  // <ThumbnailGenFill /> component picks up to smoothly tween the bar
  // from its current pct → 100 over ~280 ms), then unmounts the loader
  // ~80 ms after the fill animation finishes so the new thumbnail card
  // can take over. Total handoff: ~360 ms — fast but not jumpy.
  const finishLoading = useCallback(() => {
    if (finishLoadingRef.current) clearTimeout(finishLoadingRef.current)
    setPendingDone(true)
    finishLoadingRef.current = setTimeout(() => {
      setPendingAssistant(false)
      setPendingDone(false)
      finishLoadingRef.current = null
    }, 360)
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

    // Recreate / analyze flows don't write to the chat conversation, so
    // their results live in `localOnlyMessages` (rendered after the
    // server-canonical `messages`). IDs are local-only strings — these
    // messages never round-trip through the chat refetch so they don't
    // collide with server numeric ids.
    setLocalOnlyMessages((prev) => [
      ...prev,
      {
        id: genLocalId('local-user'),
        role: 'user',
        content: userContent,
        imageUrl: assistant.userImageUrl || null,
      },
      {
        id: assistant.id ?? genLocalId('local-assistant'),
        role: 'assistant',
        content: assistant.content || '',
        thumbnails: assistant.thumbnails || [],
        imageUrl: assistant.imageUrl || null,
        userRequest: assistant.userRequest || userContent,
        isRecreate: assistant.isRecreate || false,
        analysis: assistant.analysis || null,
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
    setPromptImageName(file.name || 'Image')
    e.target.value = ''
  }

  const clearPromptImage = useCallback(() => {
    setPromptImageDataUrl(null)
    setPromptImageName('')
  }, [])

  /**
   * Commit the (user_message, assistant_message) pair the chat endpoint
   * returned, atomically. Both records have server-assigned numeric ids
   * so there's no dedupe / merge logic needed — the next conversation
   * refetch will replay the same ids and wholesale-replace the array
   * with identical content.
   *
   * Falls back gracefully if the backend is older and only returns
   * `message_id` (the assistant id) without the explicit pair: in that
   * case we can't commit the user message locally, so we let the next
   * conversation refetch fill it in.
   */
  const commitServerChatPair = useCallback((result, fallbackUserText) => {
    if (!result) return
    const thumbnails = result.thumbnails || []
    const userRecord = result.user_message
      ? {
          id: result.user_message.id,
          role: 'user',
          content: result.user_message.content,
          imageUrl: null,
          userRequest: '',
          thumbnails: [],
        }
      : null
    const assistantRecord = result.assistant_message
      ? {
          id: result.assistant_message.id,
          role: 'assistant',
          content: result.assistant_message.content || '',
          thumbnails,
          imageUrl: result.assistant_message.extra_data?.image_url || null,
          userRequest: result.assistant_message.extra_data?.user_request || fallbackUserText || '',
        }
      : result.message_id != null
        ? {
            id: result.message_id,
            role: 'assistant',
            content: thumbnails.length > 0 ? '' : result.content || '',
            thumbnails,
            imageUrl: null,
            userRequest: result.user_request || fallbackUserText || '',
          }
        : null

    setMessages((prev) => {
      const knownIds = new Set(prev.map((m) => m.id))
      const additions = []
      if (userRecord && !knownIds.has(userRecord.id)) additions.push(userRecord)
      if (assistantRecord && !knownIds.has(assistantRecord.id)) additions.push(assistantRecord)
      if (additions.length === 0) return prev
      return sortByServerId([...prev, ...additions])
    })
  }, [])

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
    // The user bubble appears INSTANTLY via `pendingUserMessage` (rendered
    // alongside `pendingAssistant` loader). It's NOT pushed into the
    // server-canonical `messages` array — that array only ever holds
    // server records keyed by their numeric ids. On chat-mutation success
    // we commit the server's (user_message, assistant_message) pair
    // atomically; on failure the pending bubble simply clears.
    const userImageAtSubmit = promptImageDataUrl || null
    setPendingUserMessage(combined)
    setPendingUserImageUrl(userImageAtSubmit)
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
        // Whole-image edit doesn't go through the chat endpoint, so
        // results land in `localOnlyMessages` (rendered after the
        // server-canonical `messages`). The pending user bubble + the
        // local-only pair never both render the same content because
        // pendingUserMessage clears in the finally below.
        const imageUrl = await runWholeImageEdit({
          imageUrl: promptImageDataUrl,
          prompt: `${combined} ${buildSelectionHint(selectedPersona, selectedStyle)}`.trim(),
        })
        pushLocalAssistantMessage(combined, {
          content: '',
          imageUrl,
          userImageUrl: userImageAtSubmit,
          userRequest: combined,
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
        // Server-canonical commit: append the (user_message, assistant_message)
        // pair the backend persisted, in id order. No client-side
        // dedupe needed — the next conversation refetch will return the
        // same records and wholesale-replace `messages` with the same
        // content.
        commitServerChatPair(result, combined)
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
      toast.error(backendMsg, {
        code: code || undefined,
        title: friendlyTitleFor(code),
      })
      setDraft(combined)
      setPendingAssistant(false)
      if (activeConversationId) clearPending(activeConversationId)
    } finally {
      // Always clear the in-flight bubble — on success the server pair has
      // already been committed (or pushLocalAssistantMessage ran), on
      // failure there's nothing to commit.
      setPendingUserMessage(null)
      setPendingUserImageUrl(null)
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
        // Commit the server-canonical pair atomically — same path as the
        // primary submit handler. No more local id minting, no merge
        // dance with the next refetch.
        commitServerChatPair(result, userRequest)
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
      commitServerChatPair,
    ]
  )

  // Keep `handleSubmitRef` pointing at the latest `handleSubmit` so the
  // error-toast's "Retry" action always invokes the most recent closure
  // (with the most recent state). Runs after every render — cheap.
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
      // Prime the per-image rating cache so the analyze card's
      // ScorePill resolves instantly from cache instead of firing a
      // second /rate (which would double-charge credits).
      seedThumbnailRating(queryClient, imageUrl, rating)
      pushLocalAssistantMessage(userText, {
        content: '',
        userImageUrl: imageUrl,
        imageUrl,
        userRequest: '',
        analysis: rating,
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
        className={`coach-chat-shell${isEmptyScreen ? ' coach-chat-shell--thumb-empty' : ''}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: IOS_EASE }}
      >
        <div className="thumb-bg-fx-top-shadow" aria-hidden="true" />
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
            renderedMessages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                msg={msg}
                onReplaceThumbnail={handleReplaceThumbnail}
                onRegenerate={handleRegenerateOne}
                onViewImage={openThumbLightbox}
                onEditImage={openEditorForThumbnail}
              />
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
                      decoding="async"
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
              {thumbMode === 'analyze' ? (
                <ThumbnailAnalyzeLoader imageUrl={pendingUserImageUrl} />
              ) : (
                /* Shared 16:9 placeholder slot that the result thumbnail
                 * will land in — keeps the layout stable so the loader →
                 * image swap doesn't cause a height jump. <ThumbnailGenFill />
                 * fills the whole stage left→right in a bright gradient
                 * with a centred percentage. */
                <div
                  className="thumb-gen-loader"
                  aria-busy="true"
                  aria-label="Generating thumbnail"
                >
                  <div className="thumb-gen-loader__stage">
                    <ThumbnailGenFill
                      done={pendingDone}
                      estimatedDurationMs={(() => {
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
              )}
            </article>
          )}

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
                          <input
                            type="url"
                            className="thumb-source-input"
                            placeholder="Drop a YouTube link or image URL"
                            value={recreateUrlInput}
                            onChange={(e) => setRecreateUrlInput(e.target.value.slice(0, 280))}
                          />
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
                        placeholder="Anything you want to tweak? (optional)"
                        rows={1}
                        className="coach-composer-input thumb-visible-placeholder"
                        maxLength={2000}
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
                            placeholder="Drop a YouTube link or image URL"
                            value={analyzeUrlInput}
                            onChange={(e) => setAnalyzeUrlInput(e.target.value.slice(0, 280))}
                          />
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
                        placeholder="Add the video title for sharper analysis (optional)"
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
                          placeholder="Drop a YouTube link or image URL"
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
