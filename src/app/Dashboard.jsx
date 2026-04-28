import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
// Dashboard.css moved here from AuthenticatedRoutes — Vite scopes it to
// this lazy chunk now, so /optimize, /pro etc. don't download the
// dashboard's 11k-line stylesheet on first paint.
import './Dashboard.css'
// Reuse the Optimize video-card visual language for the SEO improvement-ideas
// grid below — keeps cards consistent across the two surfaces that show videos.
import './Optimize.css'
import { useAuthStore } from '../stores/authStore'
import { useOnboardingStore } from '../stores/onboardingStore'
import { useSidebarStore } from '../stores/sidebarStore'
import { youtubeApi } from '../api/youtube'
import { AppShellLayout } from '../components/AppShellLayout'
import { Sidebar } from './Sidebar'
import { SettingsModal } from './SettingsModal'
import { DashButton } from '../components/DashButton'
import { DashSection } from '../components/DashSection'
import { Skeleton, SkeletonCard, SkeletonCircle, SkeletonGroup, SkeletonText, InlineSpinner } from '../components/ui'
/* Sidebar.css, SettingsModal.css, Dashboard.css imported by AuthenticatedRoutes */
import { queryKeys } from '../lib/query/queryKeys'
import {
  loadScore as loadCachedVideoScore,
  loadScoreUpdatedAt as loadCachedVideoScoreUpdatedAt,
  saveScore as saveCachedVideoScore,
  setVideoScoreCacheUser,
  videoScoreFingerprint,
} from '../lib/videoScoreCache'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { queryFreshness } from '../lib/query/queryConfig'
import {
  useDashboardAudit,
  useDashboardGrowth,
  useDashboardSnapshot,
} from '../queries/dashboard/dashboardQueries'
import { useUserPreferencesQuery } from '../queries/user/preferencesQueries'
import { useUserProfileQuery } from '../queries/user/profileQueries'
import { useYoutubeVideosPage } from '../queries/youtube/videosQueries'
import {
  getAreaAction,
  getAuditAreaGuidance,
  getGrowthScenarioMessage,
} from '../lib/dashboardActions'
import { computePrePublishScore, thumbnailBattleHref } from '../lib/dashboardCommandCenter'
import {
  getAreaPrefill,
  hashWithPrefill,
  optimizePrefill,
  // scriptPrefill, // next update
  thumbPrefill,
} from '../lib/dashboardActionPayload'
import {
  getMilestonePair,
  progressAlongSteps,
  SUBS_STEPS,
  VIEWS_STEPS,
} from '../lib/channelMilestones'
import {
  readMilestoneVisitSnapshot,
  writeMilestoneVisitSnapshot,
} from '../lib/milestoneVisitStorage'
function toYYYYMMDD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fromDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toYYYYMMDD(d)
}

const IconPlus = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)
/* "Image unavailable" placeholder — picture frame with a slash. Used as
 * the fallback for the channel pill / menu avatars when YouTube didn't
 * give us a profile image, or the URL it gave us 404s / is blocked. */
const IconImageOff = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 3l18 18" />
    <path d="M21 17V5a2 2 0 0 0-2-2H7" />
    <path d="M3 7v12a2 2 0 0 0 2 2h12" />
    <path d="m7 13 3-3 4 4" />
    <circle cx="9" cy="9" r="1.5" />
  </svg>
)

/**
 * Channel avatar with a built-in fallback. Renders the profile image
 * if it loads, otherwise the `IconImageOff` placeholder — covering both
 * "we don't have a URL" and "the URL we have is broken/blocked".
 *
 * `className` is forwarded so the same component reuses different
 * geometry tokens (pill avatar 32 px, menu avatar 32 px).
 */
function ChannelAvatar({ src, className = '', fallbackClassName = '' }) {
  const [errored, setErrored] = useState(false)
  // Reset the errored flag whenever the src changes, so switching
  // channels doesn't leave a stale fallback in place.
  useEffect(() => setErrored(false), [src])

  if (!src || errored) {
    return (
      <span
        className={`${className} ${fallbackClassName}`.trim()}
        aria-hidden
      >
        <IconImageOff />
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      className={className}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
    />
  )
}
const IconUsers = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
  </svg>
)
const IconViews = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const IconChartUp = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
)

const IconThumbnail = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
  </svg>
)
const IconOptimize = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
)
const IconArrowRight = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
)

const IconYoutubeMark = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
)

const IconSpark = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
)

const IconTileGauge = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19.4 15a8.5 8.5 0 0 0 .1-1 8.5 8.5 0 0 0-8.5-8.5 8.5 8.5 0 0 0-8.5 8.5 8.5 8.5 0 0 0 .1 1" />
    <path d="M12 5V3" />
  </svg>
)

function formatCount(n) {
  if (n == null || n === '') return null
  const num = typeof n === 'number' ? n : parseInt(String(n).replace(/\D/g, ''), 10)
  if (isNaN(num)) return String(n)
  if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'b'
  if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'm'
  if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(num)
}

function getDashboardName(user) {
  const raw =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.full_name ||
    user?.name ||
    user?.email?.split('@')[0] ||
    ''

  const first = String(raw).trim().split(/\s+/)[0]
  if (!first) return 'there'
  return first.charAt(0).toUpperCase() + first.slice(1)
}

const GREETING_VARIANTS = {
  morning: [
    'Good morning',
    'Morning',
    'Hey',
    'Rise and shine',
    'Top of the morning',
    'Hello',
    'What\u2019s good',
    'Happy to see you',
  ],
  afternoon: [
    'Good afternoon',
    'Hey',
    'Welcome back',
    'Hello again',
    'What\u2019s up',
    'Great to see you',
    'Back at it',
    'Hey there',
  ],
  evening: [
    'Good evening',
    'Hey',
    'Welcome back',
    'Evening',
    'Hey there',
    'Hello again',
    'Still going strong',
    'Glad you\u2019re here',
  ],
}

function getGreetingText() {
  const hour = new Date().getHours()
  const pool =
    hour < 12
      ? GREETING_VARIANTS.morning
      : hour < 18
        ? GREETING_VARIANTS.afternoon
        : GREETING_VARIANTS.evening
  return pool[Math.floor(Math.random() * pool.length)]
}

function getPercentChange(current, previous) {
  const curr = Number(current)
  const prev = Number(previous)
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev <= 0) return null
  return ((curr - prev) / prev) * 100
}

/** Only when period-over-period change exists; otherwise omit the badge (avoids misleading "0%"). */
function formatGrowthPercent(value) {
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value * 10) / 10
  if (rounded > 0) return `+${rounded}%`
  if (rounded < 0) return `${rounded}%`
  return null
}

/** Visual tier for audit scores (bars, badges) */
function getAuditScoreTier(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return 'mid'
  if (n >= 70) return 'high'
  if (n >= 40) return 'mid'
  return 'low'
}

function auditTierLabel(tier) {
  if (tier === 'high') return 'Strong'
  if (tier === 'low') return 'Needs focus'
  return 'Room to grow'
}

/** Tier-based gradient colors for milestones */
const TIER_COLORS = {
  seed: ['#3b82f6', '#60a5fa'],
  sprout: ['#6366f1', '#818cf8'],
  rising: ['#8b5cf6', '#a78bfa'],
  established: ['#a855f7', '#c084fc'],
  notable: ['#d946ef', '#e879f9'],
  star: ['#f43f5e', '#fb7185'],
  legend: ['#f97316', '#fbbf24'],
}

function getTierGradient(tier) {
  return TIER_COLORS[tier] || TIER_COLORS.seed
}

/** How many levels to show on the card (rest go in the dialog) */
const CARD_VISIBLE = 5

function DashboardMilestones({ title, steps, current, animateFrom, locked }) {
  const cur = Math.max(0, Number(current) || 0)
  const fromCandidate =
    animateFrom != null && animateFrom < cur ? Math.max(0, Number(animateFrom) || 0) : null
  const [live, setLive] = useState(() => (fromCandidate != null ? fromCandidate : cur))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogClosing, setDialogClosing] = useState(false)
  const reducedMotionRef = useRef(false)
  const visitAnimDoneRef = useRef(false)

  useEffect(() => {
    try {
      reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      reducedMotionRef.current = false
    }
  }, [])

  useEffect(() => {
    if (fromCandidate == null) {
      visitAnimDoneRef.current = false
      setLive(cur)
      return
    }
    if (reducedMotionRef.current || visitAnimDoneRef.current) {
      visitAnimDoneRef.current = true
      setLive(cur)
      return
    }
    setLive(fromCandidate)
    const start = performance.now()
    const dur = 1200
    const a = fromCandidate
    const b = cur
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur)
      const e = p < 1 ? 1 - Math.pow(1 - p, 3) * Math.cos(p * Math.PI * 0.6) : 1
      setLive(Math.round(a + (b - a) * Math.min(1, e)))
      if (p >= 1) visitAnimDoneRef.current = true
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [fromCandidate, cur])

  const closeDialog = useCallback(() => {
    if (dialogClosing) return
    setDialogClosing(true)
    setTimeout(() => {
      setDialogOpen(false)
      setDialogClosing(false)
    }, 280)
  }, [dialogClosing])

  // Close dialog on Escape + lock ALL scroll
  useEffect(() => {
    if (!dialogOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeDialog()
    }
    window.addEventListener('keydown', onKey)
    const prevBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const scrollEl = document.querySelector('.dashboard-main-scroll')
    const prevScroll = scrollEl ? scrollEl.style.overflow : ''
    if (scrollEl) scrollEl.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevBodyOverflow
      if (scrollEl) scrollEl.style.overflow = prevScroll
    }
  }, [dialogOpen, closeDialog])

  const display = locked ? cur : live
  const { completed } = progressAlongSteps(display, steps)
  const { next, barFillPercent } = getMilestonePair(display, steps)
  const pct = locked ? 0 : barFillPercent

  // Card shows: last 2 achieved + current in-progress + next 2 upcoming = ~5 rows starting from user's position
  const currentIdx = completed // index of the next unachieved step
  const startIdx = Math.max(0, currentIdx - 2)
  const cardSteps = steps.slice(startIdx, startIdx + CARD_VISIBLE)
  const hasMore = steps.length > CARD_VISIBLE

  // Arc gauge — bigger, with glow
  const R = 52
  const STROKE = 7
  const halfCircum = Math.PI * R
  const fillLen = (pct / 100) * halfCircum
  const tierColor = next?.tier ? getTierGradient(next.tier) : getTierGradient('seed')
  const gradId = `ms-${title.replace(/\s/g, '')}`
  // Position of the dot indicator at the end of the fill arc
  const dotAngle = Math.PI - (pct / 100) * Math.PI
  const dotX = 60 + R * Math.cos(dotAngle)
  const dotY = 60 - R * Math.sin(dotAngle)

  const renderLevel = (step, i, delay, showBar) => {
    const done = display >= step.target
    const isCurrent = steps.indexOf(step) === completed
    const stepPct = done ? 100 : isCurrent ? pct : 0
    const [gA, gB] = getTierGradient(step.tier || 'seed')
    return (
      <div
        key={step.target}
        className={`ms-level ${done ? 'ms-level--done' : ''} ${isCurrent ? 'ms-level--current' : ''}`}
        style={{ animationDelay: `${delay + i * 0.04}s` }}
      >
        <div
          className="ms-level__dot"
          style={
            done || isCurrent ? { background: `linear-gradient(135deg, ${gA}, ${gB})` } : undefined
          }
        />
        <div className="ms-level__info">
          <span className="ms-level__label">{step.label}</span>
          <span className="ms-level__desc">{step.title}</span>
        </div>
        {showBar && (
          <div className="ms-level__bar">
            <div
              className="ms-level__bar-fill"
              style={{
                width: `${stepPct}%`,
                background: stepPct > 0 ? `linear-gradient(90deg, ${gA}, ${gB})` : undefined,
              }}
            />
          </div>
        )}
        {done && (
          <span className="ms-level__check" aria-label="Achieved">
            ✓
          </span>
        )}
        {isCurrent && !done && <span className="ms-level__pct">{Math.round(pct)}%</span>}
      </div>
    )
  }

  return (
    <>
      <div
        className={`ms-panel ${locked ? 'ms-panel--locked' : ''}`}
        role="group"
        aria-label={`${title} milestones`}
      >
        {/* Header arc */}
        <div className="ms-panel__header">
          <div className="ms-panel__arc">
            <svg viewBox="0 0 120 68" className="ms-panel__svg" aria-hidden>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={tierColor[0]} />
                  <stop offset="100%" stopColor={tierColor[1]} />
                </linearGradient>
              </defs>
              <path
                d="M 8 60 A 52 52 0 0 1 112 60"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={STROKE}
                strokeLinecap="round"
              />
              {pct > 0 && (
                <path
                  d="M 8 60 A 52 52 0 0 1 112 60"
                  fill="none"
                  stroke={`url(#${gradId})`}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${fillLen} ${halfCircum}`}
                  className="ms-panel__arc-fill"
                />
              )}
              {pct > 2 && pct < 100 && (
                <circle
                  cx={dotX}
                  cy={dotY}
                  r="3.5"
                  fill={tierColor[1]}
                  className="ms-panel__arc-dot"
                />
              )}
            </svg>
            <div className="ms-panel__arc-text">
              <span className="ms-panel__arc-value">{formatCount(display)}</span>
              {next && <span className="ms-panel__arc-target">/ {formatCount(next.target)}</span>}
            </div>
          </div>
          <span className="ms-panel__title">{title}</span>
        </div>

        {/* Card-level list (compact, ~5 rows) */}
        <div className="ms-panel__levels">
          {cardSteps.map((step, i) => renderLevel(step, i, 0, true))}
        </div>

        {/* See all milestones button → opens dialog */}
        {hasMore && (
          <button type="button" className="ms-panel__more" onClick={() => setDialogOpen(true)}>
            See all milestones
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Full milestones dialog — portaled to body so it covers everything */}
      {dialogOpen &&
        createPortal(
          <div
            className={`ms-dialog-backdrop ${dialogClosing ? 'ms-dialog-backdrop--closing' : ''}`}
            onClick={closeDialog}
          >
            <div
              className={`ms-dialog ${dialogClosing ? 'ms-dialog--closing' : ''}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={`${title} — All milestones`}
            >
              <div className="ms-dialog__header">
                <h3 className="ms-dialog__title">{title} Milestones</h3>
                <button
                  type="button"
                  className="ms-dialog__close"
                  onClick={closeDialog}
                  aria-label="Close"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="ms-dialog__summary">
                <div className="ms-dialog__summary-arc">
                  <svg viewBox="0 0 120 68" className="ms-panel__svg" aria-hidden>
                    <defs>
                      <linearGradient id={`${gradId}-dlg`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={tierColor[0]} />
                        <stop offset="100%" stopColor={tierColor[1]} />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 8 60 A 52 52 0 0 1 112 60"
                      fill="none"
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth={STROKE}
                      strokeLinecap="round"
                    />
                    {pct > 0 && (
                      <path
                        d="M 8 60 A 52 52 0 0 1 112 60"
                        fill="none"
                        stroke={`url(#${gradId}-dlg)`}
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                        strokeDasharray={`${fillLen} ${halfCircum}`}
                        className="ms-panel__arc-fill"
                      />
                    )}
                  </svg>
                  <div className="ms-panel__arc-text">
                    <span className="ms-panel__arc-value">{formatCount(display)}</span>
                    {next && (
                      <span className="ms-panel__arc-target">/ {formatCount(next.target)}</span>
                    )}
                  </div>
                </div>
                <div className="ms-dialog__summary-meta">
                  <span className="ms-dialog__summary-stat">
                    {completed} of {steps.length} achieved
                  </span>
                  {next && <span className="ms-dialog__summary-next">Next: {next.title}</span>}
                </div>
              </div>

              <div className="ms-dialog__list">
                {steps.map((step, i) => renderLevel(step, i, 0.05, false))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

function scoreTier(score) {
  if (score == null) return null
  if (score >= 75) return 'strong'
  if (score >= 50) return 'mid'
  return 'low'
}

const VD_LOADING_TEXTS = [
  'Analyzing video',
  'Checking title SEO',
  'Reviewing description',
  'Evaluating tags',
  'Measuring engagement',
  'Scoring thumbnail',
  'Generating feedback',
]

function VdLoadingState() {
  const [textIdx, setTextIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setTextIdx((i) => (i + 1) % VD_LOADING_TEXTS.length)
    }, 2000)
    return () => clearInterval(id)
  }, [])
  return (
    <SkeletonGroup className="vd-analyze" label={VD_LOADING_TEXTS[textIdx]}>
      <SkeletonCard ratio="16 / 9" lines={2} />
      <SkeletonText lines={3} lineHeight={14} />
      <div className="vd-analyze__label">
        <InlineSpinner size={12} />
        <span>{VD_LOADING_TEXTS[textIdx]}</span>
      </div>
    </SkeletonGroup>
  )
}

const SCORE_AREAS = [
  { key: 'title', label: 'Title', icon: 'T' },
  { key: 'description', label: 'Description', icon: 'D' },
  { key: 'tags', label: 'Tags', icon: '#' },
  { key: 'engagement', label: 'Engagement', icon: 'E' },
  { key: 'thumbnail', label: 'Thumbnail', icon: 'I' },
]

function getScoreColor(s) {
  if (s >= 80) return '#30D158'
  if (s >= 60) return '#FFD60A'
  if (s >= 40) return '#FF9F0A'
  return '#FF453A'
}

const POOL_SIZE = 10
const TOP_N = 4
const SKELETON_PLACEHOLDERS = Array.from({ length: TOP_N }, (_, i) => i)

/**
 * Scores up to POOL_SIZE recent videos, sorts by lowest score, and shows
 * the bottom TOP_N. Persistent cache (`videoScoreCache`) makes repeat
 * visits instant — we only call the scoring API when a video's
 * fingerprint changed since last time. The component renders as soon as
 * we have enough scored videos to fill the grid; we don't block on
 * still-fetching slots that wouldn't make the cut anyway.
 */
function LowestScoredVideos({ videos, loading, accessToken, onOptimize }) {
  // useQuery is called inside .map — to satisfy the rules of hooks the
  // array length MUST be stable across renders. Always pad to POOL_SIZE.
  const padded = [...(videos || [])].slice(0, POOL_SIZE)
  while (padded.length < POOL_SIZE) padded.push(null)

  const scores = padded.map((v) => {
    const fp = videoScoreFingerprint(v)
    const cached = v && fp ? loadCachedVideoScore(v.id, fp) : undefined
    const cachedAt = v && fp ? loadCachedVideoScoreUpdatedAt(v.id, fp) : undefined
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useQuery({
      // Fingerprint is part of the key so any change to the inputs the
      // score depends on (views, title length, etc.) is a clean cache
      // miss and re-fetch — but only then.
      queryKey: ['channelPulse', 'videoScore', v?.id || '__empty__', fp || ''],
      queryFn: async () => {
        const data = await youtubeApi.scoreVideo(accessToken, {
          video_id: v.id,
          title: v.title || '',
          description: v.description || '',
          tags: v.tags || [],
          view_count: Number(v.view_count ?? 0),
          like_count: Number(v.like_count ?? 0),
          comment_count: Number(v.comment_count ?? 0),
          thumbnail_url: v.thumbnail_url || null,
        })
        saveCachedVideoScore(v.id, fp, data)
        return data
      },
      enabled: !!accessToken && !!v?.id,
      // Once we have the score for this fingerprint it's authoritative
      // until the inputs change — no auto-refetch, no stale recompute.
      staleTime: Infinity,
      gcTime: Infinity,
      initialData: cached,
      initialDataUpdatedAt: cachedAt,
      retry: 1,
    })
  })

  // Build scored list from whichever queries have settled with data.
  // Disabled (padded) slots and in-flight slots are simply skipped.
  const scored = []
  if (videos?.length) {
    for (let i = 0; i < Math.min(videos.length, POOL_SIZE); i++) {
      const s = scores[i].data?.score
      if (s != null) scored.push({ video: videos[i], score: s })
    }
  }
  scored.sort((a, b) => a.score - b.score)
  const lowestN = scored.slice(0, TOP_N)

  // We use `isFetching` (active network) instead of `isPending` (no data
  // yet) because v5's `isPending` stays true for disabled queries forever
  // — that would freeze us on the skeleton when accessToken is delayed.
  // Skip padded slots (i >= videos.length) so they don't count as "still
  // fetching".
  const activeFetches = scores
    .slice(0, videos?.length || 0)
    .filter((q) => q.isFetching).length

  // Render the grid as soon as we have enough scored videos to fill it
  // — or once nothing is left fetching, even if we have fewer.
  const targetCount = Math.min(TOP_N, videos?.length || 0)
  const ready = lowestN.length >= targetCount || activeFetches === 0

  if (loading) {
    return (
      <SkeletonGroup className="cpulse-grid" label="Loading lowest-scored videos">
        {SKELETON_PLACEHOLDERS.map((i) => (
          <SkeletonCard key={i} ratio="16 / 9" lines={2} />
        ))}
      </SkeletonGroup>
    )
  }

  if (!videos?.length) {
    return <div className="dashboard-shell-empty">No videos found for this channel.</div>
  }

  if (!ready) {
    return (
      <SkeletonGroup className="cpulse-grid" label="Scoring videos">
        {SKELETON_PLACEHOLDERS.map((i) => (
          <SkeletonCard key={i} ratio="16 / 9" lines={2} />
        ))}
      </SkeletonGroup>
    )
  }

  if (lowestN.length === 0) {
    return <div className="dashboard-shell-empty">Couldn&rsquo;t score any of your videos.</div>
  }

  return (
    <div className="cpulse-grid">
      {lowestN.map(({ video, score }) => (
        <ChannelPulseVideoCard
          key={video.id}
          video={video}
          accessToken={accessToken}
          onOptimize={onOptimize}
          preloadedScore={score}
        />
      ))}
    </div>
  )
}

function ChannelPulseVideoCard({ video, accessToken, onOptimize, preloadedScore }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogClosing, setDialogClosing] = useState(false)

  const fingerprint = videoScoreFingerprint(video)
  const cachedScore = fingerprint ? loadCachedVideoScore(video.id, fingerprint) : undefined
  const cachedScoreAt = fingerprint
    ? loadCachedVideoScoreUpdatedAt(video.id, fingerprint)
    : undefined

  const videoScoreQuery = useQuery({
    // Same key shape as LowestScoredVideos so both components share one
    // React Query cache entry — opening the dialog is instant when the
    // grid already has the breakdown.
    queryKey: ['channelPulse', 'videoScore', video.id, fingerprint || ''],
    queryFn: async () => {
      const data = await youtubeApi.scoreVideo(accessToken, {
        video_id: video.id,
        title: video.title || '',
        description: video.description || '',
        tags: video.tags || [],
        view_count: Number(video.view_count ?? 0),
        like_count: Number(video.like_count ?? 0),
        comment_count: Number(video.comment_count ?? 0),
        thumbnail_url: video.thumbnail_url || null,
      })
      saveCachedVideoScore(video.id, fingerprint, data)
      return data
    },
    enabled: !!accessToken && !!video.id && preloadedScore == null && !cachedScore,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: cachedScore,
    initialDataUpdatedAt: cachedScoreAt,
    placeholderData: (prev) => prev,
    retry: 1,
  })

  const score = preloadedScore ?? videoScoreQuery.data?.score ?? null
  const breakdown = videoScoreQuery.data?.breakdown ?? null
  const feedback = videoScoreQuery.data?.feedback ?? null
  const tier = scoreTier(score)

  const views = Number(video.view_count ?? video.views ?? 0)
  const likes = Number(video.like_count ?? 0)
  const comments = Number(video.comment_count ?? 0)
  const publishedAt = video.published_at ? new Date(video.published_at) : null
  const formattedDate = publishedAt
    ? publishedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  const desc = video.description || ''

  const thumbSrc =
    video.thumbnail_url ||
    (video.id ? `https://img.youtube.com/vi/${video.id}/mqdefault.jpg` : null)

  const closeDialog = useCallback(() => {
    if (dialogClosing) return
    setDialogClosing(true)
    setTimeout(() => {
      setDialogOpen(false)
      setDialogClosing(false)
    }, 280)
  }, [dialogClosing])

  useEffect(() => {
    if (!dialogOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeDialog()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const scrollEl = document.querySelector('.dashboard-main-scroll')
    const prev = scrollEl ? scrollEl.style.overflow : ''
    if (scrollEl) scrollEl.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (scrollEl) scrollEl.style.overflow = prev
    }
  }, [dialogOpen, closeDialog])

  return (
    <>
      <article
        className="optimize-video-card"
        onClick={() => setDialogOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setDialogOpen(true)
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="optimize-card-thumb-wrap">
          {thumbSrc ? (
            <img src={thumbSrc} alt="" className="optimize-card-thumb" loading="lazy" />
          ) : (
            <div className="optimize-card-thumb" aria-hidden />
          )}
          {score != null && (
            <span className={`cpulse-score-badge cpulse-score-badge--${tier}`}>{score}</span>
          )}
          {videoScoreQuery.isPending && (
            <span className="cpulse-score-badge cpulse-score-badge--loading">
              <InlineSpinner size={10} />
            </span>
          )}
          <div className="optimize-card-thumb-overlay" aria-hidden>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span>View details</span>
          </div>
        </div>
        <div className="optimize-card-body">
          <h3 className="optimize-card-title">
            {(video.title || 'Untitled').substring(0, 80)}
          </h3>
          <div className="optimize-card-meta-row">
            {views > 0 && (
              <span className="optimize-card-meta-pill">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {formatCount(views)} views
              </span>
            )}
            {formattedDate && (
              <span className="optimize-card-meta-pill">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {formattedDate}
              </span>
            )}
          </div>
          <button
            type="button"
            className="optimize-card-cta"
            onClick={(e) => {
              e.stopPropagation()
              onOptimize?.(video)
            }}
          >
            Optimize
            <span className="optimize-card-cta-icon" aria-hidden>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        </div>
      </article>

      {/* Video detail dialog */}
      {dialogOpen &&
        createPortal(
          <div
            className={`vd-backdrop ${dialogClosing ? 'vd-backdrop--closing' : ''}`}
            onClick={closeDialog}
          >
            <div
              className={`vd-dialog ${dialogClosing ? 'vd-dialog--closing' : ''}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={video.title || 'Video details'}
            >
              <div className="vd-header">
                <h3 className="vd-header__title">Video details</h3>
                <button
                  type="button"
                  className="vd-header__close"
                  onClick={closeDialog}
                  aria-label="Close"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className={`vd-body ${videoScoreQuery.isPending ? 'vd-body--loading' : ''}`}>
                {videoScoreQuery.isPending ? (
                  <VdLoadingState />
                ) : (
                  <>
                    {thumbSrc && (
                      <div className="vd-thumb-banner">
                        <img src={thumbSrc} alt="" className="vd-thumb-banner__img" />
                        {score != null && (
                          <div
                            className="vd-thumb-banner__badge"
                            style={{ background: getScoreColor(score) }}
                          >
                            {score}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="vd-info">
                      <h4 className="vd-info__title">{video.title || 'Untitled'}</h4>
                      <div className="vd-info__stats">
                        {views > 0 && <span>{formatCount(views)} views</span>}
                        {likes > 0 && <span>{formatCount(likes)} likes</span>}
                        {comments > 0 && <span>{formatCount(comments)} comments</span>}
                        {formattedDate && <span>{formattedDate}</span>}
                      </div>
                    </div>

                    {desc && (
                      <div className="vd-card">
                        <span className="vd-card__label">Description</span>
                        <p className="vd-card__text">
                          {desc.slice(0, 280)}
                          {desc.length > 280 ? '…' : ''}
                        </p>
                      </div>
                    )}

                    {score != null && (
                      <div className="vd-card vd-card--score">
                        <div className="vd-score-row">
                          <div className="vd-score-ring">
                            <svg viewBox="0 0 88 88" className="vd-score-ring__svg" aria-hidden>
                              <circle
                                cx="44"
                                cy="44"
                                r="38"
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth="5.5"
                              />
                              <circle
                                cx="44"
                                cy="44"
                                r="38"
                                fill="none"
                                stroke={getScoreColor(score)}
                                strokeWidth="5.5"
                                strokeLinecap="round"
                                strokeDasharray={`${(score / 100) * 238.8} 238.8`}
                                transform="rotate(-90 44 44)"
                                className="vd-score-ring__fill"
                              />
                            </svg>
                            <span
                              className="vd-score-ring__val"
                              style={{ color: getScoreColor(score) }}
                            >
                              {score}
                            </span>
                          </div>
                          <div className="vd-score-meta">
                            <span className="vd-score-meta__label">Video health</span>
                            <span
                              className="vd-score-meta__tier"
                              style={{ color: getScoreColor(score) }}
                            >
                              {score >= 80
                                ? 'Great'
                                : score >= 60
                                  ? 'Good'
                                  : score >= 40
                                    ? 'Fair'
                                    : 'Needs work'}
                            </span>
                          </div>
                        </div>
                        {breakdown && (
                          <div className="vd-bars">
                            {SCORE_AREAS.map(({ key, label }) => {
                              const val = breakdown[key]
                              if (val == null) return null
                              return (
                                <div key={key} className="vd-bars__row">
                                  <span className="vd-bars__label">{label}</span>
                                  <div className="vd-bars__track">
                                    <div
                                      className="vd-bars__fill"
                                      style={{ width: `${val}%`, background: getScoreColor(val) }}
                                    />
                                  </div>
                                  <span
                                    className="vd-bars__val"
                                    style={{ color: getScoreColor(val) }}
                                  >
                                    {val}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {feedback && Object.keys(feedback).length > 0 && (
                      <div className="vd-card vd-card--feedback">
                        <span className="vd-card__label">AI Feedback</span>
                        <div className="vd-feedback-list">
                          {SCORE_AREAS.map(({ key, label }) => {
                            const tip = feedback[key]
                            if (!tip) return null
                            const val = breakdown?.[key]
                            return (
                              <div key={key} className="vd-feedback-item">
                                <div
                                  className="vd-feedback-item__dot"
                                  style={{
                                    background:
                                      val != null ? getScoreColor(val) : 'rgba(255,255,255,0.2)',
                                  }}
                                />
                                <div className="vd-feedback-item__body">
                                  <span className="vd-feedback-item__area">{label}</span>
                                  <span className="vd-feedback-item__tip">{tip}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="vd-footer">
                <button
                  type="button"
                  className="vd-footer__btn"
                  onClick={() => {
                    closeDialog()
                    setTimeout(() => onOptimize(video), 300)
                  }}
                >
                  Optimize this video
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

// Rotating gradient tagline shown above the YouTube-connect banner when the
// user has no channel linked. Cycles a short list of value-prop phrases with
// a smooth cross-fade + subtle lift. Gradient matches the landing hero.
const DASHBOARD_EMPTY_TAGLINES = [
  'Thumbnails that actually get clicks',
  'SEO that ranks your videos higher',
  'AI coaching tuned to your channel',
  'Grow your channel smarter',
  'Your YouTube copilot, ready when you are',
]

function DashboardEmptyTagline() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % DASHBOARD_EMPTY_TAGLINES.length), 3800)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="dashboard-empty-tagline" aria-live="polite">
      {DASHBOARD_EMPTY_TAGLINES.map((phrase, idx) => (
        <span
          key={phrase}
          className={`dashboard-empty-tagline-text ${idx === i ? 'is-active' : ''}`}
        >
          {phrase}
        </span>
      ))}
    </div>
  )
}

export function Dashboard({ onLogout, shellManaged }) {
  const {
    user,
    logout,
    changePassword,
    deleteData,
    deleteAccount,
    getValidAccessToken,
    allowsPasswordlessAccountDelete,
    isLoading: authLoading,
    clearError,
  } = useAuthStore()
  const {
    preferredLanguage,
    niche,
    videoFormat,
    uploadFrequency,
    youtube,
    setYouTube,
    setPreferredLanguage,
    setNiche,
    setVideoFormat,
    setUploadFrequency,
    preferredTone,
    speakingStyle,
    preferredCtaStyle,
    includePersonalStories,
    useFirstPerson,
    setPreferredTone,
    setSpeakingStyle,
    setPreferredCtaStyle,
    setIncludePersonalStories,
    setUseFirstPerson,
    clearLocalData,
    syncToBackend,
    bootstrapYouTube,
  } = useOnboardingStore()
  const queryClient = useQueryClient()
  const collapsed = useSidebarStore((s) => s.collapsed)
  const [mainColumnNarrow, setMainColumnNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1024px)').matches : false
  )
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState('account')
  const openSettings = (section) => {
    setSettingsSection(section ?? 'account')
    setSettingsOpen(true)
  }
  const [youtubeChannels, setYoutubeChannels] = useState([])
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeOAuthError, setYoutubeOAuthError] = useState(null)
  const [youtubeConnectionSuccess, setYoutubeConnectionSuccess] = useState(false)
  const [channelMenuOpen, setChannelMenuOpen] = useState(false)
  const channelPillRef = useRef(null)

  useEffect(() => {
    clearError()
  }, [clearError])

  // Handle YouTube OAuth return (hash: app-youtube?youtube=connected&channel=... or youtube=error&msg=...)
  useEffect(() => {
    const hash = window.location.hash || ''
    const qs = hash.indexOf('?') >= 0 ? hash.slice(hash.indexOf('?') + 1) : ''
    const params = new URLSearchParams(qs)
    const youtubeStatus = params.get('youtube')
    const channelId = params.get('channel')
    const msg = params.get('msg')

    // Clean URL immediately so user never sees the long OAuth return URL
    if (hash.startsWith('#app-youtube')) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search + '#dashboard'
      )
    }

    if (youtubeStatus === 'error') {
      setYoutubeOAuthError(msg || 'Connection failed. Please try again.')
      return
    }

    if (youtubeStatus === 'connected' && channelId) {
      setYoutubeConnectionSuccess(true)
      getValidAccessToken().then(async (token) => {
        if (!token) return
        try {
          const info = await youtubeApi.getChannelInfo(token, channelId)
          setYouTube(true, {
            channelId: info.channel_id,
            channel_title: info.channel_title,
            profile_image: info.profile_image,
            subscriberCount: info.subscriberCount ?? info.subscriber_count,
            viewCount: info.viewCount ?? info.view_count,
            videoCount: info.videoCount ?? info.video_count,
          })
          await useOnboardingStore.getState().syncChannelToBackend(token, channelId, info)
          await useOnboardingStore.getState().syncToBackend(token)
          try {
            const list = await youtubeApi.listChannels(token)
            setYoutubeChannels(list.channels || [])
          } catch (_) {}
          queryClient.invalidateQueries({ queryKey: queryKeys.user.preferences })
        } catch (_) {
          setYoutubeOAuthError('Connected but could not load channel details.')
          setYoutubeConnectionSuccess(false)
        }
      })
    }
  }, [queryClient])

  useEffect(() => {
    useOnboardingStore.getState().load()
    getValidAccessToken().then(async (token) => {
      if (token) {
        try {
          const bootstrap = await bootstrapYouTube(token)
          setYoutubeChannels(bootstrap.channels || [])
        } catch (_) {
          setYoutubeChannels([])
        }
      }
    })
  }, [bootstrapYouTube, getValidAccessToken])

  const channelId = youtube?.channelId || youtube?.channel_id || null
  const hasChannelData = Boolean(youtube?.connected && channelId)

  const snapshotRange = useMemo(() => {
    const to = toYYYYMMDD(new Date())
    const from = fromDaysAgo(30)
    return { from, to }
  }, [])

  const auditQuery = useDashboardAudit(channelId)
  const growthQuery = useDashboardGrowth(channelId)
  const snapshotQuery = useDashboardSnapshot(channelId, snapshotRange.from, snapshotRange.to)

  const recentVideosQuery = useYoutubeVideosPage({
    channelId,
    page: 1,
    perPage: 10,
    sort: 'published_at',
    videoType: 'videos',
    enabled: hasChannelData,
  })
  const recentVideosAll = recentVideosQuery.data?.items ?? []

  const [pulseAccessToken, setPulseAccessToken] = useState(null)
  useEffect(() => {
    if (!hasChannelData) return
    getAccessTokenOrNull().then((t) => setPulseAccessToken(t || null))
  }, [hasChannelData])

  // Namespace the persistent score cache to the signed-in user so a
  // shared device never reads another account's cached scores.
  const authUserId = useAuthStore((s) => s.user?.id)
  useEffect(() => {
    setVideoScoreCacheUser(authUserId || null)
  }, [authUserId])

  const audit = auditQuery.data
  const auditLoading = auditQuery.isPending

  const growth = growthQuery.data
  const growthLoading = growthQuery.isPending // eslint-disable-line no-unused-vars

  const prePublishScore = useMemo(() => (audit ? computePrePublishScore(audit) : null), [audit]) // eslint-disable-line no-unused-vars

  const snapshot = snapshotQuery.data

  const auditBreakdownStats = useMemo(() => {
    if (!Array.isArray(audit?.scores) || audit.scores.length === 0) return null
    const rows = audit.scores.map((s) => {
      const score = Number(s.score ?? 0)
      const tier = getAuditScoreTier(score)
      return {
        name: String(s.name ?? s.label ?? 'Area'),
        score: Number.isFinite(score) ? score : 0,
        tier,
      }
    })
    const weakest = rows.reduce((a, b) => (b.score < a.score ? b : a), rows[0])
    const avg = Math.round(rows.reduce((sum, r) => sum + r.score, 0) / rows.length)
    const focusCount = rows.filter((r) => r.tier !== 'high').length
    const strongCount = rows.filter((r) => r.tier === 'high').length
    return { rows, weakest, avg, focusCount, strongCount, total: rows.length }
  }, [audit])

  const growthScenario = useMemo(() => (growth ? getGrowthScenarioMessage(growth) : null), [growth]) // eslint-disable-line no-unused-vars

  /** Thumbnail audit data for the workshop section */
  const thumbnailAuditScore = useMemo(() => {
    if (!Array.isArray(audit?.scores)) return null
    const thumb = audit.scores.find((s) => s.name === 'Thumbnails' || s.name === 'CTR')
    return thumb ? Number(thumb.score ?? 0) : null
  }, [audit])

  const thumbnailAuditTips = useMemo(() => {
    if (!Array.isArray(audit?.scores)) return []
    const tips = []
    for (const s of audit.scores) {
      if (s.name === 'Thumbnails' || s.name === 'CTR') {
        if (Array.isArray(s.fixes)) tips.push(...s.fixes)
      }
    }
    return tips.filter((t) => t && typeof t === 'string' && t.trim()).slice(0, 4)
  }, [audit])

  /** Big numbers + bar lengths for forecast panel (velocity comparison). */
  // eslint-disable-next-line no-unused-vars
  const forecastMetrics = useMemo(() => {
    if (!growth) return null
    let proj =
      growth.projected_views_30d != null ? Math.round(Number(growth.projected_views_30d)) : null
    const v7 = growth.views_velocity_7d != null ? Number(growth.views_velocity_7d) : null
    const v30 = growth.views_velocity_30d != null ? Number(growth.views_velocity_30d) : null
    if (
      (proj == null || !Number.isFinite(proj) || proj <= 0) &&
      v30 != null &&
      Number.isFinite(v30) &&
      v30 > 0
    ) {
      proj = Math.round(v30 * 30)
    }
    const hasAny =
      (proj != null && Number.isFinite(proj) && proj > 0) ||
      (v7 != null && Number.isFinite(v7)) ||
      (v30 != null && Number.isFinite(v30))
    if (!hasAny) return null
    const maxV = Math.max(Number.isFinite(v7) ? v7 : 0, Number.isFinite(v30) ? v30 : 0, 1e-6)
    return {
      projected: proj != null && Number.isFinite(proj) && proj > 0 ? proj : null,
      projectedIsEstimated: growth.projected_views_30d == null && proj != null,
      v7: Number.isFinite(v7) ? v7 : null,
      v30: Number.isFinite(v30) ? v30 : null,
      v7Pct: v7 != null && Number.isFinite(v7) ? Math.min(100, (v7 / maxV) * 100) : 0,
      v30Pct: v30 != null && Number.isFinite(v30) ? Math.min(100, (v30 / maxV) * 100) : 0,
    }
  }, [growth])

  const dashboardName = youtube?.channel_title || youtube?.channelName || getDashboardName(user)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const onChange = () => setMainColumnNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Match the actual rendered sidebar widths used by the shell
  // (Sidebar.css `--sidebar-width: 232px`; collapsed = 0 because the
  // rail width animates to 0 in flex flow). The pill recentres itself
  // against the screen container's centre as the rail shrinks.
  const sidebarWidthPx = collapsed ? 0 : 232
  const pillLeft = mainColumnNarrow ? '50%' : `calc(50vw + ${sidebarWidthPx / 2}px)`

  const userPreferencesQuery = useUserPreferencesQuery()
  const userProfileQuery = useUserProfileQuery()
  const prefsHydratedRef = useRef(false)
  const profileHydratedRef = useRef(false)

  const subsCount = Number(youtube?.subscriberCount ?? youtube?.subscriber_count ?? 0)
  const viewsCount = Number(youtube?.viewCount ?? youtube?.view_count ?? 0)
  const milestoneChannelRef = useRef(null)
  const milestoneBaselineAppliedRef = useRef(false)
  const [subsMilestoneFrom, setSubsMilestoneFrom] = useState(null)
  const [viewsMilestoneFrom, setViewsMilestoneFrom] = useState(null)
  const uploadsCount = Number(youtube?.videoCount ?? youtube?.video_count ?? 0)
  const avgViewsCount =
    uploadsCount > 0 && Number.isFinite(viewsCount) ? Math.round(viewsCount / uploadsCount) : null
  const prevViewsPerVideo =
    snapshot?.previous_period?.views != null &&
    snapshot?.previous_period?.video_count != null &&
    Number(snapshot.previous_period.video_count) > 0
      ? Number(snapshot.previous_period.views) / Number(snapshot.previous_period.video_count)
      : null
  const subscribersGrowth =
    youtube?.subs_gained_28d != null && subsCount > Number(youtube.subs_gained_28d)
      ? getPercentChange(subsCount, subsCount - Number(youtube.subs_gained_28d))
      : growth?.subs_gained != null && subsCount > Number(growth.subs_gained)
        ? getPercentChange(subsCount, subsCount - Number(growth.subs_gained))
        : null
  const viewsGrowth = getPercentChange(
    snapshot?.current_period?.views,
    snapshot?.previous_period?.views
  )
  const avgViewsGrowth = getPercentChange(
    snapshot?.current_period?.views_per_video,
    prevViewsPerVideo
  )
  const overviewCards = [
    {
      key: 'subscribers',
      className: 'dashboard-overview-stat--subscribers',
      icon: <IconUsers />,
      value: formatCount(youtube.subscriberCount ?? youtube.subscriber_count) ?? '—',
      label: 'Subs',
      growth: subscribersGrowth,
    },
    {
      key: 'views',
      className: 'dashboard-overview-stat--views',
      icon: <IconViews />,
      value: formatCount(youtube.viewCount ?? youtube.view_count) ?? '—',
      label: 'Views',
      growth: viewsGrowth,
    },
    {
      key: 'avg-views',
      className: 'dashboard-overview-stat--avg-views',
      icon: <IconChartUp />,
      value: avgViewsCount != null ? formatCount(avgViewsCount) : '—',
      label: 'Avg / video',
      growth: avgViewsGrowth,
    },
  ]

  useEffect(() => {
    if (prefsHydratedRef.current) return
    const prefs = userPreferencesQuery.data
    if (!prefs || typeof prefs !== 'object') return
    if (prefs.preferredLanguage != null) setPreferredLanguage(prefs.preferredLanguage)
    if (prefs.niche != null) setNiche(prefs.niche)
    if (prefs.videoFormat != null) setVideoFormat(prefs.videoFormat)
    if (prefs.uploadFrequency != null) setUploadFrequency(prefs.uploadFrequency)
    prefsHydratedRef.current = true
  }, [userPreferencesQuery.data])

  // Restore YouTube connection from saved preferences when local storage is empty (other device / cleared).
  useEffect(() => {
    const prefs = userPreferencesQuery.data
    if (!prefs?.youtube || typeof prefs.youtube !== 'object') return
    if (!prefs.youtube.connected) return
    const cur = useOnboardingStore.getState().youtube
    if (cur?.connected && (cur.channelId || cur.channel_id)) return
    const y = prefs.youtube
    setYouTube(true, {
      channelId: y.channelId ?? y.channel_id,
      channel_title: y.channelTitle ?? y.channel_title,
      profile_image: y.avatar ?? y.profile_image,
      subscriberCount: y.subscriberCount ?? y.subscriber_count,
      viewCount: y.viewCount ?? y.view_count,
      videoCount: y.videoCount ?? y.video_count,
    })
  }, [userPreferencesQuery.data, setYouTube])

  useEffect(() => {
    if (profileHydratedRef.current) return
    const profile = userProfileQuery.data
    if (!profile || typeof profile !== 'object') return
    if (profile.niche != null) setNiche(profile.niche)
    if (profile.video_format != null) setVideoFormat(profile.video_format)
    if (profile.upload_frequency != null) setUploadFrequency(profile.upload_frequency)
    if (profile.preferred_tone != null) setPreferredTone(profile.preferred_tone)
    if (profile.speaking_style != null) setSpeakingStyle(profile.speaking_style)
    if (profile.preferred_cta_style != null) setPreferredCtaStyle(profile.preferred_cta_style)
    setIncludePersonalStories(profile.include_personal_stories !== false)
    setUseFirstPerson(profile.use_first_person !== false)
    profileHydratedRef.current = true
  }, [userProfileQuery.data])

  useEffect(() => {
    if (milestoneChannelRef.current !== channelId) {
      milestoneChannelRef.current = channelId
      milestoneBaselineAppliedRef.current = false
      setSubsMilestoneFrom(null)
      setViewsMilestoneFrom(null)
    }
  }, [channelId])

  useEffect(() => {
    if (milestoneBaselineAppliedRef.current || !channelId || !youtube?.connected) return
    const scRaw = youtube?.subscriberCount ?? youtube?.subscriber_count
    const vcRaw = youtube?.viewCount ?? youtube?.view_count
    if (scRaw === undefined && vcRaw === undefined) return
    const sc = Number(scRaw ?? 0)
    const vc = Number(vcRaw ?? 0)
    const s = readMilestoneVisitSnapshot(channelId)
    if (s && sc > s.subs) setSubsMilestoneFrom(s.subs)
    if (s && vc > s.views) setViewsMilestoneFrom(s.views)
    milestoneBaselineAppliedRef.current = true
  }, [
    channelId,
    youtube?.connected,
    youtube?.subscriberCount,
    youtube?.subscriber_count,
    youtube?.viewCount,
    youtube?.view_count,
  ])

  useEffect(() => {
    if (!channelId || !youtube?.connected) return
    const t = window.setTimeout(() => {
      writeMilestoneVisitSnapshot(channelId, subsCount, viewsCount)
    }, 1400)
    return () => clearTimeout(t)
  }, [channelId, subsCount, viewsCount, youtube?.connected])

  useEffect(() => {
    if (!channelId) return
    // Prefetch the default Optimize listing page so switching views feels instant.
    // Must use prefetchInfiniteQuery here — the Optimize page reads the same
    // query key with useInfiniteQuery, which expects a { pages, pageParams }
    // shape. A regular prefetchQuery would poison the cache with a flat page
    // object and crash the observer when computing hasNextPage.
    const perPage = 15
    queryClient
      .prefetchInfiniteQuery({
        queryKey: queryKeys.youtube.videos({
          channelId,
          perPage,
          search: '',
          sort: 'published_at',
          videoType: 'videos',
        }),
        queryFn: async ({ pageParam = 1 }) => {
          const token = await getAccessTokenOrNull()
          if (!token) return { items: [], total: 0, total_pages: 1, page: pageParam }
          return youtubeApi.listVideos(token, {
            page: pageParam,
            per_page: perPage,
            search: undefined,
            sort: 'published_at',
            video_type: 'videos',
          })
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) =>
          lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
        staleTime: queryFreshness.short,
      })
      .catch(() => {})
  }, [channelId, queryClient])

  const handlePulseOptimize = (video) => {
    window.location.hash = `optimize?video_id=${encodeURIComponent(video.id)}`
  }

  const handleConnectYouTube = async () => {
    setYoutubeOAuthError(null)
    const token = await getValidAccessToken()
    if (!token) return
    setYoutubeLoading(true)
    try {
      const url = await youtubeApi.getAuthorizationUrl(token)
      window.location.href = url
    } catch (e) {
      setYoutubeOAuthError(e?.message || 'Could not start connection.')
      setYoutubeLoading(false)
    }
  }

  const handleDisconnectYouTube = async () => {
    const channelId = youtube?.channelId
    if (!channelId) return
    setYoutubeLoading(true)
    const token = await getValidAccessToken()
    if (!token) {
      setYoutubeLoading(false)
      return
    }
    try {
      await youtubeApi.disconnectChannel(token, channelId)
      setYouTube(false, {})
      setYoutubeChannels((prev) => prev.filter((c) => c.channel_id !== channelId))
      await useOnboardingStore.getState().syncToBackend(token)
      queryClient.invalidateQueries({ queryKey: queryKeys.user.preferences })
    } catch (e) {
      setYoutubeOAuthError(e?.message || 'Could not disconnect.')
    }
    setYoutubeLoading(false)
  }

  const handleSwitchChannel = async (channelId) => {
    const token = await getValidAccessToken()
    if (!token) return
    setYoutubeLoading(true)
    try {
      await youtubeApi.switchChannel(token, channelId)
      const info = await youtubeApi.getChannelInfo(token, channelId)
      setYouTube(true, {
        channelId: info.channel_id,
        channel_title: info.channel_title,
        profile_image: info.profile_image,
        subscriberCount: info.subscriberCount ?? info.subscriber_count,
        viewCount: info.viewCount ?? info.view_count,
        videoCount: info.videoCount ?? info.video_count,
      })
      setYoutubeChannels(await youtubeApi.listChannels(token).then((r) => r.channels || []))
      await useOnboardingStore.getState().syncChannelToBackend(token, channelId, info)
      await useOnboardingStore.getState().syncToBackend(token)
      queryClient.invalidateQueries({ queryKey: queryKeys.user.preferences })
    } catch (_) {}
    setYoutubeLoading(false)
  }

  const handleLogout = async () => {
    await logout()
    onLogout?.()
  }

  // Close channel menu when clicking outside
  useEffect(() => {
    if (!channelMenuOpen) return
    const handleClick = (e) => {
      if (channelPillRef.current && !channelPillRef.current.contains(e.target)) {
        setChannelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [channelMenuOpen])

  const dashboardContent = (
    <>
      {/* Floating channel pill — top center */}
      <div
        className={`dashboard-channel-pill-wrap ${channelMenuOpen ? 'dashboard-channel-pill-wrap--open' : ''}`}
        ref={channelPillRef}
        style={{ left: pillLeft }}
      >
        <div className="dashboard-header-pills">
          {youtube?.connected ? (
            <div className="dashboard-channel-pill dashboard-channel-pill--connected">
              <button
                type="button"
                className="dashboard-channel-pill-trigger"
                onClick={() => setChannelMenuOpen((o) => !o)}
                aria-expanded={channelMenuOpen}
                aria-haspopup="true"
                aria-label="Channel menu"
              >
                <ChannelAvatar
                  src={youtube.profile_image || youtube.avatar}
                  className="dashboard-channel-pill-avatar"
                  fallbackClassName="dashboard-channel-pill-avatar--fallback"
                />
                <span
                  className="dashboard-channel-pill-name"
                  title={youtube.channel_title || youtube.channelName || 'My Channel'}
                >
                  {youtube.channel_title || youtube.channelName || 'My Channel'}
                </span>
                <span className="dashboard-channel-pill-chevron" aria-hidden>
                  <IconChevronDown />
                </span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="dashboard-channel-pill"
              onClick={handleConnectYouTube}
              disabled={youtubeLoading}
              aria-label="Connect YouTube"
            >
              <span className="dashboard-channel-pill-icon" aria-hidden>
                <IconPlus />
              </span>
              <span className="dashboard-channel-pill-label">Connect YouTube</span>
            </button>
          )}
        </div>

        {channelMenuOpen && youtube?.connected && (
          <div className="dashboard-channel-pill-menu" role="menu" aria-label="Channel options">
            <button
              type="button"
              className="dashboard-channel-pill-menu-item dashboard-channel-pill-menu-item--add"
              role="menuitem"
              onClick={() => {
                setChannelMenuOpen(false)
                handleConnectYouTube()
              }}
              disabled={youtubeLoading}
            >
              <span className="dashboard-channel-pill-menu-icon">
                <IconPlus />
              </span>
              Add another channel
            </button>
            {youtubeChannels?.length > 0 && (
              <>
                <div className="dashboard-channel-pill-menu-divider" />
                <div className="dashboard-channel-pill-menu-channels">
                  {youtubeChannels.map((c) => {
                    const isActive =
                      (c.channel_id || c.channelId) === (youtube?.channelId || youtube?.channel_id)
                    return (
                      <button
                        key={c.channel_id || c.channelId}
                        type="button"
                        className={`dashboard-channel-pill-menu-item ${isActive ? 'dashboard-channel-pill-menu-item--active' : ''}`}
                        role="menuitemradio"
                        aria-checked={isActive}
                        onClick={() => {
                          if (isActive) {
                            setChannelMenuOpen(false)
                            return
                          }
                          handleSwitchChannel(c.channel_id || c.channelId)
                          setChannelMenuOpen(false)
                        }}
                        disabled={youtubeLoading}
                      >
                        <ChannelAvatar
                          src={c.profile_image || c.avatar}
                          className="dashboard-channel-pill-menu-avatar"
                          fallbackClassName="dashboard-channel-pill-menu-avatar--fallback"
                        />
                        <span
                          className="dashboard-channel-pill-menu-name"
                          title={c.channel_title || c.channelName || c.channel_id}
                        >
                          {c.channel_title || c.channelName || c.channel_id}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            <div className="dashboard-channel-pill-menu-divider" />
            <button
              type="button"
              className="dashboard-channel-pill-menu-item dashboard-channel-pill-menu-item--danger"
              role="menuitem"
              onClick={() => {
                setChannelMenuOpen(false)
                handleDisconnectYouTube()
              }}
              disabled={youtubeLoading}
            >
              Disconnect channel
            </button>
          </div>
        )}
      </div>

      <div className="dashboard-main-scroll">
        <div className="dashboard-main">
          <div className="dashboard-content-shell">
            {youtubeConnectionSuccess && (
              <div className="dashboard-message dashboard-message--success" role="status">
                <span className="dashboard-message-icon" aria-hidden>
                  ✓
                </span>
                <span>YouTube connected successfully.</span>
                <button
                  type="button"
                  className="dashboard-message-dismiss"
                  onClick={() => setYoutubeConnectionSuccess(false)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}
            {youtubeOAuthError && (
              <div className="dashboard-message dashboard-message--error" role="alert">
                <span className="dashboard-message-icon">⚠️</span>
                <span>{youtubeOAuthError}</span>
                <button
                  type="button"
                  className="dashboard-message-dismiss"
                  onClick={() => setYoutubeOAuthError(null)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}

            {!shellManaged && (
              <SettingsModal
                open={settingsOpen}
                initialSection={settingsSection}
                onClose={() => setSettingsOpen(false)}
                user={user}
                accountDeletePasswordOptional={
                  typeof allowsPasswordlessAccountDelete === 'function' &&
                  allowsPasswordlessAccountDelete()
                }
                authLoading={authLoading}
                changePassword={changePassword}
                deleteData={deleteData}
                deleteAccount={deleteAccount}
                clearLocalData={clearLocalData}
                youtube={youtube}
                youtubeChannels={youtubeChannels}
                youtubeLoading={youtubeLoading}
                youtubeOAuthError={youtubeOAuthError}
                setYoutubeOAuthError={setYoutubeOAuthError}
                onConnectYouTube={handleConnectYouTube}
                onDisconnectYouTube={handleDisconnectYouTube}
                onSwitchChannel={handleSwitchChannel}
                niche={niche}
                videoFormat={videoFormat}
                uploadFrequency={uploadFrequency}
                preferredLanguage={preferredLanguage}
                setPreferredLanguage={setPreferredLanguage}
                getValidAccessToken={getValidAccessToken}
                syncToBackend={syncToBackend}
                setNiche={setNiche}
                setVideoFormat={setVideoFormat}
                setUploadFrequency={setUploadFrequency}
                preferredTone={preferredTone}
                speakingStyle={speakingStyle}
                preferredCtaStyle={preferredCtaStyle}
                includePersonalStories={includePersonalStories}
                useFirstPerson={useFirstPerson}
                setPreferredTone={setPreferredTone}
                setSpeakingStyle={setSpeakingStyle}
                setPreferredCtaStyle={setPreferredCtaStyle}
                setIncludePersonalStories={setIncludePersonalStories}
                setUseFirstPerson={setUseFirstPerson}
                onLogout={onLogout}
              />
            )}

            {/* Compact YouTube connect promo — when not connected */}
            {!youtube?.connected && (
              <section className="dashboard-yt-connect-banner" aria-label="Connect YouTube">
                <div className="dashboard-yt-connect-banner-body">
                  <div className="dashboard-yt-connect-banner-head">
                    <span className="dashboard-yt-connect-banner-badge" aria-hidden>
                      <IconYoutubeMark />
                    </span>
                    <div className="dashboard-yt-connect-banner-titles">
                      <h2 className="dashboard-yt-connect-banner-greeting">
                        {getGreetingText()},{' '}
                        <span className="dashboard-yt-connect-banner-name">{dashboardName}</span>
                      </h2>
                    </div>
                  </div>
                  <ul className="dashboard-yt-connect-banner-grid">
                    <li>
                      <span className="dashboard-yt-connect-banner-cell-icon" aria-hidden>
                        <IconSpark />
                      </span>
                      <div>
                        <strong>AI insights</strong>
                      </div>
                    </li>
                    <li>
                      <span className="dashboard-yt-connect-banner-cell-icon" aria-hidden>
                        <IconTileGauge />
                      </span>
                      <div>
                        <strong>Channel audit</strong>
                      </div>
                    </li>
                    <li>
                      <span className="dashboard-yt-connect-banner-cell-icon" aria-hidden>
                        <IconChartUp />
                      </span>
                      <div>
                        <strong>Growth analytics</strong>
                      </div>
                    </li>
                    <li>
                      <span className="dashboard-yt-connect-banner-cell-icon" aria-hidden>
                        <IconOptimize />
                      </span>
                      <div>
                        <strong>Quick actions</strong>
                      </div>
                    </li>
                  </ul>
                  <div className="dashboard-yt-connect-banner-cta-wrap">
                    <button
                      type="button"
                      className="dashboard-yt-connect-banner-cta"
                      onClick={handleConnectYouTube}
                      disabled={youtubeLoading}
                    >
                      {youtubeLoading ? (
                        <>
                          <span className="dashboard-yt-connect-banner-cta-spinner" aria-hidden />
                          Connecting…
                        </>
                      ) : (
                        <>
                          <span className="dashboard-yt-connect-banner-cta-yt" aria-hidden>
                            <IconYoutubeMark />
                          </span>
                          Connect YouTube
                          <span className="dashboard-yt-connect-banner-cta-arrow" aria-hidden>
                            <IconArrowRight />
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </section>
            )}
            {!youtube?.connected && <DashboardEmptyTagline />}

            {/* Channel Overview — linked channel with ID only */}
            {hasChannelData && (
              <section className="dashboard-section dashboard-channel-overview">
                <div className="dashboard-overview-intro">
                  <h2 className="dashboard-overview-greeting">
                    {getGreetingText()},{' '}
                    <span className="dashboard-overview-greeting-accent">{dashboardName}</span>
                  </h2>
                </div>
                <div className="dashboard-overview-card dashboard-overview-card--compact">
                  <div className="dashboard-overview-stats">
                    {overviewCards.map((card) => {
                      const growthValue = Number.isFinite(card.growth) ? card.growth : null
                      const growthText = formatGrowthPercent(growthValue)
                      const growthClass =
                        growthValue != null && growthValue > 0
                          ? 'is-positive'
                          : growthValue != null && growthValue < 0
                            ? 'is-negative'
                            : 'is-neutral'

                      return (
                        <article
                          key={card.key}
                          className={`dashboard-overview-stat ${card.className}`}
                        >
                          <div className="dashboard-overview-stat-head">
                            <span className="dashboard-overview-stat-icon" aria-hidden>
                              {card.icon}
                            </span>
                            {growthText != null ? (
                              <span className={`dashboard-overview-stat-growth ${growthClass}`}>
                                {growthText}
                              </span>
                            ) : (
                              <span
                                className="dashboard-overview-stat-growth dashboard-overview-stat-growth--na"
                                title="No period comparison yet"
                              >
                                —
                              </span>
                            )}
                          </div>
                          <span className="dashboard-overview-stat-value">{card.value}</span>
                          <div className="dashboard-overview-stat-meta">
                            <span className="dashboard-overview-stat-label">{card.label}</span>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  <div className="dashboard-milestones-wrap dashboard-milestones-wrap--compact">
                    <div className="dashboard-milestones-grid dashboard-milestones-grid--pair">
                      <DashboardMilestones
                        key={
                          subsMilestoneFrom != null
                            ? `ms-s-${channelId}-${subsMilestoneFrom}`
                            : `ms-s-${channelId}`
                        }
                        title="Subscribers"
                        steps={SUBS_STEPS}
                        current={subsCount}
                        animateFrom={subsMilestoneFrom}
                      />
                      <DashboardMilestones
                        key={
                          viewsMilestoneFrom != null
                            ? `ms-v-${channelId}-${viewsMilestoneFrom}`
                            : `ms-v-${channelId}`
                        }
                        title="Views"
                        steps={VIEWS_STEPS}
                        current={viewsCount}
                        animateFrom={viewsMilestoneFrom}
                      />
                    </div>
                  </div>
                </div>
              </section>
            )}

            {youtube?.connected && !channelId && (
              <section
                className="dashboard-section dashboard-channel-pending-section"
                aria-label="Finish channel setup"
              >
                <div className="dashboard-command-channel-pending" role="status">
                  <div className="dashboard-command-channel-pending-text">
                    <strong>Pick your channel.</strong> Open Account settings and choose which
                    YouTube channel to analyze—then audits, forecasts, and ranked ideas load here.
                  </div>
                  <DashButton variant="primary" onClick={() => openSettings('account')}>
                    Open account settings
                  </DashButton>
                </div>
              </section>
            )}

            {hasChannelData && (
              <DashSection icon="videos" title="SEO improvement ideas">
                <LowestScoredVideos
                  videos={recentVideosAll}
                  loading={recentVideosQuery.isPending}
                  accessToken={pulseAccessToken}
                  onOptimize={handlePulseOptimize}
                />
              </DashSection>
            )}

            {/* Channel Audit (channel required) */}
            {channelId && (
              <DashSection
                icon="health"
                title="Channel health"
                id="dashboard-audit-heading"
                className="dashboard-audit-open-section"
              >
                {auditLoading && (
                  <SkeletonGroup className="audit-v2" label="Loading audit">
                    <div className="audit-v2__score-card">
                      <div className="audit-v2__ring-wrap">
                        <SkeletonCircle size={64} />
                      </div>
                      <div className="audit-v2__score-info">
                        <Skeleton height={14} width={120} radius={999} />
                        <Skeleton height={10} width={160} radius={999} />
                      </div>
                    </div>
                    <div className="audit-v2__grid">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="audit-v2__item">
                          <div className="audit-v2__item-left">
                            <Skeleton width={34} height={34} radius={8} />
                            <div className="audit-v2__item-info">
                              <Skeleton height={12} width="55%" radius={999} />
                              <div className="audit-v2__item-bar" />
                            </div>
                          </div>
                          <div className="audit-v2__item-right">
                            <Skeleton height={10} width={36} radius={999} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </SkeletonGroup>
                )}
                {!auditLoading && audit && (
                  <div className="audit-v2">
                    {/* Overall score card */}
                    <div className="audit-v2__score-card">
                      <div className="audit-v2__ring-wrap">
                        <svg viewBox="0 0 100 100" className="audit-v2__ring-svg" aria-hidden>
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth="6"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke={getScoreColor(audit.overall_score ?? 0)}
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${((audit.overall_score ?? 0) / 100) * 263.9} 263.9`}
                            transform="rotate(-90 50 50)"
                            className="audit-v2__ring-fill"
                          />
                        </svg>
                        <div className="audit-v2__ring-center">
                          <span className="audit-v2__ring-val">{audit.overall_score ?? 0}</span>
                        </div>
                      </div>
                      <div className="audit-v2__score-info">
                        <span
                          className="audit-v2__score-tier"
                          style={{ color: getScoreColor(audit.overall_score ?? 0) }}
                        >
                          {auditTierLabel(getAuditScoreTier(audit.overall_score ?? 0))}
                        </span>
                        {auditBreakdownStats && (
                          <div className="audit-v2__score-stats">
                            <span>
                              <strong>{auditBreakdownStats.strongCount}</strong> strong
                            </span>
                            <span className="audit-v2__score-dot">·</span>
                            <span>
                              <strong>{auditBreakdownStats.focusCount}</strong> to improve
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Individual area cards — fully pressable */}
                    {Array.isArray(audit.scores) && audit.scores.length > 0 && (
                      <div className="audit-v2__grid">
                        {audit.scores.map((s, i) => {
                          const aScore = Number(s.score ?? 0)
                          const aPct = Math.min(100, Math.max(0, aScore))
                          const nm = String(s.name ?? s.label ?? '')
                          const guidance = getAuditAreaGuidance(
                            nm,
                            aScore,
                            s.label ? String(s.label) : null
                          )
                          const areaAct = guidance.href
                            ? { label: 'Fix', hash: guidance.href }
                            : getAreaAction(nm)
                          const areaNavHash = hashWithPrefill(
                            areaAct.hash,
                            getAreaPrefill(nm, aScore)
                          )
                          const scoreColor = getScoreColor(aScore)
                          return (
                            <a
                              key={i}
                              href={`#${areaNavHash}`}
                              className="audit-v2__item"
                              style={{ '--audit-accent': scoreColor }}
                              onClick={(e) => {
                                e.preventDefault()
                                window.location.hash = areaNavHash
                              }}
                            >
                              <div className="audit-v2__item-left">
                                <div
                                  className="audit-v2__item-score-badge"
                                  style={{ background: `${scoreColor}18`, color: scoreColor }}
                                >
                                  {aScore}
                                </div>
                                <div className="audit-v2__item-info">
                                  <span className="audit-v2__item-name">{s.name ?? s.label}</span>
                                  <div className="audit-v2__item-bar">
                                    <div
                                      className="audit-v2__item-bar-fill"
                                      style={{ width: `${aPct}%`, background: scoreColor }}
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="audit-v2__item-right">
                                <span className="audit-v2__item-cta">
                                  {aScore >= 70 ? 'Details' : areaAct.label || 'Improve'}
                                </span>
                                <svg
                                  className="audit-v2__item-arrow"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m9 18 6-6-6-6" />
                                </svg>
                              </div>
                            </a>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </DashSection>
            )}

            {/* Thumbnail workshop — CTR improvement tools */}
            {channelId && (
              <DashSection
                icon="quick"
                title="Thumbnail workshop"
                className="dashboard-thumb-workshop"
              >
                <div className="dashboard-thumb-workshop-grid">
                  <a
                    href={`#${hashWithPrefill('thumbnails', thumbPrefill({ pillar: 'CTR', score: thumbnailAuditScore, videoTitle: null }))}`}
                    className="dashboard-thumb-workshop-card"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.hash = hashWithPrefill(
                        'thumbnails',
                        thumbPrefill({
                          pillar: 'CTR',
                          score: thumbnailAuditScore,
                          videoTitle: null,
                        })
                      )
                    }}
                  >
                    <span className="dashboard-thumb-workshop-card-icon" aria-hidden>
                      <IconThumbnail />
                    </span>
                    <div className="dashboard-thumb-workshop-card-text">
                      <span className="dashboard-thumb-workshop-card-title">
                        Generate thumbnails
                      </span>
                      <span className="dashboard-thumb-workshop-card-desc">
                        AI creates 4 contrasting thumbnail directions for your next video
                      </span>
                    </div>
                    <span className="dashboard-thumb-workshop-card-arrow" aria-hidden>
                      <IconArrowRight />
                    </span>
                  </a>
                  <a
                    href={`#${thumbnailBattleHref(null)}`}
                    className="dashboard-thumb-workshop-card"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.hash = thumbnailBattleHref(null)
                    }}
                  >
                    <span
                      className="dashboard-thumb-workshop-card-icon dashboard-thumb-workshop-card-icon--battle"
                      aria-hidden
                    >
                      <IconChartUp />
                    </span>
                    <div className="dashboard-thumb-workshop-card-text">
                      <span className="dashboard-thumb-workshop-card-title">Thumbnail battle</span>
                      <span className="dashboard-thumb-workshop-card-desc">
                        Compare two thumbnail options and get AI feedback on which drives more
                        clicks
                      </span>
                    </div>
                    <span className="dashboard-thumb-workshop-card-arrow" aria-hidden>
                      <IconArrowRight />
                    </span>
                  </a>
                  <a
                    href={`#${hashWithPrefill('optimize', optimizePrefill('titles & thumbnails', thumbnailAuditScore))}`}
                    className="dashboard-thumb-workshop-card"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.hash = hashWithPrefill(
                        'optimize',
                        optimizePrefill('titles & thumbnails', thumbnailAuditScore)
                      )
                    }}
                  >
                    <span
                      className="dashboard-thumb-workshop-card-icon dashboard-thumb-workshop-card-icon--optimize"
                      aria-hidden
                    >
                      <IconOptimize />
                    </span>
                    <div className="dashboard-thumb-workshop-card-text">
                      <span className="dashboard-thumb-workshop-card-title">Optimize existing</span>
                      <span className="dashboard-thumb-workshop-card-desc">
                        Review your published thumbnails and get suggestions to improve CTR
                      </span>
                    </div>
                    <span className="dashboard-thumb-workshop-card-arrow" aria-hidden>
                      <IconArrowRight />
                    </span>
                  </a>
                </div>
                {thumbnailAuditTips.length > 0 && (
                  <div className="dashboard-thumb-workshop-tips">
                    <span className="dashboard-thumb-workshop-tips-label">
                      Quick tips from your audit
                    </span>
                    <ul className="dashboard-thumb-workshop-tips-list">
                      {thumbnailAuditTips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </DashSection>
            )}
          </div>
        </div>
      </div>
    </>
  )

  if (shellManaged) return dashboardContent

  return (
    <AppShellLayout
      pageClassName="dashboard-page"
      mainClassName="dashboard-main-wrap"
      sidebar={
        <Sidebar
          user={user}
          onOpenSettings={openSettings}
          onLogout={handleLogout}
          currentScreen="dashboard"
        />
      }
    >
      {dashboardContent}
    </AppShellLayout>
  )
}
