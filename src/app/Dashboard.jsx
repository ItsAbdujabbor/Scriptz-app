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
  countBestTimeUploads,
  getAreaAction,
  getAuditAreaGuidance,
  getGrowthScenarioMessage,
} from '../lib/dashboardActions'
import {
  computePrePublishScore,
  computeScriptPerformanceEstimate,
  thumbnailBattleHref,
} from '../lib/dashboardCommandCenter'
import {
  coachPrefill,
  getAreaPrefill,
  hashWithPrefill,
  optimizePrefill,
  scriptPrefill,
  thumbPrefill,
} from '../lib/dashboardActionPayload'
import { getMilestonePair, SUBS_STEPS, VIEWS_STEPS } from '../lib/channelMilestones'
import {
  readMilestoneVisitSnapshot,
  writeMilestoneVisitSnapshot,
} from '../lib/milestoneVisitStorage'
import { Activity, BarChart3, HeartPulse, Lightbulb, ListChecks, Zap } from 'lucide-react'

const SECTION_ICONS = {
  pulse: Activity,
  quick: Zap,
  ideas: Lightbulb,
  health: HeartPulse,
  reco: ListChecks,
  performance: BarChart3,
}

function DashboardSectionGlyph({ name, className = '' }) {
  const Icon = SECTION_ICONS[name] ?? Activity
  return (
    <span
      className={`dashboard-section-glyph-wrap dashboard-section-glyph-wrap--${name}${className ? ` ${className}` : ''}`.trim()}
      aria-hidden
    >
      <Icon className="dashboard-section-glyph" size={20} strokeWidth={2} />
    </span>
  )
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
const IconRefresh = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 4v6h-6M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)
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
const IconScript = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="m2 2 7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
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
const IconMessage = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2a10 10 0 1 0 10 10H4a2 2 0 0 1-2-2V4a10 10 0 0 0 10 2z" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
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

const IDEA_FEEDBACK_REASONS = [
  { value: 'not_my_niche', label: 'Not my niche' },
  { value: 'already_made', label: 'Already covered' },
  { value: 'not_relevant', label: 'Not for now' },
  { value: 'too_hard', label: 'Too heavy to make' },
  { value: 'other', label: 'Something else' },
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

const MILESTONE_METRIC_COPY = {
  subs: { unit: 'subscribers', progressLine: 'on the path to your first subscriber milestone' },
  views: { unit: 'lifetime views', progressLine: 'on the path to your first view milestone' },
}

function DashboardMilestoneStrip({
  title,
  steps,
  current,
  animateFrom,
  major,
  locked,
  lockedHint,
  metricKind = 'subs',
}) {
  const cur = Math.max(0, Number(current) || 0)
  const fromCandidate =
    animateFrom != null && animateFrom < cur ? Math.max(0, Number(animateFrom) || 0) : null
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
  const metric = MILESTONE_METRIC_COPY[metricKind] || MILESTONE_METRIC_COPY.subs

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
        ) : achieved ? (
          <span className="dashboard-milestone-now-pill">
            <span className="dashboard-milestone-now-pill-label">Now</span>
            <span className="dashboard-milestone-now-pill-value">{nowLabel}</span>
          </span>
        ) : null}
      </div>

      <div className="dashboard-milestone-pair">
        {achieved ? (
          <div className="dashboard-milestone-card dashboard-milestone-card--achieved">
            <span className="dashboard-milestone-card-kicker">Latest hit</span>
            <span className="dashboard-milestone-card-value">{achieved.label}</span>
            <span className="dashboard-milestone-card-desc">{achieved.title}</span>
          </div>
        ) : (
          <div className="dashboard-milestone-card dashboard-milestone-card--current">
            <span className="dashboard-milestone-card-kicker">Your count</span>
            <span className="dashboard-milestone-card-value dashboard-milestone-card-value--hero">
              {nowLabel}
            </span>
            <span className="dashboard-milestone-card-desc">{metric.unit}</span>
            <span className="dashboard-milestone-card-hint">{metric.progressLine}</span>
          </div>
        )}
        <div className="dashboard-milestone-card dashboard-milestone-card--next">
          <span className="dashboard-milestone-card-kicker">Next target</span>
          {next ? (
            <>
              <span className="dashboard-milestone-card-value">{next.label}</span>
              <span className="dashboard-milestone-card-desc">{next.title}</span>
            </>
          ) : (
            <>
              <span className="dashboard-milestone-card-value dashboard-milestone-card-value--done">
                Done
              </span>
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
        <p className="dashboard-milestone-caption dashboard-milestone-caption--locked">
          Progress hidden until unlocked
        </p>
      ) : null}
    </div>
  )
}

export function Dashboard({ onLogout }) {
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
          if (!useOnboardingStore.getState().onboardingCompleted) {
            useOnboardingStore.getState().completeOnboarding()
          }
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
  const insightsRegenerating = insightsQuery.isRegenerating
  const insightsBusy = insightsLoading || insightsRegenerating
  const insightsError = insightsQuery.isError ? insightsQuery.error?.message : null
  const visibleScriptIdeas = useMemo(() => {
    if (!Array.isArray(insights?.script_suggestions)) return []
    const list = insights.script_suggestions.filter(Boolean)
    return list.slice(0, 3)
  }, [insights])

  const audit = auditQuery.data
  const auditLoading = auditQuery.isPending

  const growth = growthQuery.data
  const growthLoading = growthQuery.isPending

  const prePublishScore = useMemo(() => (audit ? computePrePublishScore(audit) : null), [audit])
  const scriptPerformanceEstimate = useMemo(
    () => (audit ? computeScriptPerformanceEstimate(audit) : null),
    [audit]
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

  const optimizeAuditHash = useMemo(
    () =>
      hashWithPrefill('optimize', optimizePrefill('channel health', audit?.overall_score ?? null)),
    [audit]
  )

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

  const growthScenario = useMemo(() => (growth ? getGrowthScenarioMessage(growth) : null), [growth])

  /** Big numbers + bar lengths for forecast panel (velocity comparison). */
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

  const bestTimeUploadTotal = useMemo(
    () => countBestTimeUploads(bestTime?.bar_chart_data),
    [bestTime?.bar_chart_data]
  )

  const ideaFeedbackMutation = useIdeaFeedbackMutation({ channelId })
  const dashboardName = getDashboardName(user)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const onChange = () => setMainColumnNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const sidebarWidthPx = collapsed ? 60 : 252
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
    const perPage = 15
    queryClient
      .prefetchQuery({
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
      .catch(() => {})
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
      const bootstrap = await bootstrapYouTube(token, { force: true })
      setYoutubeChannels(bootstrap.channels || [])
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

  const submitIdeaFeedback = async ({
    idea,
    interested,
    reason = null,
    details = null,
    successMessage,
  }) => {
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
                  {youtube.profile_image || youtube.avatar ? (
                    <img
                      src={youtube.profile_image || youtube.avatar}
                      alt=""
                      className="dashboard-channel-pill-avatar"
                    />
                  ) : (
                    <span className="dashboard-channel-pill-avatar dashboard-channel-pill-avatar--fallback">
                      {(youtube.channel_title || youtube.channelName || 'Y')[0]}
                    </span>
                  )}
                  <span className="dashboard-channel-pill-name">
                    {youtube.channel_title || youtube.channelName || 'My Channel'}
                  </span>
                  <span className="dashboard-channel-pill-chevron" aria-hidden>
                    <IconChevronDown />
                  </span>
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
                <span className="dashboard-channel-pill-icon" aria-hidden>
                  <IconPlus />
                </span>
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
                          (c.channel_id || c.channelId) ===
                          (youtube?.channelId || youtube?.channel_id)
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
                            {c.profile_image || c.avatar ? (
                              <img
                                src={c.profile_image || c.avatar}
                                alt=""
                                className="dashboard-channel-pill-menu-avatar"
                              />
                            ) : (
                              <span className="dashboard-channel-pill-menu-avatar dashboard-channel-pill-menu-avatar--fallback">
                                {(c.channel_title || c.channelName || '?')[0]}
                              </span>
                            )}
                            <span className="dashboard-channel-pill-menu-name">
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

                {ideaDismissIdea && (
                  <div
                    className="dashboard-idea-modal-backdrop"
                    role="presentation"
                    onClick={closeIdeaDismissDialog}
                  >
                    <div
                      className="dashboard-idea-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="dashboard-idea-dismiss-title"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="dashboard-idea-modal-accent" aria-hidden />
                      <div className="dashboard-idea-modal-head">
                        <div className="dashboard-idea-modal-head-text">
                          <span className="dashboard-idea-modal-kicker">Pass on this idea</span>
                          <h3 id="dashboard-idea-dismiss-title">Help us show better suggestions</h3>
                        </div>
                        <button
                          type="button"
                          className="dashboard-idea-modal-close"
                          aria-label="Close"
                          onClick={closeIdeaDismissDialog}
                        >
                          <span aria-hidden>×</span>
                        </button>
                      </div>
                      <div className="dashboard-idea-modal-preview">
                        <span className="dashboard-idea-modal-preview-label">Video title</span>
                        <p className="dashboard-idea-modal-preview-title">
                          {ideaDismissIdea?.idea_title || ideaDismissIdea?.title || 'Untitled idea'}
                        </p>
                      </div>
                      <form className="dashboard-idea-modal-form" onSubmit={handleDismissSubmit}>
                        <p
                          className="dashboard-idea-modal-section-label"
                          id="idea-dismiss-reasons-label"
                        >
                          Why are you passing?
                        </p>
                        <div
                          className="dashboard-idea-modal-options"
                          role="radiogroup"
                          aria-labelledby="idea-dismiss-reasons-label"
                        >
                          {IDEA_FEEDBACK_REASONS.map((option) => (
                            <label
                              key={option.value}
                              className={`dashboard-idea-modal-option ${ideaDismissReason === option.value ? 'is-selected' : ''}`}
                            >
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
                              <span className="dashboard-idea-modal-option-body">
                                <span className="dashboard-idea-modal-option-title">
                                  {option.label}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                        <label className="dashboard-idea-modal-field">
                          <span className="dashboard-idea-modal-field-label">
                            Note{' '}
                            {ideaDismissReason === 'other' ? (
                              <em>(required)</em>
                            ) : (
                              <em>(optional)</em>
                            )}
                          </span>
                          <textarea
                            value={ideaDismissDetails}
                            onChange={(e) => {
                              setIdeaDismissDetails(e.target.value)
                              setIdeaDismissError('')
                            }}
                            placeholder="Anything specific helps — we read these to improve the model."
                            rows={3}
                          />
                        </label>
                        {ideaDismissError && (
                          <div className="dashboard-idea-modal-error" role="alert">
                            {ideaDismissError}
                          </div>
                        )}
                        <div className="dashboard-idea-modal-actions">
                          <button
                            type="button"
                            className="dashboard-idea-modal-btn dashboard-idea-modal-btn--ghost"
                            onClick={closeIdeaDismissDialog}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="dashboard-idea-modal-btn dashboard-idea-modal-btn--primary"
                            disabled={
                              ideaFeedbackSending ===
                              `${ideaDismissIdea?.idea_title || ideaDismissIdea?.title || ''}-false`
                            }
                          >
                            {ideaFeedbackSending ===
                            `${ideaDismissIdea?.idea_title || ideaDismissIdea?.title || ''}-false` ? (
                              <>
                                <span className="dashboard-idea-modal-btn-spinner" aria-hidden />
                                Removing…
                              </>
                            ) : (
                              'Remove from my list'
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
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
                            <span className="dashboard-yt-connect-banner-name">
                              {dashboardName}
                            </span>
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
                              <span
                                className="dashboard-yt-connect-banner-cta-spinner"
                                aria-hidden
                              />
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
                        <div className="dashboard-milestones-head">
                          <h3 className="dashboard-milestones-heading">Milestones</h3>
                        </div>
                        <div className="dashboard-milestones-grid dashboard-milestones-grid--pair">
                          <DashboardMilestoneStrip
                            key={
                              subsMilestoneFrom != null
                                ? `ms-aud-${channelId}-${subsMilestoneFrom}`
                                : `ms-aud-${channelId}`
                            }
                            title="Audience"
                            metricKind="subs"
                            steps={SUBS_STEPS}
                            current={subsCount}
                            animateFrom={subsMilestoneFrom}
                          />
                          <DashboardMilestoneStrip
                            key={
                              viewsMilestoneFrom != null
                                ? `ms-vw-${channelId}-${viewsMilestoneFrom}`
                                : `ms-vw-${channelId}`
                            }
                            title="Views"
                            metricKind="views"
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
                        YouTube channel to analyze—then audits, forecasts, and ranked ideas load
                        here.
                      </div>
                      <button
                        type="button"
                        className="dashboard-btn dashboard-btn-primary"
                        onClick={() => openSettings('account')}
                      >
                        Open account settings
                      </button>
                    </div>
                  </section>
                )}

                {hasChannelData && (
                  <section
                    className="dashboard-section dashboard-command-center"
                    aria-label="Channel pulse"
                  >
                    <div className="dashboard-command-shell">
                      <header className="dashboard-card-section-head">
                        <h2 className="dashboard-section-title">
                          <DashboardSectionGlyph name="pulse" />
                          Channel pulse
                        </h2>
                        <div className="dashboard-card-section-meta">
                          <span className="dashboard-command-status dashboard-command-status--live">
                            YouTube linked
                          </span>
                          {auditLoading ? (
                            <span className="dashboard-command-status dashboard-command-status--pending">
                              Scoring channel…
                            </span>
                          ) : audit?.overall_score != null ? (
                            <span className="dashboard-command-status">
                              Health {audit.overall_score}/100
                            </span>
                          ) : (
                            <span className="dashboard-command-status dashboard-command-status--pending">
                              Audit pending
                            </span>
                          )}
                        </div>
                      </header>

                      <div
                        className="dashboard-command-summary-grid"
                        aria-label="Channel pulse overview"
                      >
                        <aside className="dashboard-command-side-card dashboard-command-side-card--forecast">
                          <div className="dashboard-command-side-head">
                            <span className="dashboard-command-side-eyebrow">Forecast</span>
                            <h3 className="dashboard-command-side-title">30-day view outlook</h3>
                          </div>
                          {growthLoading && (
                            <div className="dashboard-forecast-skeleton" aria-busy="true">
                              <span className="dashboard-skeleton-line" />
                              <span className="dashboard-skeleton-line dashboard-skeleton-line--short" />
                            </div>
                          )}
                          {!growthLoading && forecastMetrics && (
                            <>
                              {forecastMetrics.projected != null ? (
                                <div
                                  className="dashboard-command-outlook-hero"
                                  title={
                                    forecastMetrics.projectedIsEstimated
                                      ? 'From 30-day daily pace'
                                      : '30-day view projection'
                                  }
                                >
                                  <div className="dashboard-command-outlook-row">
                                    <span className="dashboard-command-outlook-value">
                                      {formatCount(forecastMetrics.projected)}
                                    </span>
                                    <span className="dashboard-command-outlook-unit">views</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="dashboard-shell-empty" aria-hidden>
                                  —
                                </div>
                              )}
                              <div className="dashboard-command-mini-stats">
                                <div className="dashboard-command-mini-stat">
                                  <span className="dashboard-command-mini-stat-label">
                                    7-day pace
                                  </span>
                                  <strong className="dashboard-command-mini-stat-value">
                                    {forecastMetrics.v7 != null
                                      ? `${forecastMetrics.v7.toFixed(1)} views/day`
                                      : 'No data'}
                                  </strong>
                                </div>
                                <div className="dashboard-command-mini-stat">
                                  <span className="dashboard-command-mini-stat-label">
                                    30-day pace
                                  </span>
                                  <strong className="dashboard-command-mini-stat-value">
                                    {forecastMetrics.v30 != null
                                      ? `${forecastMetrics.v30.toFixed(1)} views/day`
                                      : 'No data'}
                                  </strong>
                                </div>
                              </div>
                            </>
                          )}
                          {!growthLoading && growthScenario?.opportunity && (
                            <div className="dashboard-command-target">
                              <span className="dashboard-command-target-label">Upside range</span>
                              <strong className="dashboard-command-target-value">
                                {growthScenario.opportunity}
                              </strong>
                            </div>
                          )}
                          {!growthLoading && !forecastMetrics && (
                            <div className="dashboard-shell-empty" aria-hidden>
                              —
                            </div>
                          )}
                        </aside>

                        <article className="dashboard-command-side-card dashboard-command-side-card--packaging">
                          <div className="dashboard-command-side-head">
                            <span className="dashboard-command-side-eyebrow">Readiness</span>
                            <h3 className="dashboard-command-side-title">Pre-publish check</h3>
                          </div>
                          {auditLoading && (
                            <div className="dashboard-command-side-body" aria-busy="true">
                              <div className="dashboard-command-metrics dashboard-command-metrics--loading">
                                <span className="dashboard-skeleton-pill" />
                                <span className="dashboard-skeleton-pill" />
                                <span className="dashboard-skeleton-pill" />
                              </div>
                              <div className="dashboard-tile-score-skeleton">
                                <span className="dashboard-skeleton-ring" />
                              </div>
                            </div>
                          )}
                          {!auditLoading && scriptPerformanceEstimate && prePublishScore && (
                            <div className="dashboard-command-side-body">
                              <div className="dashboard-command-check-top">
                                <div className="dashboard-command-check-score">
                                  <div className="dashboard-command-check-score-row-main">
                                    <span className="dashboard-command-check-score-num">
                                      {prePublishScore.score}
                                    </span>
                                    <span className="dashboard-command-check-score-max">/100</span>
                                  </div>
                                </div>
                                <span
                                  className={`dashboard-command-readiness-pill dashboard-command-readiness-pill--${prePublishScore.tier}`}
                                >
                                  {prePublishScore.tier === 'strong'
                                    ? 'Ship-ready'
                                    : prePublishScore.tier === 'mixed'
                                      ? 'Polish first'
                                      : 'Needs work'}
                                </span>
                              </div>

                              <div className="dashboard-command-score-list">
                                <div className="dashboard-command-score-row">
                                  <span className="dashboard-command-score-key">
                                    Packaging blend
                                  </span>
                                  <span className="dashboard-command-score-val">
                                    {scriptPerformanceEstimate.overall}
                                    <span className="dashboard-command-score-val-max">/100</span>
                                  </span>
                                </div>
                                <div className="dashboard-command-score-row">
                                  <span className="dashboard-command-score-key">
                                    Retention signal
                                  </span>
                                  <span className="dashboard-command-score-val">
                                    {scriptPerformanceEstimate.retention}
                                    <span className="dashboard-command-score-val-max">/100</span>
                                  </span>
                                </div>
                                <div className="dashboard-command-score-row">
                                  <span className="dashboard-command-score-key">
                                    Hook &amp; title
                                  </span>
                                  <span className="dashboard-command-score-val">
                                    {scriptPerformanceEstimate.hookStrength}
                                    <span className="dashboard-command-score-val-max">/100</span>
                                  </span>
                                </div>
                              </div>

                              {scriptPerformanceEstimate.weakPoints?.length > 0 && (
                                <div className="dashboard-command-fix-row">
                                  <span className="dashboard-command-primary-label">
                                    Weakest areas first
                                  </span>
                                  <div className="dashboard-command-fix-pills">
                                    {scriptPerformanceEstimate.weakPoints
                                      .slice(0, 2)
                                      .map((point, wpIdx) => (
                                        <span
                                          key={`${wpIdx}-${point.label}`}
                                          className="dashboard-command-mini-pill"
                                        >
                                          {point.label} · {point.score}/100
                                        </span>
                                      ))}
                                  </div>
                                </div>
                              )}

                              <a
                                href={`#${hashWithPrefill('optimize', optimizePrefill('titles & thumbnails', prePublishScore?.score ?? audit?.overall_score ?? null))}`}
                                className="dashboard-btn dashboard-btn-secondary dashboard-command-side-cta"
                                onClick={(e) => {
                                  e.preventDefault()
                                  window.location.hash = hashWithPrefill(
                                    'optimize',
                                    optimizePrefill(
                                      'titles & thumbnails',
                                      prePublishScore?.score ?? audit?.overall_score ?? null
                                    )
                                  )
                                }}
                              >
                                Improve in Optimize
                                <span className="dashboard-next-action-cta-arrow" aria-hidden>
                                  <IconArrowRight />
                                </span>
                              </a>
                            </div>
                          )}
                          {!auditLoading && (!scriptPerformanceEstimate || !prePublishScore) && (
                            <div className="dashboard-command-side-body">
                              <div className="dashboard-shell-empty" aria-hidden>
                                —
                              </div>
                            </div>
                          )}
                        </article>
                      </div>
                    </div>
                  </section>
                )}

                {/* Quick actions — only after YouTube is connected (use sidebar tools otherwise) */}
                {youtube?.connected && (
                  <section className="dashboard-section dashboard-quick-actions">
                    <header className="dashboard-card-section-head dashboard-card-section-head--solo">
                      <h2 className="dashboard-section-title">
                        <DashboardSectionGlyph name="quick" />
                        Quick actions
                      </h2>
                    </header>
                    <div className="dashboard-quick-actions-grid">
                      <a
                        href={`#${hashWithPrefill('coach/scripts', scriptPrefill({ concept: null, pillar: 'Next video', score: null }))}`}
                        className="dashboard-quick-action-card"
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.hash = hashWithPrefill(
                            'coach/scripts',
                            scriptPrefill({ concept: null, pillar: 'Next video', score: null })
                          )
                        }}
                      >
                        <span
                          className="dashboard-quick-action-icon dashboard-quick-action-icon--script"
                          aria-hidden
                        >
                          <IconScript />
                        </span>
                        <span className="dashboard-quick-action-label">Script Generator</span>
                        <span className="dashboard-quick-action-arrow" aria-hidden>
                          <IconArrowRight />
                        </span>
                      </a>
                      <a
                        href={`#${hashWithPrefill('coach/thumbnails', thumbPrefill({ pillar: 'CTR', score: null, videoTitle: null }))}`}
                        className="dashboard-quick-action-card"
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.hash = hashWithPrefill(
                            'coach/thumbnails',
                            thumbPrefill({ pillar: 'CTR', score: null, videoTitle: null })
                          )
                        }}
                      >
                        <span
                          className="dashboard-quick-action-icon dashboard-quick-action-icon--thumbnail"
                          aria-hidden
                        >
                          <IconThumbnail />
                        </span>
                        <span className="dashboard-quick-action-label">Thumbnail Generator</span>
                        <span className="dashboard-quick-action-arrow" aria-hidden>
                          <IconArrowRight />
                        </span>
                      </a>
                      <a
                        href={`#${hashWithPrefill('coach', coachPrefill('Channel', null, 'Top 3 priorities for my channel this week.'))}`}
                        className="dashboard-quick-action-card"
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.hash = hashWithPrefill(
                            'coach',
                            coachPrefill(
                              'Channel',
                              null,
                              'Top 3 priorities for my channel this week.'
                            )
                          )
                        }}
                      >
                        <span
                          className="dashboard-quick-action-icon dashboard-quick-action-icon--coach"
                          aria-hidden
                        >
                          <IconMessage />
                        </span>
                        <span className="dashboard-quick-action-label">AI Coach</span>
                        <span className="dashboard-quick-action-arrow" aria-hidden>
                          <IconArrowRight />
                        </span>
                      </a>
                      <a
                        href={`#${hashWithPrefill('optimize', optimizePrefill('titles & thumbnails', null))}`}
                        className="dashboard-quick-action-card"
                        onClick={(e) => {
                          e.preventDefault()
                          window.location.hash = hashWithPrefill(
                            'optimize',
                            optimizePrefill('titles & thumbnails', null)
                          )
                        }}
                      >
                        <span
                          className="dashboard-quick-action-icon dashboard-quick-action-icon--optimize"
                          aria-hidden
                        >
                          <IconOptimize />
                        </span>
                        <span className="dashboard-quick-action-label">Optimize</span>
                        <span className="dashboard-quick-action-arrow" aria-hidden>
                          <IconArrowRight />
                        </span>
                      </a>
                    </div>
                  </section>
                )}

                {/* AI Insights — script ideas */}
                <section
                  id="dashboard-video-ideas"
                  className="dashboard-section dashboard-insights-section"
                >
                  <div className="dashboard-panel dashboard-panel--ideas">
                    <header className="dashboard-card-section-head">
                      <div className="dashboard-card-section-head-main">
                        <h2 className="dashboard-section-title dashboard-script-ideas-title">
                          <DashboardSectionGlyph name="ideas" />
                          AI video ideas
                        </h2>
                      </div>
                      <div className="dashboard-card-section-meta">
                        <button
                          type="button"
                          className={`dashboard-script-ideas-regenerate${insightsBusy ? ' dashboard-script-ideas-regenerate--busy' : ''}`}
                          onClick={() => {
                            void insightsQuery.regenerateInsights().catch(() => {})
                          }}
                          disabled={insightsBusy}
                          aria-busy={insightsRegenerating || insightsLoading}
                          title="Regenerate ideas"
                        >
                          {insightsRegenerating ? (
                            <>
                              <span
                                className="dashboard-script-ideas-regenerate-btn-spinner"
                                aria-hidden
                              />
                              <span>Regenerating…</span>
                            </>
                          ) : (
                            <>
                              <IconRefresh />
                              <span>{insightsLoading ? 'Loading…' : 'Regenerate'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </header>
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
                    {!insightsLoading &&
                      !insightsError &&
                      insights &&
                      visibleScriptIdeas.length > 0 && (
                        <>
                          {ideaFeedbackNotice && (
                            <div
                              className={`dashboard-inline-notice dashboard-inline-notice--${ideaFeedbackNotice.tone}`}
                              role="status"
                            >
                              {ideaFeedbackNotice.text}
                            </div>
                          )}
                          <div
                            className={`dashboard-script-ideas-grid${insightsRegenerating ? ' dashboard-script-ideas-grid--refreshing' : ''}`}
                          >
                            {visibleScriptIdeas.map((idea, i) => {
                              const title = idea?.idea_title ?? idea?.title ?? 'Idea'
                              const script = idea?.short_script ?? idea?.script ?? idea?.description
                              const key = `${title}-${i}`
                              const sending =
                                ideaFeedbackSending === `${title}-true` ||
                                ideaFeedbackSending === `${title}-false`
                              const tags = [
                                idea?.hook_concept,
                                idea?.angle,
                                idea?.target_emotion,
                                idea?.expected_audience,
                              ].filter(Boolean)
                              const num = i + 1
                              return (
                                <article key={key} className="dashboard-script-idea-card">
                                  <div className="dashboard-script-idea-card-top">
                                    <span className="dashboard-script-idea-num" aria-hidden>
                                      {num}
                                    </span>
                                    <div className="dashboard-script-idea-card-intro">
                                      <span className="dashboard-script-idea-field-label">
                                        Video title
                                      </span>
                                      <h3 className="dashboard-script-idea-card-title">{title}</h3>
                                      {script && (
                                        <>
                                          <span className="dashboard-script-idea-field-label">
                                            How the video goes
                                          </span>
                                          <p className="dashboard-script-idea-card-desc">
                                            {script}
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {tags.length > 0 && (
                                    <div className="dashboard-script-idea-signals-slot">
                                      <div className="dashboard-script-idea-signals">
                                        <div className="dashboard-script-idea-signals-head">
                                          <span className="dashboard-script-idea-signals-kicker">
                                            Signals
                                          </span>
                                          <p className="dashboard-script-idea-signals-sub">
                                            Why this could work
                                          </p>
                                        </div>
                                        <div
                                          className="dashboard-script-idea-signals-divider"
                                          aria-hidden
                                        />
                                        <div className="dashboard-script-idea-signals-chips">
                                          {tags.map((tag) => (
                                            <span
                                              key={tag}
                                              className="dashboard-script-idea-signals-chip"
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
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
                                            scriptPrefill({
                                              concept: title,
                                              pillar: 'Next video',
                                              score: null,
                                            })
                                          )
                                        }}
                                      >
                                        Write script
                                      </a>
                                      <a
                                        href={`#${hashWithPrefill(
                                          thumbnailBattleHref(title),
                                          thumbPrefill({
                                            pillar: 'CTR / thumbnails',
                                            score: null,
                                            videoTitle: title,
                                          })
                                        )}`}
                                        className="dashboard-script-idea-card-btn dashboard-script-idea-card-btn--secondary"
                                        onClick={(e) => {
                                          e.preventDefault()
                                          window.location.hash = hashWithPrefill(
                                            thumbnailBattleHref(title),
                                            thumbPrefill({
                                              pillar: 'CTR / thumbnails',
                                              score: null,
                                              videoTitle: title,
                                            })
                                          )
                                        }}
                                      >
                                        Thumbnail
                                      </a>
                                    </div>
                                    <div
                                      className="dashboard-script-idea-card-feedback"
                                      role="group"
                                      aria-label="Idea feedback"
                                    >
                                      <button
                                        type="button"
                                        className="dashboard-script-idea-feedback-pill dashboard-script-idea-feedback-pill--yes"
                                        title="Keep — we will favor ideas like this"
                                        aria-label="Keep this idea"
                                        disabled={sending}
                                        onClick={() => handleIdeaFeedback(idea, true)}
                                      >
                                        {sending ? (
                                          <span
                                            className="dashboard-script-idea-feedback-pill-dots"
                                            aria-hidden
                                          >
                                            …
                                          </span>
                                        ) : (
                                          <>
                                            <span
                                              className="dashboard-script-idea-feedback-pill-glyph"
                                              aria-hidden
                                            >
                                              ✓
                                            </span>
                                            <span className="dashboard-script-idea-feedback-pill-text">
                                              Keep
                                            </span>
                                          </>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        className="dashboard-script-idea-feedback-pill dashboard-script-idea-feedback-pill--pass"
                                        title="Pass — tell us why this idea is not a fit"
                                        aria-label="Pass on this idea"
                                        disabled={sending}
                                        onClick={() => handleIdeaFeedback(idea, false)}
                                      >
                                        <span
                                          className="dashboard-script-idea-feedback-pill-glyph dashboard-script-idea-feedback-pill-glyph--pass"
                                          aria-hidden
                                        >
                                          ↪
                                        </span>
                                        <span className="dashboard-script-idea-feedback-pill-text">
                                          Pass
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              )
                            })}
                          </div>
                        </>
                      )}
                    {!insightsLoading &&
                      !insightsError &&
                      insights &&
                      visibleScriptIdeas.length === 0 && (
                        <div className="dashboard-script-ideas-empty">
                          <p>No ideas yet.</p>
                          <a
                            href="#coach/scripts"
                            className="dashboard-script-ideas-empty-link"
                            onClick={(e) => {
                              e.preventDefault()
                              window.location.hash = 'coach/scripts'
                            }}
                          >
                            Script Generator <IconArrowRight />
                          </a>
                        </div>
                      )}
                  </div>
                </section>

                {/* Channel Audit (channel required) */}
                {channelId && (
                  <section
                    className="dashboard-section dashboard-audit-open-section"
                    aria-labelledby="dashboard-audit-heading"
                  >
                    <div className="dashboard-details-body">
                      <header className="dashboard-card-section-head dashboard-card-section-head--solo">
                        <h2 id="dashboard-audit-heading" className="dashboard-section-title">
                          <DashboardSectionGlyph name="health" />
                          Channel health &amp; audit
                        </h2>
                      </header>
                      {auditLoading && (
                        <div className="dashboard-loading">
                          <span className="dashboard-loading-spinner" /> Loading audit…
                        </div>
                      )}
                      {!auditLoading && audit && (
                        <div className="dashboard-audit-layout dashboard-audit-layout--stack">
                          <div className="dashboard-ai-card dashboard-audit-card dashboard-audit-card--hero dashboard-audit-card--hero-full">
                            <div className="dashboard-audit-hero">
                              <div className="dashboard-audit-hero-top">
                                <div className="dashboard-audit-hero-main">
                                  <span className="dashboard-audit-overall-label">
                                    Overall score
                                  </span>
                                  <div className="dashboard-audit-overall-row">
                                    <span className="dashboard-audit-overall-value">
                                      {audit.overall_score ?? 0}
                                      <span className="dashboard-audit-overall-max">/100</span>
                                    </span>
                                    <span
                                      className={`dashboard-audit-overall-badge dashboard-audit-overall-badge--${getAuditScoreTier(audit.overall_score ?? 0)}`}
                                    >
                                      {auditTierLabel(getAuditScoreTier(audit.overall_score ?? 0))}
                                    </span>
                                  </div>
                                </div>
                                {auditBreakdownStats && (
                                  <ul
                                    className="dashboard-audit-hero-quick"
                                    aria-label="Score summary"
                                  >
                                    <li>
                                      <span className="dashboard-audit-hero-quick-label">Avg</span>
                                      <span className="dashboard-audit-hero-quick-value">
                                        {auditBreakdownStats.avg}
                                      </span>
                                    </li>
                                    <li>
                                      <span className="dashboard-audit-hero-quick-label">
                                        Strong
                                      </span>
                                      <span className="dashboard-audit-hero-quick-value">
                                        {auditBreakdownStats.strongCount}
                                      </span>
                                    </li>
                                    <li>
                                      <span className="dashboard-audit-hero-quick-label">
                                        To improve
                                      </span>
                                      <span className="dashboard-audit-hero-quick-value">
                                        {auditBreakdownStats.focusCount}
                                      </span>
                                    </li>
                                  </ul>
                                )}
                              </div>
                              <div
                                className="dashboard-audit-overall-bar"
                                role="progressbar"
                                aria-valuenow={audit.overall_score ?? 0}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              >
                                <div
                                  className={`dashboard-audit-overall-bar-fill dashboard-audit-overall-bar-fill--${getAuditScoreTier(audit.overall_score ?? 0)}`}
                                  style={{
                                    width: `${Math.min(100, Math.max(0, audit.overall_score ?? 0))}%`,
                                  }}
                                />
                              </div>
                              {auditBreakdownStats && (
                                <div className="dashboard-audit-hero-foot">
                                  <div className="dashboard-audit-hero-focus-card">
                                    <p className="dashboard-audit-hero-focus">
                                      <span className="dashboard-audit-hero-focus-label">
                                        Lowest area
                                      </span>
                                      <span className="dashboard-audit-hero-focus-value">
                                        {auditBreakdownStats.weakest.name} ·{' '}
                                        {auditBreakdownStats.weakest.score}/100
                                      </span>
                                    </p>
                                  </div>
                                  <a
                                    href={`#${optimizeAuditHash}`}
                                    className="dashboard-audit-hero-cta dashboard-btn dashboard-btn-secondary"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      window.location.hash = optimizeAuditHash
                                    }}
                                  >
                                    Improve in Optimize
                                    <span className="dashboard-audit-hero-cta-arrow" aria-hidden>
                                      <IconArrowRight />
                                    </span>
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>

                          {Array.isArray(audit.scores) && audit.scores.length > 0 && (
                            <div className="dashboard-audit-breakdown-card dashboard-audit-breakdown-card--full">
                              <div className="dashboard-audit-scores-head">
                                <div className="dashboard-audit-scores-head-text">
                                  <span className="dashboard-audit-scores-title">Breakdown</span>
                                  <span className="dashboard-audit-scores-sub">
                                    Scores by area — use the action on each row to jump to the right
                                    tool.
                                  </span>
                                </div>
                              </div>
                              <div className="dashboard-audit-scores">
                                {audit.scores.map((s, i) => {
                                  const score = Number(s.score ?? 0)
                                  const pct = Math.min(100, Math.max(0, score))
                                  const tier = getAuditScoreTier(score)
                                  const nm = String(s.name ?? s.label ?? '')
                                  const guidance = getAuditAreaGuidance(
                                    nm,
                                    score,
                                    s.label ? String(s.label) : null
                                  )
                                  const areaAct = guidance.href
                                    ? { label: 'Do this now', hash: guidance.href }
                                    : getAreaAction(nm)
                                  const areaNavHash = hashWithPrefill(
                                    areaAct.hash,
                                    getAreaPrefill(nm, score)
                                  )
                                  return (
                                    <div
                                      key={i}
                                      className={`dashboard-audit-score-item dashboard-audit-score-item--${tier}`}
                                    >
                                      <div className="dashboard-audit-score-head">
                                        <div className="dashboard-audit-score-name-wrap">
                                          <span className="dashboard-audit-score-name">
                                            {s.name ?? s.label}
                                          </span>
                                          <span
                                            className={`dashboard-audit-score-tier dashboard-audit-score-tier--${tier}`}
                                          >
                                            {auditTierLabel(tier)}
                                          </span>
                                        </div>
                                        <span
                                          className={`dashboard-audit-score-value dashboard-audit-score-value--${tier}`}
                                        >
                                          {score}
                                        </span>
                                      </div>
                                      <div
                                        className="dashboard-audit-score-bar"
                                        role="progressbar"
                                        aria-valuenow={score}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                      >
                                        <div
                                          className={`dashboard-audit-score-bar-fill dashboard-audit-score-bar-fill--${tier}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <div className="dashboard-audit-score-cta-row">
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
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Performance: KPI + growth + best time (single block) */}
                {channelId && (
                  <section
                    className="dashboard-section dashboard-performance-section"
                    aria-labelledby="dashboard-performance-heading"
                  >
                    <div className="dashboard-details-body">
                      <div className="dashboard-performance-shell dashboard-performance-shell--unified">
                        <div className="dashboard-performance-zone dashboard-performance-zone--unified dashboard-performance-zone--sheet">
                          <div className="dashboard-performance-zone-frame">
                            <header className="dashboard-card-section-head dashboard-card-section-head--solo">
                              <h2
                                id="dashboard-performance-heading"
                                className="dashboard-section-title"
                              >
                                <DashboardSectionGlyph name="performance" />
                                Performance &amp; posting
                              </h2>
                            </header>
                            <header className="dashboard-performance-unified-head">
                              <div className="dashboard-performance-unified-head-copy">
                                <h3 className="dashboard-performance-block-title">KPI snapshot</h3>
                                <p className="dashboard-performance-unified-sub">
                                  Last 30 days, growth pace, and when your uploads tend to perform —
                                  in one place.
                                </p>
                              </div>
                              <span className="dashboard-performance-block-meta">30d</span>
                            </header>

                            {(snapshotLoading || growthLoading) && (
                              <div
                                className="dashboard-perf-skeleton-grid dashboard-perf-skeleton-grid--compact"
                                aria-busy
                                aria-label="Loading performance metrics"
                              >
                                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                                  <div
                                    key={i}
                                    className="dashboard-perf-skeleton-card dashboard-perf-skeleton-card--compact"
                                    style={{ animationDelay: `${i * 0.05}s` }}
                                  />
                                ))}
                              </div>
                            )}

                            {!snapshotLoading &&
                              !growthLoading &&
                              (performanceSnapshotHasKpis || performanceGrowthHasKpis) && (
                                <>
                                  <div className="dashboard-perf-metrics-grid">
                                    {snapshot?.current_period?.views != null && (
                                      <div className="dashboard-perf-metric">
                                        <div className="dashboard-perf-metric-label">Views</div>
                                        <div className="dashboard-perf-metric-value">
                                          {formatCount(snapshot.current_period.views)}
                                        </div>
                                        {snapshot.previous_period?.views != null && (
                                          <div
                                            className={`dashboard-perf-metric-delta ${snapshot.current_period.views - snapshot.previous_period.views >= 0 ? 'positive' : 'negative'}`}
                                          >
                                            {snapshot.current_period.views -
                                              snapshot.previous_period.views >=
                                            0
                                              ? '↑'
                                              : '↓'}{' '}
                                            vs prior 30d
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {snapshot?.current_period?.watch_time_hours != null && (
                                      <div className="dashboard-perf-metric">
                                        <div className="dashboard-perf-metric-label">
                                          Watch time
                                        </div>
                                        <div className="dashboard-perf-metric-value">
                                          {Number(snapshot.current_period.watch_time_hours).toFixed(
                                            1
                                          )}
                                          <span className="dashboard-perf-metric-unit">h</span>
                                        </div>
                                      </div>
                                    )}
                                    {snapshot?.current_period?.video_count != null && (
                                      <div className="dashboard-perf-metric">
                                        <div className="dashboard-perf-metric-label">
                                          30d uploads
                                        </div>
                                        <div className="dashboard-perf-metric-value">
                                          {snapshot.current_period.video_count}
                                        </div>
                                      </div>
                                    )}
                                    {snapshot?.current_period?.views_per_video != null && (
                                      <div className="dashboard-perf-metric">
                                        <div className="dashboard-perf-metric-label">
                                          Views / video
                                        </div>
                                        <div className="dashboard-perf-metric-value">
                                          {Number(snapshot.current_period.views_per_video).toFixed(
                                            0
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    {growth && growth.subs_current != null && (
                                      <div className="dashboard-perf-metric">
                                        <div className="dashboard-perf-metric-label">
                                          Subscribers
                                        </div>
                                        <div className="dashboard-perf-metric-value">
                                          {formatCount(growth.subs_current)}
                                        </div>
                                      </div>
                                    )}
                                    {growth && growth.views_velocity_7d != null && (
                                      <div className="dashboard-perf-metric">
                                        <div className="dashboard-perf-metric-label">
                                          Views / day (7d)
                                        </div>
                                        <div className="dashboard-perf-metric-value">
                                          {Number(growth.views_velocity_7d).toFixed(1)}
                                        </div>
                                      </div>
                                    )}
                                    {growth && growth.views_velocity_30d != null && (
                                      <div className="dashboard-perf-metric">
                                        <div className="dashboard-perf-metric-label">
                                          Views / day (30d)
                                        </div>
                                        <div className="dashboard-perf-metric-value">
                                          {Number(growth.views_velocity_30d).toFixed(1)}
                                        </div>
                                      </div>
                                    )}
                                    {growth && growth.projected_views_30d != null && (
                                      <div className="dashboard-perf-metric">
                                        <div className="dashboard-perf-metric-label">
                                          Projected views (30d)
                                        </div>
                                        <div className="dashboard-perf-metric-value">
                                          {formatCount(Math.round(growth.projected_views_30d))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  {growthScenario && (
                                    <div className="dashboard-perf-outlook" role="note">
                                      <div className="dashboard-perf-outlook-row">
                                        <span className="dashboard-perf-outlook-baseline">
                                          {growthScenario.baseline}
                                        </span>
                                        <span className="dashboard-perf-outlook-arrow" aria-hidden>
                                          →
                                        </span>
                                        <span className="dashboard-perf-outlook-opp">
                                          {growthScenario.opportunity} if pace improves
                                        </span>
                                      </div>
                                      <span className="dashboard-perf-outlook-lever">
                                        Levers: {growthScenario.lever}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}

                            {!snapshotLoading &&
                              !growthLoading &&
                              !performanceSnapshotHasKpis &&
                              !performanceGrowthHasKpis && (
                                <div className="dashboard-perf-zone-empty dashboard-perf-zone-empty--inline">
                                  <p>No channel metrics yet</p>
                                </div>
                              )}

                            <hr className="dashboard-card-divider" />

                            <div className="dashboard-performance-block dashboard-performance-block--best-time">
                              <div className="dashboard-performance-block-head dashboard-performance-block-head--tight">
                                <div className="dashboard-performance-block-head-text">
                                  <h3 className="dashboard-performance-block-title">
                                    Best time to post
                                  </h3>
                                  <p className="dashboard-performance-unified-sub dashboard-performance-unified-sub--micro">
                                    Based on your upload history and how those videos performed by
                                    hour.
                                  </p>
                                </div>
                              </div>
                              {bestTimeLoading && (
                                <div
                                  className="dashboard-perf-skeleton-line dashboard-perf-skeleton-line--compact"
                                  aria-busy
                                  aria-label="Loading schedule"
                                />
                              )}
                              {!bestTimeLoading && bestTime && (
                                <>
                                  {Array.isArray(bestTime.recommended_slots) &&
                                    bestTime.recommended_slots.length > 0 && (
                                      <div className="dashboard-best-time-hero dashboard-best-time-hero--unified">
                                        <p className="dashboard-best-time-primary">
                                          <span className="dashboard-best-time-primary-label">
                                            Top pick
                                          </span>
                                          <span className="dashboard-best-time-primary-value">
                                            {bestTime.recommended_slots[0].label ??
                                              `${bestTime.recommended_slots[0].day} ${bestTime.recommended_slots[0].hour}:00`}
                                          </span>
                                        </p>
                                        {bestTime.recommended_slots.length > 1 && (
                                          <div
                                            className="dashboard-best-time-slots"
                                            aria-label="Other suggested slots"
                                          >
                                            {bestTime.recommended_slots
                                              .slice(1, 5)
                                              .map((slot, i) => (
                                                <span
                                                  key={i}
                                                  className="dashboard-best-time-slot dashboard-best-time-slot--compact"
                                                >
                                                  {slot.label ?? `${slot.day} ${slot.hour}:00`}
                                                </span>
                                              ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  {Array.isArray(bestTime.bar_chart_data) &&
                                    bestTime.bar_chart_data.length > 0 &&
                                    bestTimeUploadTotal >= 3 && (
                                      <div className="dashboard-best-time-chart-wrap dashboard-best-time-chart-wrap--unified">
                                        <div className="dashboard-best-time-chart-head">
                                          <span className="dashboard-best-time-chart-title">
                                            Performance by hour
                                          </span>
                                          <span className="dashboard-best-time-chart-axis">
                                            Hover bars for detail
                                          </span>
                                        </div>
                                        <div
                                          className="dashboard-best-time-chart"
                                          role="img"
                                          aria-label="Best upload time by hour"
                                        >
                                          {bestTime.bar_chart_data.map((bar, i) => (
                                            <button
                                              key={i}
                                              type="button"
                                              className={`dashboard-best-time-bar ${bar.is_recommended ? 'recommended' : ''}`}
                                              style={{
                                                height: `${Math.max(8, bar.height_pct || 0)}%`,
                                              }}
                                              aria-label={`${bar.time_label}: ${bar.tooltip?.title ?? ''}`}
                                            >
                                              <span className="dashboard-best-time-tooltip">
                                                <span className="dashboard-best-time-tooltip-title">
                                                  {bar.tooltip?.title ?? bar.time_label}
                                                </span>
                                                {bar.tooltip != null &&
                                                  Number(bar.tooltip.uploads) > 0 && (
                                                    <span className="dashboard-best-time-tooltip-meta">
                                                      Avg{' '}
                                                      {Number(
                                                        bar.tooltip.average_views ?? 0
                                                      ).toFixed(0)}{' '}
                                                      views · Score{' '}
                                                      {Number(bar.tooltip.score ?? 0).toFixed(0)}
                                                    </span>
                                                  )}
                                              </span>
                                              <span className="dashboard-best-time-bar-label">
                                                {bar.short_label ?? bar.time_label}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  {Array.isArray(bestTime.bar_chart_data) &&
                                    bestTime.bar_chart_data.length > 0 &&
                                    bestTimeUploadTotal === 0 && (
                                      <div className="dashboard-perf-chart-gate">
                                        <p className="dashboard-perf-chart-gate-title">
                                          Hourly chart
                                        </p>
                                        <p className="dashboard-perf-chart-gate-body">
                                          Publish a few videos so we can compare which upload hours
                                          earn the best average views for your channel.
                                        </p>
                                      </div>
                                    )}
                                  {Array.isArray(bestTime.bar_chart_data) &&
                                    bestTime.bar_chart_data.length > 0 &&
                                    bestTimeUploadTotal > 0 &&
                                    bestTimeUploadTotal < 3 && (
                                      <div className="dashboard-perf-chart-gate">
                                        <p className="dashboard-perf-chart-gate-title">
                                          Hourly chart
                                        </p>
                                        <p className="dashboard-perf-chart-gate-body">
                                          {bestTimeUploadTotal} of 3 uploads in this window —
                                          publish {3 - bestTimeUploadTotal} more{' '}
                                          {3 - bestTimeUploadTotal === 1 ? 'video' : 'videos'} to
                                          unlock the chart (needs enough data to compare hours
                                          without one outlier skewing the bars).
                                        </p>
                                      </div>
                                    )}
                                  {(!bestTime.bar_chart_data ||
                                    bestTime.bar_chart_data.length === 0) &&
                                    !bestTime.recommended_slots?.length && (
                                      <div className="dashboard-empty dashboard-empty--tight dashboard-empty--performance-muted">
                                        No schedule data yet
                                      </div>
                                    )}
                                </>
                              )}
                              {!bestTimeLoading && !bestTime && (
                                <div className="dashboard-perf-zone-empty dashboard-perf-zone-empty--inline">
                                  <p>No schedule data</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
