import { useState, useEffect, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { useOnboardingStore } from '../stores/onboardingStore'
import { useSidebarStore } from '../stores/sidebarStore'
import { youtubeApi } from '../api/youtube'
import { Sidebar } from './Sidebar'
import { SettingsModal } from './SettingsModal'
import './Sidebar.css'
import './SettingsModal.css'
import './Dashboard.css'
import { queryKeys } from '../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { queryFreshness } from '../lib/query/queryConfig'
import {
  useDashboardAudit,
  useDashboardBestTime,
  useDashboardGrowth,
  useDashboardInsights,
  useDashboardSnapshot,
  useIdeaFeedbackMutation,
} from '../queries/dashboard/dashboardQueries'
import { useUserPreferencesQuery } from '../queries/user/preferencesQueries'
import { useUserProfileQuery } from '../queries/user/profileQueries'
import {
  computeNextBestAction,
  countBestTimeUploads,
  fixLineToAction,
  getAreaAction,
  getAuditAreaGuidance,
  getGrowthScenarioMessage,
  getGrowthStatInsight,
  getSnapshotStatInsight,
} from '../lib/dashboardActions'
import {
  buildContentStrategyRoadmap,
  computeGrowthBottleneck,
  computePrePublishScore,
  computeScriptPerformanceEstimate,
  normalizeNextBestVideo,
  thumbnailBattleHref,
} from '../lib/dashboardCommandCenter'
import {
  appendPrefillToHash,
  coachPrefill,
  getAreaPrefill,
  optimizePrefill,
  prefillForDashboardHashHref,
  scriptPrefill,
  thumbPrefill,
} from '../lib/dashboardActionPayload'
import {
  getMilestonePair,
  SUBS_STEPS,
  VIEWS_STEPS,
} from '../lib/channelMilestones'
import { readMilestoneVisitSnapshot, writeMilestoneVisitSnapshot } from '../lib/milestoneVisitStorage'

function hashWithPrefill(baseHash, prefill) {
  if (!baseHash) return ''
  if (!prefill) return baseHash
  return appendPrefillToHash(baseHash, prefill)
}

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
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
)
const IconRefresh = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)
const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
  </svg>
)
const IconViews = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const IconChartUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
)
const IconScript = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="m2 2 7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
)
const IconThumbnail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
  </svg>
)
const IconMessage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10H4a2 2 0 0 1-2-2V4a10 10 0 0 0 10 2z" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
)
const IconOptimize = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
)

const IconSpark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
)

const IconTileScript = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)

const IconTileGrid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const IconTileGauge = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
    <path d="M19.4 15a8.5 8.5 0 0 0 .1-1 8.5 8.5 0 0 0-8.5-8.5 8.5 8.5 0 0 0-8.5 8.5 8.5 8.5 0 0 0 .1 1" />
    <path d="M12 5V3" />
  </svg>
)

const IconTileTarget = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

const IconTileLayers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
    <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
  </svg>
)

const IconTilePalette = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
)

const IDEA_FEEDBACK_REASONS = [
  { value: 'not_my_niche', label: 'Not my niche' },
  { value: 'already_made', label: 'I already made this' },
  { value: 'not_relevant', label: 'Not relevant right now' },
  { value: 'too_hard', label: 'Too hard to produce' },
  { value: 'other', label: 'Other' },
]

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

function getGreetingText() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getTodayLabel() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
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

/** API returns strings or { area, priority, fixes: string[] } */
function normalizeAuditFix(fix) {
  if (fix == null) return null
  if (typeof fix === 'string') {
    const t = fix.trim()
    return t ? { area: null, priority: null, lines: [t] } : null
  }
  if (typeof fix === 'object') {
    const area = fix.area ?? fix.name ?? null
    const priority = fix.priority ?? null
    let lines = []
    if (Array.isArray(fix.fixes)) {
      lines = fix.fixes.map((x) => String(x).trim()).filter(Boolean)
    }
    if (lines.length === 0 && fix.title) lines = [String(fix.title).trim()].filter(Boolean)
    if (lines.length === 0 && fix.text) lines = [String(fix.text).trim()].filter(Boolean)
    return lines.length ? { area, priority, lines } : null
  }
  return null
}

function getFirstAdviceLine(actionableFixes) {
  if (!Array.isArray(actionableFixes) || actionableFixes.length === 0) return null
  const n = normalizeAuditFix(actionableFixes[0])
  return n?.lines?.[0] ?? null
}

/** Visual tier for audit scores (bars, badges) */
function getAuditScoreTier(score) {
  const n = Number(score)
  if (!Number.isFinite(n)) return 'mid'
  if (n >= 70) return 'high'
  if (n >= 40) return 'mid'
  return 'low'
}

function PerformanceStatInsight({ insight, compact }) {
  if (!insight) return null
  const tip = insight.tip ?? [insight.diagnosis, insight.action].filter(Boolean).join(' ')
  if (!tip) return null
  const cta = insight.cta ?? (compact ? 'Go' : 'Open')
  return (
    <div
      className={`dashboard-stat-insight ${compact ? 'dashboard-stat-insight--compact' : ''} dashboard-stat-insight--performance`}
    >
      <p className="dashboard-stat-insight-text">{tip}</p>
      <a
        href={`#${hashWithPrefill(insight.href, prefillForDashboardHashHref(insight.href))}`}
        className="dashboard-stat-insight-cta"
        onClick={(e) => {
          e.preventDefault()
          window.location.hash = hashWithPrefill(insight.href, prefillForDashboardHashHref(insight.href))
        }}
      >
        {cta} <IconArrowRight />
      </a>
    </div>
  )
}

function DashboardMilestoneStrip({ title, steps, current, animateFrom, major, locked, lockedHint }) {
  const cur = Math.max(0, Number(current) || 0)
  const fromCandidate = animateFrom != null && animateFrom < cur ? Math.max(0, Number(animateFrom) || 0) : null
  const [live, setLive] = useState(() => (fromCandidate != null ? fromCandidate : cur))
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
    if (reducedMotionRef.current) {
      visitAnimDoneRef.current = true
      setLive(cur)
      return
    }
    if (visitAnimDoneRef.current) {
      setLive(cur)
      return
    }
    setLive(fromCandidate)
    const start = performance.now()
    const dur = 920
    const a = fromCandidate
    const b = cur
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur)
      const e = 1 - (1 - p) ** 2.35
      setLive(Math.round(a + (b - a) * e))
      if (p >= 1) visitAnimDoneRef.current = true
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [fromCandidate, cur])

  const display = locked ? cur : live
  const { achieved, next, barFillPercent } = getMilestonePair(display, steps)
  const pct = locked ? 0 : barFillPercent
  const nowLabel = formatCount(display)
  const isVisitAnimating = !locked && fromCandidate != null && display !== cur

  return (
    <div
      className={`dashboard-milestone-strip ${major ? 'dashboard-milestone-strip--major' : ''} ${locked ? 'is-locked' : ''} ${isVisitAnimating ? 'dashboard-milestone-strip--visit-in' : ''}`}
      role="group"
      aria-label={`${title} milestones`}
    >
      <div className="dashboard-milestone-strip-head">
        <span className="dashboard-milestone-strip-title">{title}</span>
        {locked && lockedHint ? (
          <span className="dashboard-milestone-strip-lock">{lockedHint}</span>
        ) : (
          <span className="dashboard-milestone-strip-now">
            Now · <strong>{nowLabel}</strong>
          </span>
        )}
      </div>

      <div className="dashboard-milestone-pair">
        <div className="dashboard-milestone-card dashboard-milestone-card--achieved">
          <span className="dashboard-milestone-card-kicker">Latest hit</span>
          {achieved ? (
            <>
              <span className="dashboard-milestone-card-value">{achieved.label}</span>
              <span className="dashboard-milestone-card-desc">{achieved.title}</span>
            </>
          ) : (
            <>
              <span className="dashboard-milestone-card-value dashboard-milestone-card-value--muted">—</span>
              <span className="dashboard-milestone-card-desc">No milestone yet</span>
            </>
          )}
        </div>
        <div className="dashboard-milestone-card dashboard-milestone-card--next">
          <span className="dashboard-milestone-card-kicker">Next target</span>
          {next ? (
            <>
              <span className="dashboard-milestone-card-value">{next.label}</span>
              <span className="dashboard-milestone-card-desc">{next.title}</span>
            </>
          ) : (
            <>
              <span className="dashboard-milestone-card-value dashboard-milestone-card-value--done">Done</span>
              <span className="dashboard-milestone-card-desc">You cleared this path</span>
            </>
          )}
        </div>
      </div>

      <div className="dashboard-milestone-bar" aria-hidden={locked ? true : undefined}>
        <div className="dashboard-milestone-bar-track" />
        <div className="dashboard-milestone-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      {!locked && next && (
        <p className="dashboard-milestone-caption">
          <span>{formatCount(Math.max(0, next.target - display))} to go</span>
          <span className="dashboard-milestone-caption-sep" aria-hidden>
            ·
          </span>
          <span>target {formatCount(next.target)}</span>
        </p>
      )}
      {locked ? (
        <p className="dashboard-milestone-caption dashboard-milestone-caption--locked">Progress hidden until unlocked</p>
      ) : null}
    </div>
  )
}

export function Dashboard({ onLogout }) {
  const { user, logout, changePassword, deleteData, deleteAccount, getValidAccessToken, isLoading: authLoading, error: authError, clearError } = useAuthStore()
  const { preferredLanguage, niche, videoFormat, uploadFrequency, youtube, setYouTube, setPreferredLanguage, setNiche, setVideoFormat, setUploadFrequency, preferredTone, speakingStyle, preferredCtaStyle, includePersonalStories, useFirstPerson, setPreferredTone, setSpeakingStyle, setPreferredCtaStyle, setIncludePersonalStories, setUseFirstPerson, clearLocalData, syncToBackend } = useOnboardingStore()
  const collapsed = useSidebarStore((s) => s.collapsed)
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
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [deleteDataConfirm, setDeleteDataConfirm] = useState(false)
  const [deleteDataSuccess, setDeleteDataSuccess] = useState(false)
  const [deleteDataError, setDeleteDataError] = useState('')
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('')
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState('')
  const [channelMenuOpen, setChannelMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const channelPillRef = useRef(null)

  const [ideaFeedbackSending, setIdeaFeedbackSending] = useState(null)
  const [ideaFeedbackNotice, setIdeaFeedbackNotice] = useState(null)
  const [ideaDismissIdea, setIdeaDismissIdea] = useState(null)
  const [ideaDismissReason, setIdeaDismissReason] = useState('not_relevant')
  const [ideaDismissDetails, setIdeaDismissDetails] = useState('')
  const [ideaDismissError, setIdeaDismissError] = useState('')

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
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#dashboard')
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
          if (!useOnboardingStore.getState().onboardingCompleted) {
            useOnboardingStore.getState().completeOnboarding()
          }
        } catch (_) {
          setYoutubeOAuthError('Connected but could not load channel details.')
          setYoutubeConnectionSuccess(false)
        }
      })
    }
  }, [])

  useEffect(() => {
    useOnboardingStore.getState().load()
    getValidAccessToken().then(async (token) => {
      if (token) {
        try {
          const list = await youtubeApi.listChannels(token)
          setYoutubeChannels(list.channels || [])
          if (list.channels?.length > 0) {
            const activeId = list.active_channel_id || list.channels[0]?.channel_id
            const info = await youtubeApi.getChannelInfo(token, activeId)
            setYouTube(true, {
              channelId: info.channel_id,
              channel_title: info.channel_title,
              profile_image: info.profile_image,
              subscriberCount: info.subscriberCount ?? info.subscriber_count,
              viewCount: info.viewCount ?? info.view_count,
              videoCount: info.videoCount ?? info.video_count,
            })
            await useOnboardingStore.getState().syncChannelToBackend(token, activeId, info)
          }
        } catch (_) {
          setYoutubeChannels([])
        }
      }
    })
  }, [])

  const channelId = youtube?.channelId || youtube?.channel_id || null

  const utcOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), [])
  const snapshotRange = useMemo(() => {
    const to = toYYYYMMDD(new Date())
    const from = fromDaysAgo(30)
    return { from, to }
  }, [])

  const insightsQuery = useDashboardInsights(channelId)
  const auditQuery = useDashboardAudit(channelId)
  const growthQuery = useDashboardGrowth(channelId)
  const snapshotQuery = useDashboardSnapshot(channelId, snapshotRange.from, snapshotRange.to)
  const bestTimeQuery = useDashboardBestTime(channelId, utcOffsetMinutes)

  const insights = insightsQuery.data
  const insightsLoading = insightsQuery.isPending
  const insightsError = insightsQuery.isError ? insightsQuery.error?.message : null
  const visibleScriptIdeas = useMemo(() => {
    if (!Array.isArray(insights?.script_suggestions)) return []
    return insights.script_suggestions.filter(Boolean).slice(0, 3)
  }, [insights])

  const audit = auditQuery.data
  const auditLoading = auditQuery.isPending
  const auditAdviceItems = useMemo(() => {
    if (!audit?.actionable_fixes?.length) return []
    return audit.actionable_fixes.map(normalizeAuditFix).filter(Boolean)
  }, [audit])

  const growth = growthQuery.data
  const growthLoading = growthQuery.isPending

  const nextBestVideo = useMemo(() => normalizeNextBestVideo(visibleScriptIdeas[0]), [visibleScriptIdeas])
  const moreScriptIdeas = useMemo(() => visibleScriptIdeas.slice(1), [visibleScriptIdeas])
  const prePublishScore = useMemo(() => (audit ? computePrePublishScore(audit) : null), [audit])
  const scriptPerformanceEstimate = useMemo(
    () => (audit ? computeScriptPerformanceEstimate(audit) : null),
    [audit],
  )
  const growthBottleneck = useMemo(
    () => (audit ? computeGrowthBottleneck(audit, growth) : null),
    [audit, growth],
  )
  const contentRoadmap = useMemo(
    () => buildContentStrategyRoadmap(visibleScriptIdeas.slice(0, 3)),
    [visibleScriptIdeas],
  )

  const snapshot = snapshotQuery.data
  const snapshotLoading = snapshotQuery.isPending

  const bestTime = bestTimeQuery.data
  const bestTimeLoading = bestTimeQuery.isPending

  const performanceSnapshotHasKpis = useMemo(() => {
    const p = snapshot?.current_period
    if (!p) return false
    return (
      p.views != null ||
      p.watch_time_hours != null ||
      p.video_count != null ||
      p.views_per_video != null
    )
  }, [snapshot])

  const performanceGrowthHasKpis = useMemo(() => {
    if (!growth) return false
    return (
      growth.subs_current != null ||
      growth.views_velocity_7d != null ||
      growth.views_velocity_30d != null ||
      growth.projected_views_30d != null
    )
  }, [growth])

  const nextBestAction = useMemo(() => {
    if (!channelId || auditLoading || !audit) return null
    return computeNextBestAction({ audit, growth, snapshot })
  }, [channelId, auditLoading, audit, growth, snapshot])

  const nextBestNavHash = useMemo(() => {
    if (!nextBestAction) return null
    return hashWithPrefill(nextBestAction.hash, nextBestAction.prefillPrompt)
  }, [nextBestAction])

  const topPriorityNavHash = useMemo(() => {
    if (!audit) return hashWithPrefill('optimize', optimizePrefill('channel health', null))
    const firstLine = getFirstAdviceLine(audit.actionable_fixes)
    const act = firstLine
      ? fixLineToAction(firstLine, null)
      : { hash: 'optimize', prefill: optimizePrefill('channel health', audit.overall_score ?? null) }
    return hashWithPrefill(act.hash, act.prefill)
  }, [audit])

  const growthScenario = useMemo(() => (growth ? getGrowthScenarioMessage(growth) : null), [growth])

  /** Big numbers + bar lengths for forecast panel (velocity comparison). */
  const forecastMetrics = useMemo(() => {
    if (!growth) return null
    const proj = growth.projected_views_30d != null ? Math.round(Number(growth.projected_views_30d)) : null
    const v7 = growth.views_velocity_7d != null ? Number(growth.views_velocity_7d) : null
    const v30 = growth.views_velocity_30d != null ? Number(growth.views_velocity_30d) : null
    const maxV = Math.max(Number.isFinite(v7) ? v7 : 0, Number.isFinite(v30) ? v30 : 0, 1e-6)
    return {
      projected: proj,
      v7: Number.isFinite(v7) ? v7 : null,
      v30: Number.isFinite(v30) ? v30 : null,
      v7Pct: v7 != null && Number.isFinite(v7) ? Math.min(100, (v7 / maxV) * 100) : 0,
      v30Pct: v30 != null && Number.isFinite(v30) ? Math.min(100, (v30 / maxV) * 100) : 0,
    }
  }, [growth])

  const bestTimeUploadTotal = useMemo(
    () => countBestTimeUploads(bestTime?.bar_chart_data),
    [bestTime?.bar_chart_data],
  )

  const ideaFeedbackMutation = useIdeaFeedbackMutation({ channelId })
  const queryClient = useQueryClient()
  const dashboardName = getDashboardName(user)
  const todayLabel = getTodayLabel()

  const sidebarWidthPx = collapsed ? 60 : 252
  const pillLeft = `calc(50vw + ${sidebarWidthPx / 2}px)`

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
  const avgViewsCount = uploadsCount > 0 && Number.isFinite(viewsCount)
    ? Math.round(viewsCount / uploadsCount)
    : null
  const prevViewsPerVideo = (
    snapshot?.previous_period?.views != null &&
    snapshot?.previous_period?.video_count != null &&
    Number(snapshot.previous_period.video_count) > 0
  )
    ? Number(snapshot.previous_period.views) / Number(snapshot.previous_period.video_count)
    : null
  const subscribersGrowth = (
    youtube?.subs_gained_28d != null && subsCount > Number(youtube.subs_gained_28d)
  )
    ? getPercentChange(subsCount, subsCount - Number(youtube.subs_gained_28d))
    : (growth?.subs_gained != null && subsCount > Number(growth.subs_gained)
      ? getPercentChange(subsCount, subsCount - Number(growth.subs_gained))
      : null)
  const viewsGrowth = getPercentChange(snapshot?.current_period?.views, snapshot?.previous_period?.views)
  const avgViewsGrowth = getPercentChange(snapshot?.current_period?.views_per_video, prevViewsPerVideo)
  const overviewCards = [
    {
      key: 'subscribers',
      className: 'dashboard-overview-stat--subscribers',
      icon: <IconUsers />,
      value: formatCount(youtube.subscriberCount ?? youtube.subscriber_count) ?? '—',
      label: 'Subs',
      growth: subscribersGrowth,
      subtext: '',
    },
    {
      key: 'views',
      className: 'dashboard-overview-stat--views',
      icon: <IconViews />,
      value: formatCount(youtube.viewCount ?? youtube.view_count) ?? '—',
      label: 'Views',
      growth: viewsGrowth,
      subtext: '',
    },
    {
      key: 'avg-views',
      className: 'dashboard-overview-stat--avg-views',
      icon: <IconChartUp />,
      value: avgViewsCount != null ? formatCount(avgViewsCount) : '—',
      label: 'Avg / video',
      growth: avgViewsGrowth,
      subtext: '',
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
    // Warm the dashboard widget cache as soon as the active channel is known.
    if (!insightsQuery.data) insightsQuery.refetch()
    if (!auditQuery.data) auditQuery.refetch()
    if (!growthQuery.data) growthQuery.refetch()
    if (!snapshotQuery.data) snapshotQuery.refetch()
    if (!bestTimeQuery.data) bestTimeQuery.refetch()
  }, [channelId])

  useEffect(() => {
    if (!channelId) return
    // Prefetch the default Optimize listing page so switching views feels instant.
    const perPage = 15
    queryClient.prefetchQuery({
      queryKey: queryKeys.youtube.videos({
        channelId,
        page: 1,
        perPage,
        search: '',
        sort: 'published_at',
        videoType: 'videos',
      }),
      queryFn: async () => {
        const token = await getAccessTokenOrNull()
        if (!token) return { items: [], total: 0, total_pages: 1, page: 1 }
        return youtubeApi.listVideos(token, {
          page: 1,
          per_page: perPage,
          search: undefined,
          sort: 'published_at',
          video_type: 'videos',
        })
      },
      staleTime: queryFreshness.short,
    })
  }, [channelId, queryClient])

  useEffect(() => {
    if (!ideaFeedbackNotice) return undefined
    const timeout = window.setTimeout(() => setIdeaFeedbackNotice(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [ideaFeedbackNotice])

  const handleRefreshDashboard = async (e) => {
    e?.stopPropagation?.()
    if (refreshing || !youtube?.connected) return
    const token = await getValidAccessToken()
    if (!token) return
    setRefreshing(true)
    try {
      const list = await youtubeApi.listChannels(token)
      setYoutubeChannels(list.channels || [])
      const activeId = list.active_channel_id || youtube?.channelId || list.channels?.[0]?.channel_id
      if (activeId) {
        const info = await youtubeApi.getChannelInfo(token, activeId)
        setYouTube(true, {
          channelId: info.channel_id,
          channel_title: info.channel_title,
          profile_image: info.profile_image,
          subscriberCount: info.subscriberCount ?? info.subscriber_count,
          viewCount: info.viewCount ?? info.view_count,
          videoCount: info.videoCount ?? info.video_count,
        })
      }
    } catch (_) {}
    // Widget queries will automatically re-run for the active channelId,
    // but we also explicitly refetch to avoid waiting for staleTime.
    userPreferencesQuery.refetch()
    userProfileQuery.refetch()
    insightsQuery.refetch()
    if (channelId) {
      auditQuery.refetch()
      growthQuery.refetch()
      snapshotQuery.refetch()
      bestTimeQuery.refetch()
    }
    setRefreshing(false)
  }

  const closeIdeaDismissDialog = () => {
    setIdeaDismissIdea(null)
    setIdeaDismissReason('not_relevant')
    setIdeaDismissDetails('')
    setIdeaDismissError('')
  }

  const submitIdeaFeedback = async ({ idea, interested, reason = null, details = null, successMessage }) => {
    const key = `${idea?.idea_title || idea?.title || ''}-${interested}`
    setIdeaFeedbackSending(key)
    try {
      await ideaFeedbackMutation.mutateAsync({ idea, interested, reason, details })
      setIdeaFeedbackNotice({
        tone: interested ? 'success' : 'info',
        text: successMessage,
      })
      return true
    } catch (error) {
      // Mutation already rolls back optimistic changes on error.
      const message = error?.message || 'Could not save your feedback.'
      if (interested) {
        setIdeaFeedbackNotice({ tone: 'error', text: message })
      } else {
        setIdeaDismissError(message)
      }
      return false
    } finally {
      setIdeaFeedbackSending(null)
    }
  }

  const handleIdeaFeedback = async (idea, interested) => {
    if (!interested) {
      setIdeaDismissIdea(idea)
      setIdeaDismissReason('not_relevant')
      setIdeaDismissDetails('')
      setIdeaDismissError('')
      return
    }

    await submitIdeaFeedback({
      idea,
      interested: true,
      successMessage: 'Saved. We will keep recommendations like this in mind.',
    })
  }

  const handleDismissSubmit = async (e) => {
    e.preventDefault()
    if (!ideaDismissIdea) return
    if (ideaDismissReason === 'other' && !ideaDismissDetails.trim()) {
      setIdeaDismissError('Add a short note so we know why this idea is not a fit.')
      return
    }

    const ok = await submitIdeaFeedback({
      idea: ideaDismissIdea,
      interested: false,
      reason: ideaDismissReason,
      details: ideaDismissDetails.trim() || null,
      successMessage: 'Removed. You will not see this recommendation again.',
    })

    if (ok) closeIdeaDismissDialog()
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
    if (!token) { setYoutubeLoading(false); return }
    try {
      await youtubeApi.disconnectChannel(token, channelId)
      setYouTube(false, {})
      setYoutubeChannels((prev) => prev.filter((c) => c.channel_id !== channelId))
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

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    const result = await changePassword(currentPassword, newPassword)
    if (result?.ok) {
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } else {
      setPasswordError(result?.error || authError || 'Failed to change password.')
    }
  }

  const handleDeleteData = async (e) => {
    e.preventDefault()
    setDeleteDataError('')
    setDeleteDataSuccess(false)
    if (!deleteDataConfirm) {
      setDeleteDataError('Please confirm that you understand this action.')
      return
    }
    const result = await deleteData()
    if (result?.ok) {
      clearLocalData()
      setDeleteDataSuccess(true)
      setDeleteDataConfirm(false)
    } else {
      setDeleteDataError(result?.error || 'Failed to delete data.')
    }
  }

  const handleDeleteAccount = async (e) => {
    e.preventDefault()
    setDeleteAccountError('')
    if (!deleteAccountPassword?.trim()) {
      setDeleteAccountError('Please enter your password to confirm.')
      return
    }
    if (!deleteAccountConfirm) {
      setDeleteAccountError('Please confirm that you understand this action cannot be undone.')
      return
    }
    const result = await deleteAccount(deleteAccountPassword.trim())
    if (result?.ok) {
      onLogout?.()
    } else {
      setDeleteAccountError(result?.error || 'Failed to delete account.')
    }
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-app-shell">
        <Sidebar
          user={user}
          onOpenSettings={openSettings}
          onLogout={handleLogout}
          currentScreen="dashboard"
        />
        <main className="dashboard-main-wrap">
          {/* Floating channel pill — top center */}
          <div
            className={`dashboard-channel-pill-wrap ${channelMenuOpen ? 'dashboard-channel-pill-wrap--open' : ''}`}
            ref={channelPillRef}
            style={{ left: pillLeft }}
          >
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
                  {(youtube.profile_image || youtube.avatar) ? (
                    <img src={youtube.profile_image || youtube.avatar} alt="" className="dashboard-channel-pill-avatar" />
                  ) : (
                    <span className="dashboard-channel-pill-avatar dashboard-channel-pill-avatar--fallback">
                      {(youtube.channel_title || youtube.channelName || 'Y')[0]}
                    </span>
                  )}
                  <span className="dashboard-channel-pill-name">{youtube.channel_title || youtube.channelName || 'My Channel'}</span>
                  <span className="dashboard-channel-pill-chevron" aria-hidden><IconChevronDown /></span>
                </button>
                <button
                  type="button"
                  className={`dashboard-channel-pill-refresh ${refreshing ? 'dashboard-channel-pill-refresh--spin' : ''}`}
                  onClick={handleRefreshDashboard}
                  disabled={refreshing}
                  aria-label="Refresh dashboard data"
                  title="Refresh"
                >
                  <IconRefresh />
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
                <span className="dashboard-channel-pill-icon" aria-hidden><IconPlus /></span>
                <span className="dashboard-channel-pill-label">Connect YouTube</span>
              </button>
            )}

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
                  <span className="dashboard-channel-pill-menu-icon"><IconPlus /></span>
                  Add another channel
                </button>
                {youtubeChannels?.length > 0 && (
                  <>
                    <div className="dashboard-channel-pill-menu-divider" />
                    <div className="dashboard-channel-pill-menu-channels">
                      {youtubeChannels.map((c) => {
                        const isActive = (c.channel_id || c.channelId) === (youtube?.channelId || youtube?.channel_id)
                        return (
                          <button
                            key={c.channel_id || c.channelId}
                            type="button"
                            className={`dashboard-channel-pill-menu-item ${isActive ? 'dashboard-channel-pill-menu-item--active' : ''}`}
                            role="menuitemradio"
                            aria-checked={isActive}
                            onClick={() => {
                              if (isActive) { setChannelMenuOpen(false); return }
                              handleSwitchChannel(c.channel_id || c.channelId)
                              setChannelMenuOpen(false)
                            }}
                            disabled={youtubeLoading}
                          >
                            {c.profile_image || c.avatar ? (
                              <img src={c.profile_image || c.avatar} alt="" className="dashboard-channel-pill-menu-avatar" />
                            ) : (
                              <span className="dashboard-channel-pill-menu-avatar dashboard-channel-pill-menu-avatar--fallback">
                                {(c.channel_title || c.channelName || '?')[0]}
                              </span>
                            )}
                            <span className="dashboard-channel-pill-menu-name">{c.channel_title || c.channelName || c.channel_id}</span>
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

          <div className="dashboard-main">
          {youtubeConnectionSuccess && (
            <div className="dashboard-message dashboard-message--success" role="status">
              <span className="dashboard-message-icon" aria-hidden>✓</span>
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
              <button type="button" className="dashboard-message-dismiss" onClick={() => setYoutubeOAuthError(null)} aria-label="Dismiss">×</button>
            </div>
          )}

          <SettingsModal
            open={settingsOpen}
            initialSection={settingsSection}
            onClose={() => setSettingsOpen(false)}
            user={user}
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

          {/* Welcome hero — when YouTube not connected */}
          {!youtube?.connected && (
            <section className="dashboard-welcome-hero">
              <div className="dashboard-welcome-content">
                <h2 className="dashboard-welcome-greeting">
                  {getGreetingText()},{' '}
                  <span className="dashboard-welcome-accent">{dashboardName}</span>
                </h2>
                <p className="dashboard-welcome-lead">
                  Connect your YouTube channel to unlock your full dashboard — insights, audit, growth tracking, and personalized recommendations.
                </p>
                <ul className="dashboard-welcome-benefits">
                  <li><strong>AI insights</strong> — Weekly video ideas tailored to your niche</li>
                  <li><strong>Channel audit</strong> — Scores, fixes, and personalized recommendations</li>
                  <li><strong>Growth analytics</strong> — Best time to post, views velocity, projections</li>
                  <li><strong>Quick actions</strong> — Scripts, thumbnails, AI coach, optimization</li>
                </ul>
                <button
                  type="button"
                  className="dashboard-welcome-cta"
                  onClick={handleConnectYouTube}
                  disabled={youtubeLoading}
                >
                  {youtubeLoading ? (
                    <>
                      <span className="dashboard-welcome-cta-spinner" aria-hidden />
                      Connecting…
                    </>
                  ) : (
                    <>
                      Connect YouTube
                      <span className="dashboard-welcome-cta-icon" aria-hidden><IconArrowRight /></span>
                    </>
                  )}
                </button>
              </div>
            </section>
          )}

          {ideaDismissIdea && (
            <div className="dashboard-idea-modal-backdrop" role="presentation" onClick={closeIdeaDismissDialog}>
              <div
                className="dashboard-idea-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dashboard-idea-dismiss-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="dashboard-idea-modal-head">
                  <div>
                    <h3 id="dashboard-idea-dismiss-title">Why is this recommendation not a fit?</h3>
                    <p>We will remove it and avoid showing it again.</p>
                  </div>
                  <button type="button" className="dashboard-idea-modal-close" aria-label="Close" onClick={closeIdeaDismissDialog}>
                    ×
                  </button>
                </div>
                <form className="dashboard-idea-modal-form" onSubmit={handleDismissSubmit}>
                  <div className="dashboard-idea-modal-options" role="radiogroup" aria-label="Reason">
                    {IDEA_FEEDBACK_REASONS.map((option) => (
                      <label key={option.value} className={`dashboard-idea-modal-option ${ideaDismissReason === option.value ? 'is-selected' : ''}`}>
                        <input
                          type="radio"
                          name="idea-dismiss-reason"
                          value={option.value}
                          checked={ideaDismissReason === option.value}
                          onChange={() => {
                            setIdeaDismissReason(option.value)
                            setIdeaDismissError('')
                          }}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <label className="dashboard-idea-modal-field">
                    <span>Extra note {ideaDismissReason === 'other' ? '(required)' : '(optional)'}</span>
                    <textarea
                      value={ideaDismissDetails}
                      onChange={(e) => {
                        setIdeaDismissDetails(e.target.value)
                        setIdeaDismissError('')
                      }}
                      placeholder="Tell us a bit more so recommendations improve."
                      rows={4}
                    />
                  </label>
                  {ideaDismissError && (
                    <div className="dashboard-idea-modal-error" role="alert">{ideaDismissError}</div>
                  )}
                  <div className="dashboard-idea-modal-actions">
                    <button type="button" className="dashboard-btn dashboard-btn-ghost" onClick={closeIdeaDismissDialog}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="dashboard-btn dashboard-script-idea-btn-no"
                      disabled={ideaFeedbackSending === `${ideaDismissIdea?.idea_title || ideaDismissIdea?.title || ''}-false`}
                    >
                      {ideaFeedbackSending === `${ideaDismissIdea?.idea_title || ideaDismissIdea?.title || ''}-false` ? 'Removing…' : 'Remove recommendation'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Channel Overview — only when a channel is connected */}
          {youtube?.connected && (
            <section className="dashboard-section dashboard-channel-overview">
              <div className="dashboard-overview-intro">
                <h2 className="dashboard-overview-greeting">
                  {getGreetingText()},{' '}
                  <span className="dashboard-overview-greeting-accent">{dashboardName}</span>
                </h2>
                <p className="dashboard-overview-subtext">
                  Your channel at a glance — {todayLabel}
                </p>
              </div>
              <div className="dashboard-overview-card">
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
                      <article key={card.key} className={`dashboard-overview-stat ${card.className}`}>
                        <div className="dashboard-overview-stat-head">
                          <span className="dashboard-overview-stat-icon" aria-hidden>{card.icon}</span>
                          {growthText != null ? (
                            <span className={`dashboard-overview-stat-growth ${growthClass}`}>{growthText}</span>
                          ) : (
                            <span className="dashboard-overview-stat-growth dashboard-overview-stat-growth--na" title="No period comparison yet">
                              —
                            </span>
                          )}
                        </div>
                        <span className="dashboard-overview-stat-value">{card.value}</span>
                        <div className="dashboard-overview-stat-meta">
                          <span className="dashboard-overview-stat-label">{card.label}</span>
                        </div>
                        {card.subtext ? (
                          <div className="dashboard-overview-stat-footer">
                            <p className="dashboard-overview-stat-subtext">
                              {card.subtext.split('\n').map((line, lineIndex) => (
                                <span key={lineIndex}>
                                  {line}
                                  {lineIndex === 0 ? <br /> : null}
                                </span>
                              ))}
                            </p>
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
                <div className="dashboard-milestones-wrap">
                  <div className="dashboard-milestones-head">
                    <h3 className="dashboard-milestones-heading">Milestones</h3>
                    <p className="dashboard-milestones-lead">
                      Audience growth and lifetime views — latest hit and next target for each.
                    </p>
                  </div>
                  <div className="dashboard-milestones-grid dashboard-milestones-grid--pair">
                    <DashboardMilestoneStrip
                      key={subsMilestoneFrom != null ? `ms-aud-${channelId}-${subsMilestoneFrom}` : `ms-aud-${channelId}`}
                      title="Audience"
                      steps={SUBS_STEPS}
                      current={subsCount}
                      animateFrom={subsMilestoneFrom}
                    />
                    <DashboardMilestoneStrip
                      key={viewsMilestoneFrom != null ? `ms-vw-${channelId}-${viewsMilestoneFrom}` : `ms-vw-${channelId}`}
                      title="Views"
                      steps={VIEWS_STEPS}
                      current={viewsCount}
                      animateFrom={viewsMilestoneFrom}
                    />
                  </div>
                </div>
                {!auditLoading && audit?.scores?.length > 0 && (
                  <div className="dashboard-audit-strip">
                    <div className="dashboard-audit-strip-top">
                      <span className="dashboard-audit-strip-label">Channel health</span>
                      <span className="dashboard-audit-strip-overall">
                        {audit.overall_score ?? 0}
                        <small>/100</small>
                      </span>
                    </div>
                    <div className="dashboard-audit-strip-grid">
                      {audit.scores.map((s, i) => {
                        const sc = Number(s.score ?? 0)
                        const tier = getAuditScoreTier(sc)
                        const nm = s.name ?? s.label ?? '—'
                        return (
                          <div key={`${nm}-${i}`} className="dashboard-audit-strip-cell">
                            <span className="dashboard-audit-strip-name">{nm}</span>
                            <div className="dashboard-audit-strip-bar-wrap" role="presentation">
                              <div
                                className={`dashboard-audit-strip-bar-fill dashboard-audit-strip-bar-fill--${tier}`}
                                style={{ width: `${Math.min(100, Math.max(0, sc))}%` }}
                              />
                            </div>
                            <span className="dashboard-audit-strip-num">{sc}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Scriptz AI — command center: fix channel, forecast, next video, feature tiles, pipeline */}
          <section className="dashboard-section dashboard-command-center" aria-label="Scriptz AI command center">
            <div className="dashboard-command-head">
              <div className="dashboard-command-head-row">
                <span className="dashboard-command-badge" aria-hidden><IconSpark /></span>
                <div className="dashboard-command-head-text">
                  <h2 className="dashboard-command-brand">Scriptz AI</h2>
                  <p className="dashboard-command-tagline">One next step. Then script, thumbnails, optimize.</p>
                </div>
              </div>
            </div>

            {!youtube?.connected && (
              <div className="dashboard-command-connect-prompt">
                <p className="dashboard-command-connect-title">Connect YouTube to unlock the full picture</p>
                <p className="dashboard-command-connect-desc">
                  Health scores, growth projections, and “fix my channel” actions use your real channel data.
                </p>
                <button type="button" className="dashboard-btn dashboard-btn-primary" onClick={() => openSettings('account')}>
                  Open settings &amp; connect YouTube
                </button>
              </div>
            )}

            {youtube?.connected && channelId && (
              <div className="dashboard-command-grid-top">
                <div className="dashboard-command-panel dashboard-command-panel--fix">
                  {auditLoading && (
                    <div className="dashboard-next-action-card dashboard-next-action-card--loading dashboard-next-action-card--panel">
                      <span className="dashboard-loading-spinner" aria-hidden />
                      <div>
                        <p className="dashboard-skeleton-title">Analyzing your channel…</p>
                        <p className="dashboard-muted">Scoring SEO, CTR, thumbnails, consistency, and retention.</p>
                      </div>
                    </div>
                  )}
                  {!auditLoading && nextBestAction && (
                    <div className="dashboard-next-action-card dashboard-next-action-card--panel">
                      <div className="dashboard-next-action-kicker">{nextBestAction.headline}</div>
                      <h2 className="dashboard-fix-channel-title">Fix my channel</h2>
                      <p className="dashboard-fix-channel-sub">{nextBestAction.title}</p>
                      <div className="dashboard-callout dashboard-callout--diagnosis">
                        <span className="dashboard-callout-label">Signal</span>
                        <p className="dashboard-callout-text">{nextBestAction.diagnosis}</p>
                      </div>
                      <div className="dashboard-callout dashboard-callout--action">
                        <span className="dashboard-callout-label">Move</span>
                        <p className="dashboard-callout-text">{nextBestAction.action}</p>
                      </div>
                      {nextBestAction.impact && (
                        <p className="dashboard-next-action-impact">{nextBestAction.impact}</p>
                      )}
                      <a
                        href={nextBestNavHash ? `#${nextBestNavHash}` : '#coach'}
                        className="dashboard-btn dashboard-btn-primary dashboard-next-action-cta"
                        onClick={(e) => {
                          e.preventDefault()
                          if (nextBestNavHash) window.location.hash = nextBestNavHash
                        }}
                      >
                        {nextBestAction.ctaLabel}
                        <span className="dashboard-next-action-cta-arrow" aria-hidden><IconArrowRight /></span>
                      </a>
                    </div>
                  )}
                  {!auditLoading && !nextBestAction && (
                    <div className="dashboard-next-action-card dashboard-next-action-card--panel dashboard-next-action-card--empty">
                      <p className="dashboard-muted">Audit data is loading or unavailable. Refresh the dashboard in a moment.</p>
                    </div>
                  )}
                </div>
                <div className="dashboard-command-panel dashboard-command-panel--forecast">
                  <div className="dashboard-forecast-kicker">Outcome forecast</div>
                  <p className="dashboard-forecast-sub">Trajectory &amp; views / day</p>
                  {growthLoading && (
                    <div className="dashboard-forecast-skeleton" aria-busy="true">
                      <span className="dashboard-skeleton-line" />
                      <span className="dashboard-skeleton-line dashboard-skeleton-line--short" />
                    </div>
                  )}
                  {!growthLoading && forecastMetrics && (
                    <div className="dashboard-forecast-metrics">
                      {forecastMetrics.projected != null && (
                        <div className="dashboard-forecast-hero">
                          <span className="dashboard-forecast-hero-label">~30d views</span>
                          <span className="dashboard-forecast-hero-num">{formatCount(forecastMetrics.projected)}</span>
                        </div>
                      )}
                      <div className="dashboard-forecast-bars">
                        <div className="dashboard-forecast-bar-row">
                          <span className="dashboard-forecast-bar-label">7d</span>
                          <div className="dashboard-forecast-bar-track">
                            <div
                              className="dashboard-forecast-bar-fill"
                              style={{ width: `${forecastMetrics.v7Pct}%` }}
                            />
                          </div>
                          <span className="dashboard-forecast-bar-val">
                            {forecastMetrics.v7 != null ? forecastMetrics.v7.toFixed(1) : '—'}
                            <span className="dashboard-forecast-bar-unit">/d</span>
                          </span>
                        </div>
                        <div className="dashboard-forecast-bar-row">
                          <span className="dashboard-forecast-bar-label">30d</span>
                          <div className="dashboard-forecast-bar-track">
                            <div
                              className="dashboard-forecast-bar-fill dashboard-forecast-bar-fill--muted"
                              style={{ width: `${forecastMetrics.v30Pct}%` }}
                            />
                          </div>
                          <span className="dashboard-forecast-bar-val">
                            {forecastMetrics.v30 != null ? forecastMetrics.v30.toFixed(1) : '—'}
                            <span className="dashboard-forecast-bar-unit">/d</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  {!growthLoading && growthScenario && (
                    <div className="dashboard-forecast-body dashboard-forecast-body--compact">
                      <p className="dashboard-growth-scenario-line">{growthScenario.baseline}</p>
                      <p className="dashboard-growth-scenario-line dashboard-growth-scenario-line--muted">{growthScenario.scenario}</p>
                    </div>
                  )}
                  {!growthLoading && !forecastMetrics && !growthScenario && (
                    <p className="dashboard-muted">Upload more to unlock projections.</p>
                  )}
                </div>
              </div>
            )}

            {insightsLoading && youtube?.connected && (
              <div className="dashboard-hero-next-video dashboard-hero-next-video--skeleton" aria-busy="true">
                <div className="dashboard-hero-next-video-kicker">Next best video</div>
                <div className="dashboard-skeleton-block dashboard-skeleton-block--lg" />
                <div className="dashboard-skeleton-block" />
                <div className="dashboard-skeleton-block dashboard-skeleton-block--sm" />
              </div>
            )}

            {!insightsLoading && nextBestVideo && (
              <article className="dashboard-hero-next-video">
                <header className="dashboard-hero-next-video-header">
                  <span className="dashboard-hero-next-video-kicker">Next best video</span>
                  <h3 className="dashboard-hero-next-video-title">{nextBestVideo.title}</h3>
                  <p className="dashboard-hero-next-video-deck">Top pick from your current ideas batch — script, thumbnails, or tweak the idea first.</p>
                </header>
                <div className="dashboard-hero-next-video-body">
                  {nextBestVideo.hook && (
                    <div className="dashboard-hero-next-video-card">
                      <span className="dashboard-hero-next-video-label">Hook</span>
                      <p className="dashboard-hero-next-video-card-text">{nextBestVideo.hook}</p>
                    </div>
                  )}
                  {nextBestVideo.angle && (
                    <div className="dashboard-hero-next-video-card">
                      <span className="dashboard-hero-next-video-label">Angle</span>
                      <p className="dashboard-hero-next-video-card-text">{nextBestVideo.angle}</p>
                    </div>
                  )}
                  {nextBestVideo.tags.length > 0 && (
                    <div className="dashboard-hero-next-video-card dashboard-hero-next-video-card--tags">
                      <span className="dashboard-hero-next-video-label">Tags</span>
                      <div className="dashboard-hero-next-video-tags">
                        {nextBestVideo.tags.map((t) => (
                          <span key={t} className="dashboard-hero-next-video-tag">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <footer className="dashboard-hero-next-video-footer">
                  <div className="dashboard-hero-next-video-actions">
                    <a
                      href={`#${hashWithPrefill('coach/scripts', scriptPrefill({ concept: nextBestVideo.title, pillar: 'Next video', score: null }))}`}
                      className="dashboard-btn dashboard-btn-primary"
                      onClick={(e) => {
                        e.preventDefault()
                        window.location.hash = hashWithPrefill(
                          'coach/scripts',
                          scriptPrefill({ concept: nextBestVideo.title, pillar: 'Next video', score: null }),
                        )
                      }}
                    >
                      Write script
                    </a>
                    <a
                      href={`#${hashWithPrefill(thumbnailBattleHref(nextBestVideo.title), thumbPrefill({ pillar: 'CTR / thumbnails', score: null, videoTitle: nextBestVideo.title }))}`}
                      className="dashboard-btn dashboard-btn-secondary"
                      onClick={(e) => {
                        e.preventDefault()
                        window.location.hash = hashWithPrefill(
                          thumbnailBattleHref(nextBestVideo.title),
                          thumbPrefill({ pillar: 'CTR / thumbnails', score: null, videoTitle: nextBestVideo.title }),
                        )
                      }}
                    >
                      Thumbnail battle
                    </a>
                  </div>
                  <p className="dashboard-hero-next-video-hint">Opens with this title prefilled — edit the prompt, then generate.</p>
                </footer>
              </article>
            )}

            {!insightsLoading && youtube?.connected && !nextBestVideo && (
              <div className="dashboard-hero-next-video dashboard-hero-next-video--empty">
                <p className="dashboard-hero-empty-title">No video idea in this batch yet</p>
                <p className="dashboard-muted">Regenerate ideas or check your connection — fresh ideas appear here as your top pick.</p>
                <button
                  type="button"
                  className="dashboard-btn dashboard-btn-primary"
                  onClick={() => insightsQuery.refetch()}
                  disabled={insightsQuery.isFetching}
                >
                  {insightsQuery.isFetching ? 'Loading…' : 'Refresh ideas'}
                </button>
              </div>
            )}

            {youtube?.connected && channelId && (
              <div className="dashboard-feature-tiles" aria-label="Dashboard features">
                <article className="dashboard-feature-tile dashboard-feature-tile--script">
                  <div className="dashboard-feature-tile-head">
                    <span className="dashboard-feature-tile-icon" aria-hidden><IconTileScript /></span>
                    <h4 className="dashboard-feature-tile-title">Script performance score</h4>
                  </div>
                  <p className="dashboard-feature-tile-lead">
                    Rough scores for pack, retention, and hook (0–100), based on your channel audit — before you publish.
                  </p>
                  {auditLoading && (
                    <div className="dashboard-tile-metrics dashboard-tile-metrics--skeleton">
                      <span className="dashboard-skeleton-pill" /><span className="dashboard-skeleton-pill" /><span className="dashboard-skeleton-pill" />
                    </div>
                  )}
                  {!auditLoading && scriptPerformanceEstimate && (
                    <>
                      <p className="dashboard-field-label">Score breakdown</p>
                      <div className="dashboard-tile-metrics">
                        <div className="dashboard-tile-metric">
                          <span className="dashboard-tile-metric-label">Pack</span>
                          <span className="dashboard-tile-metric-value">{scriptPerformanceEstimate.overall}</span>
                        </div>
                        <div className="dashboard-tile-metric">
                          <span className="dashboard-tile-metric-label">Retention</span>
                          <span className="dashboard-tile-metric-value">{scriptPerformanceEstimate.retention}</span>
                        </div>
                        <div className="dashboard-tile-metric">
                          <span className="dashboard-tile-metric-label">Hook</span>
                          <span className="dashboard-tile-metric-value">{scriptPerformanceEstimate.hookStrength}</span>
                        </div>
                      </div>
                      {scriptPerformanceEstimate.weakPoints?.length > 0 && (
                        <div className="dashboard-feature-tile-section">
                          <span className="dashboard-micro-label">Tighten first</span>
                          <ul className="dashboard-feature-tile-bullets">
                            {scriptPerformanceEstimate.weakPoints.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="dashboard-feature-tile-note">{scriptPerformanceEstimate.disclaimer}</p>
                    </>
                  )}
                  <a
                    href={`#${hashWithPrefill(
                      'coach/scripts',
                      scriptPrefill({
                        concept: nextBestVideo?.title || null,
                        pillar: 'Next video',
                        score: null,
                      }),
                    )}`}
                    className="dashboard-feature-tile-cta"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.hash = hashWithPrefill(
                        'coach/scripts',
                        scriptPrefill({
                          concept: nextBestVideo?.title || null,
                          pillar: 'Next video',
                          score: null,
                        }),
                      )
                    }}
                  >
                    Open Script Generator <IconArrowRight />
                  </a>
                </article>

                <article className="dashboard-feature-tile dashboard-feature-tile--thumb">
                  <div className="dashboard-feature-tile-head">
                    <span className="dashboard-feature-tile-icon" aria-hidden><IconTileGrid /></span>
                    <h4 className="dashboard-feature-tile-title">Thumbnail battle</h4>
                  </div>
                  <p className="dashboard-feature-tile-lead">
                    Generate several layouts, compare predicted CTR, and pick one winner before you upload.
                  </p>
                  <a
                    href={`#${hashWithPrefill(
                      thumbnailBattleHref(nextBestVideo?.title),
                      thumbPrefill({
                        pillar: 'CTR / thumbnails',
                        score: null,
                        videoTitle: nextBestVideo?.title || null,
                      }),
                    )}`}
                    className="dashboard-feature-tile-cta"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.hash = hashWithPrefill(
                        thumbnailBattleHref(nextBestVideo?.title),
                        thumbPrefill({
                          pillar: 'CTR / thumbnails',
                          score: null,
                          videoTitle: nextBestVideo?.title || null,
                        }),
                      )
                    }}
                  >
                    Run a thumbnail battle <IconArrowRight />
                  </a>
                </article>

                <article className="dashboard-feature-tile dashboard-feature-tile--publish">
                  <div className="dashboard-feature-tile-head">
                    <span className="dashboard-feature-tile-icon" aria-hidden><IconTileGauge /></span>
                    <h4 className="dashboard-feature-tile-title">Pre-publish video score</h4>
                  </div>
                  <p className="dashboard-feature-tile-lead">
                    Single readiness score for title, thumbnail, and pacing — before you hit publish.
                  </p>
                  {auditLoading && <div className="dashboard-tile-score-skeleton"><span className="dashboard-skeleton-ring" /></div>}
                  {!auditLoading && prePublishScore && (
                    <div className="dashboard-tile-score-block">
                      <p className="dashboard-field-label">Overall readiness</p>
                      <div className="dashboard-tile-score-main">
                        <span className="dashboard-tile-score-num">{prePublishScore.score}</span>
                        <span className="dashboard-tile-score-max">/100</span>
                      </div>
                      <span className={`dashboard-tile-tier-pill dashboard-tile-tier-pill--${prePublishScore.tier}`}>
                        {prePublishScore.tier === 'strong' ? 'Ship-ready' : prePublishScore.tier === 'mixed' ? 'Polish first' : 'Needs work'}
                      </span>
                      <p className="dashboard-tile-score-caption">{prePublishScore.label}</p>
                    </div>
                  )}
                  <a
                    href={`#${hashWithPrefill('optimize', optimizePrefill('titles & thumbnails', prePublishScore?.score ?? audit?.overall_score ?? null))}`}
                    className="dashboard-feature-tile-cta"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.hash = hashWithPrefill(
                        'optimize',
                        optimizePrefill('titles & thumbnails', prePublishScore?.score ?? audit?.overall_score ?? null),
                      )
                    }}
                  >
                    Refine in Optimize <IconArrowRight />
                  </a>
                </article>

                <article className="dashboard-feature-tile dashboard-feature-tile--bottleneck">
                  <div className="dashboard-feature-tile-head">
                    <span className="dashboard-feature-tile-icon" aria-hidden><IconTileTarget /></span>
                    <h4 className="dashboard-feature-tile-title">Growth bottleneck</h4>
                  </div>
                  <p className="dashboard-feature-tile-lead">
                    The one pillar dragging growth the most — fix this before tweaking everything else.
                  </p>
                  {auditLoading && <p className="dashboard-muted">Crunching scores…</p>}
                  {!auditLoading && growthBottleneck && (
                    <>
                      {growthBottleneck.pillar && (
                        <>
                          <p className="dashboard-field-label">Lowest pillar</p>
                          <span className="dashboard-bottleneck-pillar">{growthBottleneck.pillar}</span>
                        </>
                      )}
                      <p className="dashboard-feature-tile-desc">{growthBottleneck.reason}</p>
                    </>
                  )}
                  {nextBestAction && nextBestNavHash && (
                    <a
                      href={`#${nextBestNavHash}`}
                      className="dashboard-feature-tile-cta"
                      onClick={(e) => {
                        e.preventDefault()
                        window.location.hash = nextBestNavHash
                      }}
                    >
                      Fix this first <IconArrowRight />
                    </a>
                  )}
                </article>

                <article className="dashboard-feature-tile dashboard-feature-tile--strategy">
                  <div className="dashboard-feature-tile-head">
                    <span className="dashboard-feature-tile-icon" aria-hidden><IconTileLayers /></span>
                    <h4 className="dashboard-feature-tile-title">Content strategy</h4>
                  </div>
                  <p className="dashboard-feature-tile-lead">
                    Line up your next few uploads so viewers can binge a clear story arc.
                  </p>
                  {contentRoadmap.length > 0 ? (
                    <>
                      <p className="dashboard-field-label">Suggested order</p>
                      <ol className="dashboard-strategy-list">
                      {contentRoadmap.map((ep) => (
                        <li key={ep.episode}>
                          <span className="dashboard-strategy-ep">Ep {ep.episode}</span>
                          <span className="dashboard-strategy-title">{ep.title}</span>
                          <span className="dashboard-strategy-beat">{ep.beat}</span>
                        </li>
                      ))}
                    </ol>
                    </>
                  ) : (
                    <p className="dashboard-feature-tile-desc">Regenerate ideas above — we’ll map the top three into a mini series.</p>
                  )}
                  <a
                    href={`#${hashWithPrefill(
                      'coach/scripts',
                      scriptPrefill({
                        concept: contentRoadmap[0]?.title || null,
                        pillar: 'Series arc',
                        score: null,
                      }),
                    )}`}
                    className="dashboard-feature-tile-cta"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.hash = hashWithPrefill(
                        'coach/scripts',
                        scriptPrefill({
                          concept: contentRoadmap[0]?.title || null,
                          pillar: 'Series arc',
                          score: null,
                        }),
                      )
                    }}
                  >
                    Start the arc <IconArrowRight />
                  </a>
                </article>

                <article className="dashboard-feature-tile dashboard-feature-tile--style">
                  <div className="dashboard-feature-tile-head">
                    <span className="dashboard-feature-tile-icon" aria-hidden><IconTilePalette /></span>
                    <h4 className="dashboard-feature-tile-title">Style &amp; library</h4>
                  </div>
                  <p className="dashboard-feature-tile-lead">
                    Keep voice and look consistent in Coach; polish titles and thumbnails for videos already live in Optimize.
                  </p>
                  <div className="dashboard-feature-tile-split">
                    <a
                      href={`#${hashWithPrefill(
                        'coach?topic=voice%20and%20style',
                        coachPrefill('Voice & style', null, 'Keep scripts and thumbnails feeling like the same channel.'),
                      )}`}
                      className="dashboard-feature-tile-cta"
                      onClick={(e) => {
                        e.preventDefault()
                        window.location.hash = hashWithPrefill(
                          'coach?topic=voice%20and%20style',
                          coachPrefill('Voice & style', null, 'Keep scripts and thumbnails feeling like the same channel.'),
                        )
                      }}
                    >
                      Voice &amp; tone <IconArrowRight />
                    </a>
                    <a
                      href={`#${hashWithPrefill('optimize', optimizePrefill('published videos', null))}`}
                      className="dashboard-feature-tile-cta"
                      onClick={(e) => {
                        e.preventDefault()
                        window.location.hash = hashWithPrefill('optimize', optimizePrefill('published videos', null))
                      }}
                    >
                      Published videos <IconArrowRight />
                    </a>
                  </div>
                </article>
              </div>
            )}
          </section>

          {/* Quick Actions — always visible */}
          <section className="dashboard-section dashboard-quick-actions">
            <h2 className="dashboard-section-title">
              <span className="dashboard-section-icon" aria-hidden />
              {youtube?.connected ? 'Quick actions' : 'Get started'}
            </h2>
            <p className="dashboard-section-subtitle">{youtube?.connected ? 'Jump to a tool — context loads for you.' : 'Core tools, one tap each.'}</p>
            <div className="dashboard-quick-actions-grid">
              <a
                href={`#${hashWithPrefill('coach/scripts', scriptPrefill({ concept: null, pillar: 'Next video', score: null }))}`}
                className="dashboard-quick-action-card"
                onClick={(e) => {
                  e.preventDefault()
                  window.location.hash = hashWithPrefill(
                    'coach/scripts',
                    scriptPrefill({ concept: null, pillar: 'Next video', score: null }),
                  )
                }}
              >
                <span className="dashboard-quick-action-icon dashboard-quick-action-icon--script" aria-hidden><IconScript /></span>
                <span className="dashboard-quick-action-label">Script Generator</span>
                <span className="dashboard-quick-action-desc">Hook-first scripts</span>
                <span className="dashboard-quick-action-arrow" aria-hidden><IconArrowRight /></span>
              </a>
              <a
                href={`#${hashWithPrefill('coach/thumbnails', thumbPrefill({ pillar: 'CTR', score: null, videoTitle: null }))}`}
                className="dashboard-quick-action-card"
                onClick={(e) => {
                  e.preventDefault()
                  window.location.hash = hashWithPrefill(
                    'coach/thumbnails',
                    thumbPrefill({ pillar: 'CTR', score: null, videoTitle: null }),
                  )
                }}
              >
                <span className="dashboard-quick-action-icon dashboard-quick-action-icon--thumbnail" aria-hidden><IconThumbnail /></span>
                <span className="dashboard-quick-action-label">Thumbnail Generator</span>
                <span className="dashboard-quick-action-desc">Click-ready frames</span>
                <span className="dashboard-quick-action-arrow" aria-hidden><IconArrowRight /></span>
              </a>
              <a
                href={`#${hashWithPrefill('coach', coachPrefill('Channel', null, 'Top 3 priorities for my channel this week.'))}`}
                className="dashboard-quick-action-card"
                onClick={(e) => {
                  e.preventDefault()
                  window.location.hash = hashWithPrefill(
                    'coach',
                    coachPrefill('Channel', null, 'Top 3 priorities for my channel this week.'),
                  )
                }}
              >
                <span className="dashboard-quick-action-icon dashboard-quick-action-icon--coach" aria-hidden><IconMessage /></span>
                <span className="dashboard-quick-action-label">AI Coach</span>
                <span className="dashboard-quick-action-desc">Strategy on tap</span>
                <span className="dashboard-quick-action-arrow" aria-hidden><IconArrowRight /></span>
              </a>
              <a
                href={`#${hashWithPrefill('optimize', optimizePrefill('library', null))}`}
                className="dashboard-quick-action-card"
                onClick={(e) => {
                  e.preventDefault()
                  window.location.hash = hashWithPrefill('optimize', optimizePrefill('library', null))
                }}
              >
                <span className="dashboard-quick-action-icon dashboard-quick-action-icon--optimize" aria-hidden><IconOptimize /></span>
                <span className="dashboard-quick-action-label">Optimize</span>
                <span className="dashboard-quick-action-desc">Refresh old uploads</span>
                <span className="dashboard-quick-action-arrow" aria-hidden><IconArrowRight /></span>
              </a>
            </div>
          </section>

          {/* AI Insights — script ideas */}
          <section id="dashboard-video-ideas" className="dashboard-section dashboard-insights-section">
            <div className="dashboard-panel dashboard-panel--ideas">
            <div className="dashboard-script-ideas-header">
              <div className="dashboard-script-ideas-header-text">
                <h2 className="dashboard-section-title">
                  <span className="dashboard-section-icon" aria-hidden />
                  {nextBestVideo ? 'More video ideas' : 'AI video ideas'}
                </h2>
                <p className="dashboard-section-subtitle">
                  {nextBestVideo ? 'More angles — script, thumbnail, or feedback.' : 'Pick an idea → script or thumbnail.'}
                </p>
              </div>
              <button
                type="button"
                className="dashboard-script-ideas-regenerate"
                onClick={() => insightsQuery.refetch()}
                disabled={insightsLoading}
                title="Regenerate ideas"
              >
                <IconRefresh />
                {insightsLoading ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
            {insightsLoading && (
              <div className="dashboard-script-ideas-loading">
                <span className="dashboard-loading-spinner" />
                <span>Generating ideas…</span>
              </div>
            )}
            {insightsError && (
              <div className="dashboard-script-ideas-error">
                <p>{insightsError}</p>
                <button
                  type="button"
                  className="dashboard-btn dashboard-btn-primary"
                  onClick={() => insightsQuery.refetch()}
                  disabled={insightsQuery.isFetching}
                >
                  Try again
                </button>
              </div>
            )}
            {!insightsLoading && !insightsError && insights && (nextBestVideo ? moreScriptIdeas : visibleScriptIdeas).length > 0 && (
              <>
                {ideaFeedbackNotice && (
                  <div className={`dashboard-inline-notice dashboard-inline-notice--${ideaFeedbackNotice.tone}`} role="status">
                    {ideaFeedbackNotice.text}
                  </div>
                )}
                <div className="dashboard-script-ideas-grid">
                  {(nextBestVideo ? moreScriptIdeas : visibleScriptIdeas).map((idea, i) => {
                    const title = idea?.idea_title ?? idea?.title ?? 'Idea'
                    const script = idea?.short_script ?? idea?.script ?? idea?.description
                    const key = `${title}-${i}`
                    const sending = ideaFeedbackSending === `${title}-true` || ideaFeedbackSending === `${title}-false`
                    const tags = [
                      idea?.hook_concept,
                      idea?.angle,
                      idea?.target_emotion,
                      idea?.expected_audience,
                    ].filter(Boolean)
                    const num = i + 1 + (nextBestVideo ? 1 : 0)
                    return (
                      <article key={key} className="dashboard-script-idea-card">
                        <div className="dashboard-script-idea-card-top">
                          <span className="dashboard-script-idea-num">{num}</span>
                          <div className="dashboard-script-idea-card-intro">
                            <h3 className="dashboard-script-idea-card-title">{title}</h3>
                            {script && <p className="dashboard-script-idea-card-desc">{script}</p>}
                          </div>
                        </div>
                        {tags.length > 0 && (
                          <div className="dashboard-script-idea-card-tags-wrap">
                            <span className="dashboard-script-idea-card-tags-label">Signals</span>
                            <div className="dashboard-script-idea-card-tags">
                              {tags.map((tag) => (
                                <span key={tag} className="dashboard-script-idea-card-tag">{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="dashboard-script-idea-card-actions">
                          <div className="dashboard-script-idea-card-ctas">
                            <a
                              href={`#${hashWithPrefill('coach/scripts', scriptPrefill({ concept: title, pillar: 'Next video', score: null }))}`}
                              className="dashboard-script-idea-card-btn dashboard-script-idea-card-btn--primary"
                              onClick={(e) => {
                                e.preventDefault()
                                window.location.hash = hashWithPrefill(
                                  'coach/scripts',
                                  scriptPrefill({ concept: title, pillar: 'Next video', score: null }),
                                )
                              }}
                            >
                              Write script
                            </a>
                            <a
                              href={`#${hashWithPrefill(
                                thumbnailBattleHref(title),
                                thumbPrefill({ pillar: 'CTR / thumbnails', score: null, videoTitle: title }),
                              )}`}
                              className="dashboard-script-idea-card-btn dashboard-script-idea-card-btn--secondary"
                              onClick={(e) => {
                                e.preventDefault()
                                window.location.hash = hashWithPrefill(
                                  thumbnailBattleHref(title),
                                  thumbPrefill({ pillar: 'CTR / thumbnails', score: null, videoTitle: title }),
                                )
                              }}
                            >
                              Thumbnail
                            </a>
                          </div>
                          <div className="dashboard-script-idea-card-feedback" aria-label="Feedback">
                            <button type="button" className="dashboard-script-idea-card-save" title="Like this idea" disabled={sending} onClick={() => handleIdeaFeedback(idea, true)}>
                              {sending ? '…' : '✓'}
                            </button>
                            <button type="button" className="dashboard-script-idea-card-pass" disabled={sending} onClick={() => handleIdeaFeedback(idea, false)}>
                              Pass
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </>
            )}
            {!insightsLoading && !insightsError && insights && nextBestVideo && moreScriptIdeas.length === 0 && visibleScriptIdeas.length > 0 && (
              <p className="dashboard-ideas-single-note">No other ideas in this batch — regenerate for more options.</p>
            )}
            {!insightsLoading && !insightsError && insights && visibleScriptIdeas.length === 0 && (
              <div className="dashboard-script-ideas-empty">
                <p>No ideas yet. Click Regenerate or connect YouTube for personalized suggestions.</p>
                <a href="#coach/scripts" className="dashboard-script-ideas-empty-link" onClick={(e) => { e.preventDefault(); window.location.hash = 'coach/scripts' }}>
                  Script Generator <IconArrowRight />
                </a>
              </div>
            )}
            </div>
          </section>

          {/* Channel Audit (channel required) */}
          {channelId && (
            <section className="dashboard-section dashboard-section--open" aria-labelledby="dashboard-audit-heading">
              <h2 id="dashboard-audit-heading" className="dashboard-open-section-title">
                <span className="dashboard-section-icon" aria-hidden />
                Channel health &amp; audit
              </h2>
              <div className="dashboard-details-body">
              <p className="dashboard-section-subtitle dashboard-details-intro">
                Each score includes what it means and what to do next — then open the right tool in one click.
              </p>
              {auditLoading && <div className="dashboard-loading"><span className="dashboard-loading-spinner" /> Loading audit…</div>}
              {!auditLoading && audit && (
                <div className="dashboard-ai-card dashboard-audit-card">
                  <div className="dashboard-audit-hero">
                    <div className="dashboard-audit-hero-main">
                      <span className="dashboard-audit-overall-kicker">Channel audit</span>
                      <span className="dashboard-audit-overall-label">Overall score</span>
                      <div className="dashboard-audit-overall-row">
                        <span className="dashboard-audit-overall-value">{audit.overall_score ?? 0}<span className="dashboard-audit-overall-max">/100</span></span>
                        <span className={`dashboard-audit-overall-badge dashboard-audit-overall-badge--${getAuditScoreTier(audit.overall_score ?? 0)}`}>
                          {getAuditScoreTier(audit.overall_score ?? 0) === 'high' ? 'Strong' : getAuditScoreTier(audit.overall_score ?? 0) === 'mid' ? 'Room to grow' : 'Needs focus'}
                        </span>
                      </div>
                      <p className="dashboard-audit-hero-hint">Weighted across SEO, CTR, consistency, thumbnails, and retention.</p>
                    </div>
                    <div className="dashboard-audit-overall-bar" role="progressbar" aria-valuenow={audit.overall_score ?? 0} aria-valuemin={0} aria-valuemax={100}>
                      <div
                        className={`dashboard-audit-overall-bar-fill dashboard-audit-overall-bar-fill--${getAuditScoreTier(audit.overall_score ?? 0)}`}
                        style={{ width: `${Math.min(100, Math.max(0, audit.overall_score ?? 0))}%` }}
                      />
                    </div>
                  </div>
                  {Array.isArray(audit.scores) && audit.scores.length > 0 && (
                    <div className="dashboard-audit-scores-head">
                      <div className="dashboard-audit-scores-head-text">
                        <span className="dashboard-audit-scores-title">Breakdown</span>
                        <span className="dashboard-audit-scores-hint">Each area — score, what it means, next step, then open the right tool.</span>
                      </div>
                    </div>
                  )}
                  {Array.isArray(audit.scores) && audit.scores.length > 0 && (
                    <div className="dashboard-audit-scores">
                      {audit.scores.map((s, i) => {
                        const score = Number(s.score ?? 0)
                        const pct = Math.min(100, Math.max(0, score))
                        const tier = getAuditScoreTier(score)
                        const fullLabel = s.label ? String(s.label) : null
                        const nm = String(s.name ?? s.label ?? '')
                        const guidance = getAuditAreaGuidance(nm, score, fullLabel)
                        const areaAct = guidance.href
                          ? { label: 'Do this now', hash: guidance.href }
                          : getAreaAction(nm)
                        const areaNavHash = hashWithPrefill(areaAct.hash, getAreaPrefill(nm, score))
                        return (
                          <div key={i} className={`dashboard-audit-score-item dashboard-audit-score-item--${tier}`}>
                            <div className="dashboard-audit-score-head">
                              <div className="dashboard-audit-score-name-wrap">
                                <span className="dashboard-audit-score-name">{s.name ?? s.label}</span>
                                {fullLabel && <span className="dashboard-audit-score-sub">{fullLabel}</span>}
                              </div>
                              <span className={`dashboard-audit-score-value dashboard-audit-score-value--${tier}`}>{score}</span>
                            </div>
                            <div className="dashboard-audit-score-bar" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
                              <div className={`dashboard-audit-score-bar-fill dashboard-audit-score-bar-fill--${tier}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className={`dashboard-audit-guidance dashboard-audit-guidance--${guidance.tone}`}>
                              <div className="dashboard-audit-guidance-block">
                                <span className="dashboard-audit-guidance-kicker">What it means</span>
                                <p className="dashboard-audit-guidance-diagnosis">{guidance.diagnosis}</p>
                              </div>
                              <div className="dashboard-audit-guidance-block">
                                <span className="dashboard-audit-guidance-kicker">What to do next</span>
                                <p className="dashboard-audit-guidance-action">{guidance.action}</p>
                              </div>
                              <a
                                href={`#${areaNavHash}`}
                                className="dashboard-audit-guidance-cta"
                                onClick={(e) => {
                                  e.preventDefault()
                                  window.location.hash = areaNavHash
                                }}
                              >
                                {areaAct.label}
                                <IconArrowRight />
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {audit && (
                <div className="dashboard-section dashboard-ai-summary-section">
                  <div className="dashboard-panel dashboard-panel--recommendations">
                  <div className="dashboard-reco-intro">
                    <h3 className="dashboard-reco-title">
                      <span className="dashboard-section-icon" aria-hidden />
                      Recommendations
                    </h3>
                    <p className="dashboard-reco-subtitle">Prioritized fixes from your audit — one tap opens the right tool with context.</p>
                  </div>
                  {auditAdviceItems.length > 0 && (
                    <div className="dashboard-audit-advice-list">
                      {auditAdviceItems.map((item, i) => (
                        <div
                          key={i}
                          className={`dashboard-audit-advice-card dashboard-audit-advice-card--${item.priority === 'high' ? 'high' : item.priority === 'medium' ? 'medium' : 'default'}`}
                        >
                          <div className="dashboard-audit-advice-card-head">
                            {item.area && (
                              <span className="dashboard-audit-advice-area">{item.area}</span>
                            )}
                            {item.priority && (
                              <span className={`dashboard-audit-advice-priority dashboard-audit-advice-priority--${item.priority}`}>
                                {item.priority === 'high' ? 'High' : item.priority === 'medium' ? 'Medium' : item.priority}
                              </span>
                            )}
                          </div>
                          <ul className="dashboard-audit-advice-lines">
                            {item.lines.map((line, j) => {
                              const act = fixLineToAction(line, item.area)
                              const lineHash = hashWithPrefill(act.hash, act.prefill)
                              return (
                                <li key={j} className="dashboard-audit-advice-line">
                                  <span className="dashboard-audit-advice-line-text">{line}</span>
                                  <a
                                    href={`#${lineHash}`}
                                    className="dashboard-audit-advice-line-cta"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      window.location.hash = lineHash
                                    }}
                                  >
                                    {act.label}
                                  </a>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="dashboard-ai-summary-card">
                    <div className="dashboard-ai-summary-main">
                      <div className="dashboard-ai-summary-score-wrap">
                        <div className="dashboard-ai-summary-score" aria-label={`Channel score ${audit.overall_score ?? 0} out of 100`}>
                          <span className="dashboard-ai-summary-score-value">{audit.overall_score ?? 0}</span>
                          <span className="dashboard-ai-summary-score-max">/100</span>
                        </div>
                        <span className="dashboard-ai-summary-score-label">Channel health</span>
                      </div>
                      <div className="dashboard-ai-summary-content">
                        {auditAdviceItems.length > 0 ? (
                          <>
                            <h4 className="dashboard-ai-summary-heading">Top priority</h4>
                            <p className="dashboard-ai-summary-fix">
                              {getFirstAdviceLine(audit.actionable_fixes) ?? 'Focus on your lowest-scoring areas above.'}
                            </p>
                            <a
                              href={`#${topPriorityNavHash}`}
                              className="dashboard-ai-summary-cta"
                              onClick={(e) => {
                                e.preventDefault()
                                window.location.hash = topPriorityNavHash
                              }}
                            >
                              Open next step <span className="dashboard-ai-summary-cta-arrow"><IconArrowRight /></span>
                            </a>
                          </>
                        ) : (
                          <>
                            <h4 className="dashboard-ai-summary-heading">You&apos;re on track</h4>
                            <p className="dashboard-ai-summary-fix">Keep cadence. Draft your next idea in Script Generator.</p>
                            <a
                              href={`#${hashWithPrefill('coach/scripts', scriptPrefill({ concept: null, pillar: 'Next video', score: null }))}`}
                              className="dashboard-ai-summary-cta"
                              onClick={(e) => {
                                e.preventDefault()
                                window.location.hash = hashWithPrefill(
                                  'coach/scripts',
                                  scriptPrefill({ concept: null, pillar: 'Next video', score: null }),
                                )
                              }}
                            >
                              Generate script <span className="dashboard-ai-summary-cta-arrow"><IconArrowRight /></span>
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    {Array.isArray(audit.scores) && audit.scores.length > 0 && (
                      <div className="dashboard-ai-summary-mini-scores">
                        {audit.scores.slice(0, 4).map((s, i) => {
                          const score = Number(s.score ?? 0)
                          const tier = getAuditScoreTier(score)
                          return (
                            <div key={i} className={`dashboard-ai-summary-mini-item dashboard-ai-summary-mini-item--${tier}`} title={`${s.name ?? s.label}: ${score}`}>
                              <span className="dashboard-ai-summary-mini-label">{s.name ?? s.label}</span>
                              <span className="dashboard-ai-summary-mini-value">{score}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              )}
              </div>
            </section>
          )}

          {/* Performance: KPI + growth + best time (single block) */}
          {channelId && (
            <section className="dashboard-section dashboard-section--open dashboard-performance-section" aria-labelledby="dashboard-performance-heading">
              <h2 id="dashboard-performance-heading" className="dashboard-open-section-title">
                <span className="dashboard-section-icon" aria-hidden />
                Performance &amp; posting
              </h2>
              <div className="dashboard-details-body">
              <div className="dashboard-performance-intro">
                <p className="dashboard-section-subtitle dashboard-details-intro dashboard-performance-intro-text">
                  30-day KPIs, growth pace, and when you tend to post — tap a card for the next step.
                </p>
              </div>
              <div className="dashboard-panel dashboard-panel--performance">
                <div className="dashboard-performance-zone dashboard-performance-zone--snapshot dashboard-performance-zone--i0">
                  <div className="dashboard-performance-block">
                    <div className="dashboard-performance-block-head">
                      <div className="dashboard-performance-block-head-text">
                        <h3 className="dashboard-performance-block-title">KPI snapshot</h3>
                        <span className="dashboard-performance-block-desc">Rolling 30 days vs the period before.</span>
                      </div>
                      <span className="dashboard-performance-block-meta">30d</span>
                    </div>
                  {snapshotLoading && (
                    <div className="dashboard-perf-skeleton-grid" aria-busy aria-label="Loading KPI snapshot">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="dashboard-perf-skeleton-card" style={{ animationDelay: `${i * 0.06}s` }} />
                      ))}
                    </div>
                  )}
                  {!snapshotLoading && performanceSnapshotHasKpis && (
                    <div className="dashboard-snapshot-grid">
                      {snapshot.current_period?.views != null && (() => {
                        const insight = getSnapshotStatInsight('views', snapshot)
                        return (
                          <div className="dashboard-stat-card dashboard-snapshot-item dashboard-perf-card">
                            <div className="dashboard-snapshot-label">Views</div>
                            <div className="dashboard-snapshot-value">{formatCount(snapshot.current_period.views)}</div>
                            {snapshot.previous_period?.views != null && (
                              <div className={`dashboard-snapshot-delta ${(snapshot.current_period.views - snapshot.previous_period.views) >= 0 ? 'positive' : 'negative'}`}>
                                {(snapshot.current_period.views - snapshot.previous_period.views) >= 0 ? '↑' : '↓'} vs previous period
                              </div>
                            )}
                            {insight && <PerformanceStatInsight insight={insight} />}
                          </div>
                        )
                      })()}
                      {snapshot.current_period?.watch_time_hours != null && (() => {
                        const insight = getSnapshotStatInsight('watch_time_hours', snapshot)
                        return (
                          <div className="dashboard-stat-card dashboard-snapshot-item dashboard-perf-card">
                            <div className="dashboard-snapshot-label">Watch time</div>
                            <div className="dashboard-snapshot-value">{Number(snapshot.current_period.watch_time_hours).toFixed(1)}<span className="dashboard-snapshot-unit">h</span></div>
                            {insight && <PerformanceStatInsight insight={insight} />}
                          </div>
                        )
                      })()}
                      {snapshot.current_period?.video_count != null && (() => {
                        const insight = getSnapshotStatInsight('video_count', snapshot)
                        return (
                          <div className="dashboard-stat-card dashboard-snapshot-item dashboard-perf-card">
                            <div className="dashboard-snapshot-label">30d uploads</div>
                            <div className="dashboard-snapshot-value">{snapshot.current_period.video_count}</div>
                            {insight && <PerformanceStatInsight insight={insight} />}
                          </div>
                        )
                      })()}
                      {snapshot.current_period?.views_per_video != null && (() => {
                        const insight = getSnapshotStatInsight('views_per_video', snapshot)
                        return (
                          <div className="dashboard-stat-card dashboard-snapshot-item dashboard-perf-card">
                            <div className="dashboard-snapshot-label">Views / video</div>
                            <div className="dashboard-snapshot-value">{Number(snapshot.current_period.views_per_video).toFixed(0)}</div>
                            {insight && <PerformanceStatInsight insight={insight} />}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                  {!snapshotLoading && !performanceSnapshotHasKpis && (
                    <div className="dashboard-perf-zone-empty">
                      <p>No KPI data for this window</p>
                      <p className="dashboard-perf-zone-empty-hint">Check back after uploads, or refresh your channel link.</p>
                    </div>
                  )}
                </div>
                </div>

                <div className="dashboard-performance-divider" aria-hidden />

                <div className="dashboard-performance-zone dashboard-performance-zone--growth dashboard-performance-zone--i1">
                  <div className="dashboard-performance-block">
                    <div className="dashboard-performance-block-head">
                      <div className="dashboard-performance-block-head-text">
                        <h3 className="dashboard-performance-block-title">Growth</h3>
                        <span className="dashboard-performance-block-desc">Subs, daily views, and a simple 30-day view projection.</span>
                      </div>
                    </div>
                    {growthLoading && (
                      <div className="dashboard-perf-skeleton-grid" aria-busy aria-label="Loading growth">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="dashboard-perf-skeleton-card" style={{ animationDelay: `${i * 0.06}s` }} />
                        ))}
                      </div>
                    )}
                    {!growthLoading && performanceGrowthHasKpis && growth && (
                    <>
                      <div className="dashboard-growth-stats">
                        {growth.subs_current != null && (() => {
                          const insight = getGrowthStatInsight('subs', growth)
                          return (
                            <div className="dashboard-stat-card dashboard-growth-stat dashboard-perf-card">
                              <div className="dashboard-growth-stat-label">Subscribers</div>
                              <div className="dashboard-growth-stat-value">{formatCount(growth.subs_current)}</div>
                              {insight && <PerformanceStatInsight insight={insight} compact />}
                            </div>
                          )
                        })()}
                        {growth.views_velocity_7d != null && (() => {
                          const insight = getGrowthStatInsight('v7', growth)
                          return (
                            <div className="dashboard-stat-card dashboard-growth-stat dashboard-perf-card">
                              <div className="dashboard-growth-stat-label">Views / day (7d)</div>
                              <div className="dashboard-growth-stat-value">{Number(growth.views_velocity_7d).toFixed(1)}</div>
                              {insight && <PerformanceStatInsight insight={insight} compact />}
                            </div>
                          )
                        })()}
                        {growth.views_velocity_30d != null && (() => {
                          const insight = getGrowthStatInsight('v30', growth)
                          return (
                            <div className="dashboard-stat-card dashboard-growth-stat dashboard-perf-card">
                              <div className="dashboard-growth-stat-label">Views / day (30d)</div>
                              <div className="dashboard-growth-stat-value">{Number(growth.views_velocity_30d).toFixed(1)}</div>
                              {insight && <PerformanceStatInsight insight={insight} compact />}
                            </div>
                          )
                        })()}
                        {growth.projected_views_30d != null && (() => {
                          const insight = getGrowthStatInsight('proj', growth)
                          return (
                            <div className="dashboard-stat-card dashboard-growth-stat dashboard-perf-card">
                              <div className="dashboard-growth-stat-label">Projected views (30d)</div>
                              <div className="dashboard-growth-stat-value">{formatCount(Math.round(growth.projected_views_30d))}</div>
                              {insight && <PerformanceStatInsight insight={insight} compact />}
                            </div>
                          )
                        })()}
                      </div>
                      {growth.message && <p className="dashboard-metric-blurb dashboard-growth-outlook">{growth.message}</p>}
                    </>
                    )}
                    {!growthLoading && !performanceGrowthHasKpis && (
                      <div className="dashboard-perf-zone-empty">
                        <p>Growth metrics unavailable</p>
                        <p className="dashboard-perf-zone-empty-hint">Connect YouTube and upload a video to see velocity and projections.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="dashboard-performance-divider" aria-hidden />

                <div className="dashboard-performance-zone dashboard-performance-zone--schedule dashboard-performance-zone--i2">
                  <div className="dashboard-performance-block dashboard-performance-block--best-time">
                    <div className="dashboard-performance-block-head">
                      <div className="dashboard-performance-block-head-text">
                        <h3 className="dashboard-performance-block-title">Best time to post</h3>
                        <span className="dashboard-performance-block-desc">Learned from your uploads — sharper with more data.</span>
                      </div>
                    </div>
                    {bestTimeLoading && (
                      <div className="dashboard-perf-skeleton-line" aria-busy aria-label="Loading schedule" />
                    )}
                    {!bestTimeLoading && bestTime && (
                    <>
                      {(bestTime.summary || (Array.isArray(bestTime.recommended_slots) && bestTime.recommended_slots.length > 0)) && (
                        <div className="dashboard-best-time-hero">
                          {bestTime.summary && <p className="dashboard-best-time-summary">{bestTime.summary}</p>}
                          {Array.isArray(bestTime.recommended_slots) && bestTime.recommended_slots.length > 0 && (
                            <div className="dashboard-best-time-slots">
                              {bestTime.recommended_slots.slice(0, 5).map((slot, i) => (
                                <span key={i} className="dashboard-best-time-slot">{slot.label ?? `${slot.day} ${slot.hour}:00`}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {Array.isArray(bestTime.bar_chart_data) && bestTime.bar_chart_data.length > 0 && bestTimeUploadTotal >= 3 && (
                        <div className="dashboard-best-time-chart-wrap">
                          <div className="dashboard-best-time-chart-head">
                            <span className="dashboard-best-time-chart-title">By hour</span>
                            <span className="dashboard-best-time-chart-axis">Local time</span>
                          </div>
                          <div className="dashboard-best-time-chart" role="img" aria-label="Best upload time by hour">
                            {bestTime.bar_chart_data.map((bar, i) => (
                              <button
                                key={i}
                                type="button"
                                className={`dashboard-best-time-bar ${bar.is_recommended ? 'recommended' : ''}`}
                                style={{ height: `${Math.max(8, bar.height_pct || 0)}%` }}
                                aria-label={`${bar.time_label}: ${bar.tooltip?.subtitle ?? ''}`}
                              >
                                <span className="dashboard-best-time-tooltip">
                                  <span className="dashboard-best-time-tooltip-title">{bar.tooltip?.title ?? bar.time_label}</span>
                                  {bar.tooltip?.subtitle && (
                                    <span className="dashboard-best-time-tooltip-line">{bar.tooltip.subtitle}</span>
                                  )}
                                  {bar.tooltip != null && Number(bar.tooltip.uploads) > 0 && (
                                    <span className="dashboard-best-time-tooltip-meta">
                                      Avg {Number(bar.tooltip.average_views ?? 0).toFixed(0)} views · Score {Number(bar.tooltip.score ?? 0).toFixed(0)}
                                    </span>
                                  )}
                                </span>
                                <span className="dashboard-best-time-bar-label">{bar.short_label ?? bar.time_label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {Array.isArray(bestTime.bar_chart_data) && bestTime.bar_chart_data.length > 0 && bestTimeUploadTotal === 0 && (
                        <div className="dashboard-empty dashboard-empty--tight dashboard-empty--performance-muted">
                          Upload more to see hourly patterns.
                        </div>
                      )}
                      {Array.isArray(bestTime.bar_chart_data) && bestTime.bar_chart_data.length > 0 && bestTimeUploadTotal > 0 && bestTimeUploadTotal < 3 && (
                        <div className="dashboard-empty dashboard-empty--tight dashboard-empty--performance-coach">
                          <span className="dashboard-empty-performance-title">Hourly chart locked</span>
                          <span className="dashboard-empty-performance-body">
                            A few more uploads in this window unlocks the chart. Keep publishing — we&apos;ll tighten the windows next visit.
                          </span>
                          <a
                            href="#coach"
                            className="dashboard-performance-coach-cta"
                            onClick={(e) => {
                              e.preventDefault()
                              window.location.hash = 'coach'
                            }}
                          >
                            Coach <IconArrowRight />
                          </a>
                        </div>
                      )}
                      {(!bestTime.bar_chart_data || bestTime.bar_chart_data.length === 0) && (!bestTime.recommended_slots?.length) && (
                        <div className="dashboard-empty dashboard-empty--tight dashboard-empty--performance-muted">
                          Uploads needed to estimate best times.
                        </div>
                      )}
                    </>
                    )}
                    {!bestTimeLoading && !bestTime && (
                      <div className="dashboard-perf-zone-empty">
                        <p>Schedule insights unavailable</p>
                        <p className="dashboard-perf-zone-empty-hint">We&apos;ll load posting windows from your upload history.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </section>
          )}

          </div>
        </main>
      </div>
    </div>
  )
}
