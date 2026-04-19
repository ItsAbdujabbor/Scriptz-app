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
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <path d="M20 8v6" />
    <path d="M23 11h-6" />
  </svg>
)
const IconViews = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
)
const IconUploads = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M12 15V9" />
    <path d="m9.5 11.5 2.5-2.5 2.5 2.5" />
  </svg>
)
const IconChartUp = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19h16" />
    <path d="m5 15 4-4 3 3 7-7" />
    <path d="M16 7h3v3" />
  </svg>
)
const IconInfo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v5" />
    <path d="M12 7.5h.01" />
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

function formatGrowthPercent(value) {
  if (!Number.isFinite(value)) return '0%'
  const rounded = Math.round(value * 10) / 10
  if (rounded > 0) return `+${rounded}%`
  if (rounded < 0) return `${rounded}%`
  return '0%'
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
  const [overviewInfoOpen, setOverviewInfoOpen] = useState(null)
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
    return insights.script_suggestions.filter(Boolean).slice(0, 4)
  }, [insights])

  const audit = auditQuery.data
  const auditLoading = auditQuery.isPending

  const growth = growthQuery.data
  const growthLoading = growthQuery.isPending

  const snapshot = snapshotQuery.data
  const snapshotLoading = snapshotQuery.isPending

  const bestTime = bestTimeQuery.data
  const bestTimeLoading = bestTimeQuery.isPending

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
  const uploadsGrowth = getPercentChange(snapshot?.current_period?.video_count, snapshot?.previous_period?.video_count)
  const avgViewsGrowth = getPercentChange(snapshot?.current_period?.views_per_video, prevViewsPerVideo)
  const overviewCards = [
    {
      key: 'subscribers',
      className: 'dashboard-overview-stat--subscribers',
      icon: <IconUsers />,
      value: formatCount(youtube.subscriberCount ?? youtube.subscriber_count) ?? '—',
      label: 'Subscribers',
      growth: subscribersGrowth,
      subtext: 'People currently subscribed\nto your YouTube channel.',
      tooltip: 'Your total current subscriber count pulled from the connected channel.',
    },
    {
      key: 'views',
      className: 'dashboard-overview-stat--views',
      icon: <IconViews />,
      value: formatCount(youtube.viewCount ?? youtube.view_count) ?? '—',
      label: 'Views',
      growth: viewsGrowth,
      subtext: 'Total views across all\nvideos on your channel.',
      tooltip: 'This is the lifetime channel view count from your connected YouTube account.',
    },
    {
      key: 'uploads',
      className: 'dashboard-overview-stat--uploads',
      icon: <IconUploads />,
      value: formatCount(youtube.videoCount ?? youtube.video_count) ?? '—',
      label: 'Uploads',
      growth: uploadsGrowth,
      subtext: 'Videos currently live\non this channel now.',
      tooltip: 'The number of uploaded videos currently available on the connected channel.',
    },
    {
      key: 'avg-views',
      className: 'dashboard-overview-stat--avg-views',
      icon: <IconChartUp />,
      value: avgViewsCount != null ? formatCount(avgViewsCount) : '—',
      label: 'Avg views',
      growth: avgViewsGrowth,
      subtext: 'Average views earned\nper uploaded video.',
      tooltip: 'Calculated as total channel views divided by total uploads for a quick performance benchmark.',
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
                  {youtube.avatar ? (
                    <img src={youtube.avatar} alt="" className="dashboard-channel-pill-avatar" />
                  ) : (
                    <span className="dashboard-channel-pill-avatar dashboard-channel-pill-avatar--fallback">
                      {(youtube.channelName || 'Y')[0]}
                    </span>
                  )}
                  <span className="dashboard-channel-pill-name">{youtube.channelName || 'My Channel'}</span>
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
                  Here is your channel snapshot for today. {todayLabel}
                </p>
              </div>
              <div className="dashboard-overview-card">
                <div className="dashboard-overview-stats">
                  {overviewCards.map((card) => {
                    const growthValue = Number.isFinite(card.growth) ? card.growth : 0
                    const growthClass = growthValue > 0 ? 'is-positive' : growthValue < 0 ? 'is-negative' : 'is-neutral'
                    const isInfoOpen = overviewInfoOpen === card.key

                    return (
                      <article
                        key={card.key}
                        className={`dashboard-overview-stat ${card.className} ${isInfoOpen ? 'is-info-open' : ''}`}
                        onMouseLeave={() => {
                          if (overviewInfoOpen === card.key) setOverviewInfoOpen(null)
                        }}
                      >
                        <div className="dashboard-overview-stat-head">
                          <span className="dashboard-overview-stat-icon" aria-hidden>{card.icon}</span>
                          <span className={`dashboard-overview-stat-growth ${growthClass}`}>
                            {formatGrowthPercent(growthValue)}
                          </span>
                        </div>
                        <span className="dashboard-overview-stat-value">{card.value}</span>
                        <div className="dashboard-overview-stat-meta">
                          <span className="dashboard-overview-stat-label">{card.label}</span>
                        </div>
                        <div className="dashboard-overview-stat-footer">
                          <p className="dashboard-overview-stat-subtext">
                            {card.subtext.split('\n').map((line, lineIndex) => (
                              <span key={lineIndex}>
                                {line}
                                {lineIndex === 0 ? <br /> : null}
                              </span>
                            ))}
                          </p>
                          <button
                            type="button"
                            className="dashboard-overview-stat-info"
                            aria-label={`More info about ${card.label}`}
                            aria-pressed={isInfoOpen}
                            onMouseEnter={() => setOverviewInfoOpen(card.key)}
                            onFocus={() => setOverviewInfoOpen(card.key)}
                            onBlur={() => setOverviewInfoOpen(null)}
                            onClick={() => setOverviewInfoOpen((prev) => (prev === card.key ? null : card.key))}
                          >
                            <IconInfo />
                          </button>
                        </div>
                        <div className="dashboard-overview-stat-info-panel" aria-hidden={!isInfoOpen}>
                          <div className="dashboard-overview-stat-info-panel-head">
                            <span className="dashboard-overview-stat-info-panel-label">{card.label}</span>
                            <button
                              type="button"
                              className="dashboard-overview-stat-info-close"
                              aria-label={`Close ${card.label} info`}
                              onClick={() => setOverviewInfoOpen(null)}
                            >
                              ×
                            </button>
                          </div>
                          <p className="dashboard-overview-stat-info-copy">{card.tooltip}</p>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          {/* AI Insights — script ideas */}
          <section className="dashboard-section">
            <h2 className="dashboard-section-title">
              <span className="dashboard-section-icon" aria-hidden>◇</span>
              AI Insights
            </h2>
            {insightsLoading && (
              <div className="dashboard-loading">
                <span className="dashboard-loading-spinner" /> Loading insights…
              </div>
            )}
            {insightsError && (
              <div className="dashboard-ai-card">
                <p className="dashboard-error">{insightsError}</p>
                <button
                  type="button"
                  className="dashboard-btn dashboard-btn-ghost"
                  onClick={() => insightsQuery.refetch()}
                >
                  Retry
                </button>
              </div>
            )}
            {!insightsLoading && !insightsError && insights && (
              <>
                {visibleScriptIdeas.length > 0 && (
                  <div className="dashboard-ai-card">
                    <div className="dashboard-script-ideas-head">
                      <div>
                        <h3>Weekly recommendations</h3>
                        <p className="dashboard-script-ideas-subtitle">
                          Four fresh ideas in one row. Feedback helps tune what you see next.
                        </p>
                      </div>
                      <span className="dashboard-script-ideas-badge">Updates weekly</span>
                    </div>
                    {ideaFeedbackNotice && (
                      <div className={`dashboard-inline-notice dashboard-inline-notice--${ideaFeedbackNotice.tone}`} role="status">
                        {ideaFeedbackNotice.text}
                      </div>
                    )}
                    <div className="dashboard-script-ideas">
                      {visibleScriptIdeas.map((idea, i) => {
                        const title = idea?.idea_title ?? idea?.title ?? 'Idea'
                        const script = idea?.short_script ?? idea?.script ?? idea?.description
                        const key = `${title}-${i}`
                        const sending = ideaFeedbackSending === `${title}-true` || ideaFeedbackSending === `${title}-false`
                        const tags = [
                          idea?.hook_concept,
                          idea?.angle,
                          idea?.target_emotion,
                          idea?.expected_audience,
                        ].filter(Boolean).slice(0, 2)
                        return (
                          <div key={key} className="dashboard-script-idea">
                            <div className="dashboard-script-idea-top">
                              <span className="dashboard-script-idea-index">0{i + 1}</span>
                            </div>
                            <div className="dashboard-script-idea-title">{title}</div>
                            {script && <div className="dashboard-script-idea-script">{script}</div>}
                            {tags.length > 0 && (
                              <div className="dashboard-script-idea-tags">
                                {tags.map((tag) => (
                                  <span key={tag} className="dashboard-script-idea-tag">{tag}</span>
                                ))}
                              </div>
                            )}
                            <div className="dashboard-script-idea-actions">
                              <button type="button" className="dashboard-script-idea-btn-yes" disabled={sending} onClick={() => handleIdeaFeedback(idea, true)}>
                                {sending ? 'Saving…' : 'Interested'}
                              </button>
                              <button type="button" className="dashboard-script-idea-btn-no" disabled={sending} onClick={() => handleIdeaFeedback(idea, false)}>
                                Not interested
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {!insightsError && insights && !visibleScriptIdeas.length && (
                  <div className="dashboard-ai-card dashboard-empty">No recommendations left for this week. New ideas will appear with your next refresh cycle.</div>
                )}
              </>
            )}
          </section>

          {/* Channel Audit (channel required) */}
          {channelId && (
            <section className="dashboard-section">
              <h2 className="dashboard-section-title">
                <span className="dashboard-section-icon" aria-hidden>◇</span>
                Channel audit
              </h2>
              {auditLoading && <div className="dashboard-loading"><span className="dashboard-loading-spinner" /> Loading audit…</div>}
              {!auditLoading && audit && (
                <div className="dashboard-ai-card">
                  <div className="dashboard-audit-overall">Overall: {audit.overall_score ?? 0}/100</div>
                  {Array.isArray(audit.scores) && audit.scores.length > 0 && (
                    <div className="dashboard-audit-scores">
                      {audit.scores.map((s, i) => (
                        <div key={i} className="dashboard-audit-score-item">
                          <div className="dashboard-audit-score-name">{s.name ?? s.label}</div>
                          <div className="dashboard-audit-score-value">{s.score ?? 0}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {Array.isArray(audit.actionable_fixes) && audit.actionable_fixes.length > 0 && (
                    <div className="dashboard-audit-fixes">
                      <h4>Actionable fixes</h4>
                      <ul>
                        {audit.actionable_fixes.map((fix, i) => (
                          <li key={i}>{typeof fix === 'string' ? fix : (fix?.title ?? fix?.text ?? fix?.fix ?? JSON.stringify(fix))}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* KPI Snapshot (channel required) */}
          {channelId && (
            <section className="dashboard-section">
              <h2 className="dashboard-section-title">
                <span className="dashboard-section-icon" aria-hidden>◇</span>
                KPI snapshot (last 30 days)
              </h2>
              {snapshotLoading && <div className="dashboard-loading"><span className="dashboard-loading-spinner" /> Loading…</div>}
              {!snapshotLoading && snapshot && (
                <div className="dashboard-ai-card">
                  <div className="dashboard-snapshot-grid">
                    {snapshot.current_period?.views != null && (
                      <div className="dashboard-snapshot-item">
                        <div className="dashboard-snapshot-label">Views</div>
                        <div className="dashboard-snapshot-value">{formatCount(snapshot.current_period.views)}</div>
                        {snapshot.previous_period?.views != null && (
                          <div className={`dashboard-snapshot-delta ${(snapshot.current_period.views - snapshot.previous_period.views) >= 0 ? 'positive' : 'negative'}`}>
                            {(snapshot.current_period.views - snapshot.previous_period.views) >= 0 ? '↑' : '↓'} vs previous period
                          </div>
                        )}
                      </div>
                    )}
                    {snapshot.current_period?.watch_time_hours != null && (
                      <div className="dashboard-snapshot-item">
                        <div className="dashboard-snapshot-label">Watch time (h)</div>
                        <div className="dashboard-snapshot-value">{Number(snapshot.current_period.watch_time_hours).toFixed(1)}</div>
                      </div>
                    )}
                    {snapshot.current_period?.video_count != null && (
                      <div className="dashboard-snapshot-item">
                        <div className="dashboard-snapshot-label">Videos</div>
                        <div className="dashboard-snapshot-value">{snapshot.current_period.video_count}</div>
                      </div>
                    )}
                    {snapshot.current_period?.views_per_video != null && (
                      <div className="dashboard-snapshot-item">
                        <div className="dashboard-snapshot-label">Views/video</div>
                        <div className="dashboard-snapshot-value">{Number(snapshot.current_period.views_per_video).toFixed(0)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Growth */}
          {channelId && (
            <section className="dashboard-section">
              <h2 className="dashboard-section-title">
                <span className="dashboard-section-icon" aria-hidden>◇</span>
                Growth
              </h2>
              {growthLoading && <div className="dashboard-loading"><span className="dashboard-loading-spinner" /> Loading…</div>}
              {!growthLoading && growth && (
                <div className="dashboard-ai-card">
                  <div className="dashboard-growth-stats">
                    {growth.subs_current != null && (
                      <div className="dashboard-growth-stat">
                        <div className="dashboard-growth-stat-label">Subs</div>
                        <div className="dashboard-growth-stat-value">{formatCount(growth.subs_current)}</div>
                      </div>
                    )}
                    {growth.views_velocity_7d != null && (
                      <div className="dashboard-growth-stat">
                        <div className="dashboard-growth-stat-label">Views velocity (7d)</div>
                        <div className="dashboard-growth-stat-value">{Number(growth.views_velocity_7d).toFixed(1)}</div>
                      </div>
                    )}
                    {growth.views_velocity_30d != null && (
                      <div className="dashboard-growth-stat">
                        <div className="dashboard-growth-stat-label">Views velocity (30d)</div>
                        <div className="dashboard-growth-stat-value">{Number(growth.views_velocity_30d).toFixed(1)}</div>
                      </div>
                    )}
                    {growth.projected_views_30d != null && (
                      <div className="dashboard-growth-stat">
                        <div className="dashboard-growth-stat-label">Projected views (30d)</div>
                        <div className="dashboard-growth-stat-value">{formatCount(Math.round(growth.projected_views_30d))}</div>
                      </div>
                    )}
                  </div>
                  {growth.message && <p className="dashboard-section-subtitle">{growth.message}</p>}
                </div>
              )}
            </section>
          )}

          {/* Best time to post */}
          {channelId && (
            <section className="dashboard-section">
              <h2 className="dashboard-section-title">
                <span className="dashboard-section-icon" aria-hidden>◇</span>
                Best time to post
              </h2>
              {bestTimeLoading && <div className="dashboard-loading"><span className="dashboard-loading-spinner" /> Loading…</div>}
              {!bestTimeLoading && bestTime && (
                <div className="dashboard-ai-card">
                  {bestTime.summary && <p className="dashboard-section-subtitle">{bestTime.summary}</p>}
                  {Array.isArray(bestTime.recommended_slots) && bestTime.recommended_slots.length > 0 && (
                    <div className="dashboard-best-time-slots">
                      {bestTime.recommended_slots.slice(0, 5).map((slot, i) => (
                        <span key={i} className="dashboard-best-time-slot">{slot.label ?? `${slot.day} ${slot.hour}:00`}</span>
                      ))}
                    </div>
                  )}
                  {Array.isArray(bestTime.bar_chart_data) && bestTime.bar_chart_data.length > 0 && (
                    <div className="dashboard-best-time-chart" role="img" aria-label="Best upload time by hour">
                      {bestTime.bar_chart_data.map((bar, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`dashboard-best-time-bar ${bar.is_recommended ? 'recommended' : ''}`}
                          style={{ height: `${Math.max(8, bar.height_pct || 0)}%` }}
                          title={bar.tooltip?.title}
                        >
                          <span className="dashboard-best-time-tooltip">
                            <strong>{bar.tooltip?.title ?? bar.time_label}</strong>
                            {bar.tooltip?.subtitle && <small>{bar.tooltip.subtitle}</small>}
                            {bar.tooltip?.uploads != null && <small>{bar.tooltip.uploads} uploads</small>}
                          </span>
                          <span className="dashboard-best-time-bar-label">{bar.short_label ?? bar.time_label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {(!bestTime.bar_chart_data || bestTime.bar_chart_data.length === 0) && (!bestTime.recommended_slots?.length) && (
                    <div className="dashboard-empty">Not enough upload history for best-time analysis.</div>
                  )}
                </div>
              )}
            </section>
          )}

          </div>
        </main>
      </div>
    </div>
  )
}
