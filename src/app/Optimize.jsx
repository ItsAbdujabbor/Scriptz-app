import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../stores/authStore'
import { useOnboardingStore } from '../stores/onboardingStore'
import { youtubeApi } from '../api/youtube'
import { Sidebar } from './Sidebar'
import { SettingsModal } from './SettingsModal'
import { VideoOptimizeModal } from './VideoOptimizeModal'
import { useYoutubeVideosList } from '../queries/youtube/videosQueries'
import { useUserPreferencesQuery } from '../queries/user/preferencesQueries'
import { useUserProfileQuery } from '../queries/user/profileQueries'
import { queryKeys } from '../lib/query/queryKeys'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import { AppShellLayout } from '../components/AppShellLayout'
import { Loading } from '../components/Loading'
/* Sidebar.css, SettingsModal.css, Dashboard.css imported by AuthenticatedRoutes */
import './Optimize.css'

const PER_PAGE = 15
const SORT_OPTIONS = [
  { value: 'published_at', label: 'Latest' },
  { value: 'views', label: 'Popular' },
  { value: 'engagement', label: 'Engagement' },
]
const VIDEO_TYPE_OPTIONS = [
  { value: 'videos', label: 'Videos' },
  { value: 'shorts', label: 'Shorts' },
]

function formatEngagement(rate) {
  if (rate == null || rate === '') return null
  const n = Number(rate)
  if (isNaN(n)) return null
  const pct = n <= 1 ? n * 100 : n
  return `${pct.toFixed(1)}%`
}

function formatCount(n) {
  if (n == null || n === '') return '—'
  const num = typeof n === 'number' ? n : parseInt(String(n).replace(/\D/g, ''), 10)
  if (isNaN(num)) return String(n)
  if (num >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (num >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (num >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(num)
}

function postedDaysAgo(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const now = new Date()
    const days = Math.floor((now - d) / (24 * 60 * 60 * 1000))
    if (days <= 0) return 'Today'
    if (days === 1) return '1 day ago'
    if (days < 30) return days + ' days ago'
    if (days < 365) return Math.floor(days / 30) + ' mo ago'
    return Math.floor(days / 365) + ' yr ago'
  } catch (_e) {
    return iso
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.04,
      duration: 0.35,
      ease: [0.33, 1, 0.68, 1],
    },
  }),
  exit: { opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.2 } },
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04 },
  },
}

export function Optimize({ onLogout, shellManaged }) {
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
    syncChannelToBackend,
    syncToBackend,
    bootstrapYouTube,
  } = useOnboardingStore()

  const queryClient = useQueryClient()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState('account')
  const [youtubeChannels, setYoutubeChannels] = useState([])
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeOAuthError, setYoutubeOAuthError] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [videoType, setVideoType] = useState('videos')
  const [sort, setSort] = useState('published_at')
  const [page, setPage] = useState(1)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [dashPrefillBanner, setDashPrefillBanner] = useState(null)
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
  const sortDropdownRef = useRef(null)

  const closeSortDropdown = useCallback((e) => {
    if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target)) {
      setSortDropdownOpen(false)
    }
  }, [])

  useEffect(() => {
    if (sortDropdownOpen) {
      document.addEventListener('mousedown', closeSortDropdown)
      return () => document.removeEventListener('mousedown', closeSortDropdown)
    }
  }, [sortDropdownOpen, closeSortDropdown])

  const userPreferencesQuery = useUserPreferencesQuery()
  const userProfileQuery = useUserProfileQuery()
  const prefsHydratedRef = useRef(false)
  const profileHydratedRef = useRef(false)

  useEffect(() => {
    if (prefsHydratedRef.current) return
    const prefs = userPreferencesQuery.data
    if (!prefs || typeof prefs !== 'object') return
    if (prefs.preferredLanguage != null) setPreferredLanguage(prefs.preferredLanguage)
    if (prefs.niche != null) setNiche(prefs.niche)
    if (prefs.videoFormat != null) setVideoFormat(prefs.videoFormat)
    if (prefs.uploadFrequency != null) setUploadFrequency(prefs.uploadFrequency)
    prefsHydratedRef.current = true
  }, [
    userPreferencesQuery.data,
    setNiche,
    setPreferredLanguage,
    setUploadFrequency,
    setVideoFormat,
  ])

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
  }, [
    userProfileQuery.data,
    setIncludePersonalStories,
    setPreferredCtaStyle,
    setPreferredTone,
    setSpeakingStyle,
    setUseFirstPerson,
    setNiche,
    setUploadFrequency,
    setVideoFormat,
  ])

  const channelId = youtube?.channelId || youtube?.channel_id || null

  const videosQuery = useYoutubeVideosList({
    channelId,
    page,
    perPage: PER_PAGE,
    search: searchQuery,
    sort,
    videoType,
    enabled: !!youtube?.connected,
  })

  const videos = videosQuery.data?.items ?? []
  const videosLoading = videosQuery.isPending
  const videosError = videosQuery.isError
    ? videosQuery.error?.message || 'Failed to load videos'
    : null
  const totalPages = videosQuery.data?.total_pages ?? 1

  // No auto-prefetch — user triggers AI generation manually inside the optimize screen
  const prefetchVideoOptimization = () => {}

  const openSettings = (section) => {
    setSettingsSection(section ?? 'account')
    setSettingsOpen(true)
  }

  useEffect(() => {
    clearError?.()
  }, [clearError])

  useEffect(() => {
    const parseDashPrefill = () => {
      const hash = typeof window !== 'undefined' ? window.location.hash || '' : ''
      const normalized = hash.replace(/^#/, '')
      const [path, qs = ''] = normalized.split('?')
      if (path !== 'optimize') {
        setDashPrefillBanner(null)
        return
      }
      const params = new URLSearchParams(qs)
      const raw = params.get('prefill')
      if (!raw) {
        setDashPrefillBanner(null)
        return
      }
      try {
        setDashPrefillBanner(decodeURIComponent(raw))
      } catch {
        setDashPrefillBanner(raw)
      }
      stripPrefillFromHash()
    }
    parseDashPrefill()
    window.addEventListener('hashchange', parseDashPrefill)
    return () => window.removeEventListener('hashchange', parseDashPrefill)
  }, [])

  useEffect(() => {
    let cancelled = false
    getValidAccessToken().then(async (token) => {
      if (!token || cancelled) return
      try {
        const bootstrap = await bootstrapYouTube(token)
        if (!cancelled) setYoutubeChannels(bootstrap.channels || [])
      } catch (_) {
        if (!cancelled) setYoutubeChannels([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [bootstrapYouTube, getValidAccessToken])

  useEffect(() => {
    // When filters change, show the first page of the new result set.
    setPage(1) // eslint-disable-line react-hooks/set-state-in-effect
  }, [youtube?.connected, searchQuery, videoType, sort])

  const handleSearch = () => {
    setSearchQuery(searchInput)
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
      await syncToBackend(token)
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
      await syncChannelToBackend(token, channelId, info)
      await syncToBackend(token)
      queryClient.invalidateQueries({ queryKey: queryKeys.user.preferences })
    } catch (_) {}
    setYoutubeLoading(false)
  }

  const handleLogout = async () => {
    await logout()
    onLogout?.()
  }

  const showGrid = youtube?.connected && !videosLoading && !videosError && videos.length > 0
  const showEmpty = youtube?.connected && !videosLoading && !videosError && videos.length === 0
  const emptyFromSearch = showEmpty && searchQuery.trim().length > 0
  const showError = youtube?.connected && !videosLoading && videosError
  const showLoading = youtube?.connected && videosLoading && videos.length === 0

  // When a video is selected, show the optimize screen instead of the grid
  if (selectedVideo) {
    return (
      <VideoOptimizeModal
        open={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
        video={selectedVideo}
        getValidAccessToken={getValidAccessToken}
        channelId={channelId}
        channelTitle={youtube?.channel_title}
      />
    )
  }

  const innerContent = (
    <>
      <div className="dashboard-main-scroll">
        <div className="dashboard-main dashboard-main--subpage">
          <div className="dashboard-content-shell dashboard-content-shell--page">
            <motion.div
              className="optimize-page"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
            >
              <div className="optimize-top-bar">
                <div className="optimize-heading-wrap">
                  <h1 className="optimize-heading">Optimize</h1>
                </div>
                <div className="optimize-search-wrap">
                  <span className="optimize-search-icon" aria-hidden>
                    <svg
                      width="18"
                      height="18"
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
                  </span>
                  <input
                    type="search"
                    className="optimize-search-input"
                    placeholder="Search videos…"
                    aria-label="Search videos"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button
                    type="button"
                    className="optimize-search-btn"
                    onClick={handleSearch}
                    disabled={videosLoading}
                    aria-label="Search"
                  >
                    Search
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {dashPrefillBanner && (
                  <motion.div
                    className="optimize-dash-prefill"
                    role="status"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.25, ease: [0.33, 1, 0.68, 1] }}
                  >
                    <p className="optimize-dash-prefill-text">{dashPrefillBanner}</p>
                    <button
                      type="button"
                      className="optimize-dash-prefill-dismiss"
                      onClick={() => setDashPrefillBanner(null)}
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="optimize-divider" aria-hidden />

              <div className="optimize-filters-bar">
                <div className="optimize-tabrow">
                  <nav className="optimize-tabs" aria-label="Filter by type">
                    {VIDEO_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`optimize-tab ${videoType === opt.value ? 'optimize-tab--active' : ''}`}
                        onClick={() => setVideoType(opt.value)}
                        aria-selected={videoType === opt.value}
                      >
                        {opt.label}
                        {videoType === opt.value && (
                          <motion.span
                            className="optimize-tab-indicator"
                            layoutId="optimize-tab-indicator"
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          />
                        )}
                      </button>
                    ))}
                  </nav>
                </div>
                <div className="optimize-filters-right">
                  <div
                    className={`optimize-sort-dropdown${sortDropdownOpen ? ' optimize-sort-dropdown--open' : ''}`}
                    ref={sortDropdownRef}
                  >
                    <button
                      type="button"
                      className="optimize-sort-trigger"
                      onClick={() => setSortDropdownOpen((o) => !o)}
                      aria-haspopup="listbox"
                      aria-expanded={sortDropdownOpen}
                      aria-label="Sort by"
                    >
                      <span className="optimize-sort-label">
                        {SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Sort'}
                      </span>
                      <svg
                        className="optimize-sort-chevron"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    <AnimatePresence>
                      {sortDropdownOpen && (
                        <motion.ul
                          className="optimize-sort-menu"
                          role="listbox"
                          initial={{ opacity: 0, y: 6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.97 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {SORT_OPTIONS.map((opt) => (
                            <li key={opt.value} role="option" aria-selected={sort === opt.value}>
                              <button
                                type="button"
                                className={`optimize-sort-option${sort === opt.value ? ' optimize-sort-option--active' : ''}`}
                                onClick={() => {
                                  setSort(opt.value)
                                  setSortDropdownOpen(false)
                                }}
                              >
                                {opt.label}
                                {sort === opt.value && (
                                  <svg
                                    className="optimize-sort-check"
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="optimize-divider optimize-divider--below-filters" aria-hidden />

              <AnimatePresence mode="wait">
                {!youtube?.connected && (
                  <motion.div
                    key="not-connected"
                    className="optimize-state optimize-state-empty"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35, ease: [0.33, 1, 0.68, 1] }}
                  >
                    <div className="optimize-empty-card">
                      <span className="optimize-empty-icon" aria-hidden>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </span>
                      <h3 className="optimize-empty-title">Connect YouTube</h3>
                      <p className="optimize-empty-desc">
                        Connect your channel to see and optimize your videos here.
                      </p>
                    </div>
                  </motion.div>
                )}

                {showLoading && (
                  <motion.div
                    key="loading"
                    className="optimize-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Loading size="lg" layout="page" message="Loading videos…" />
                  </motion.div>
                )}

                {showError && (
                  <motion.div
                    key="error"
                    className="optimize-state optimize-state-error"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    <p>{videosError}</p>
                  </motion.div>
                )}

                {showEmpty && (
                  <motion.div
                    key="empty"
                    className="optimize-state optimize-state-empty"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.35, ease: [0.33, 1, 0.68, 1] }}
                  >
                    <div className="optimize-empty-card">
                      {emptyFromSearch ? (
                        <>
                          <span className="optimize-empty-icon" aria-hidden>
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="11" cy="11" r="8" />
                              <path d="m21 21-4.35-4.35" />
                            </svg>
                          </span>
                          <h3 className="optimize-empty-title">
                            No results for &ldquo;{searchQuery.trim()}&rdquo;
                          </h3>
                          <p className="optimize-empty-desc">
                            Try a different search term or clear the search to see all your{' '}
                            {videoType === 'shorts' ? 'Shorts' : 'videos'}.
                          </p>
                          <button
                            type="button"
                            className="optimize-empty-action"
                            onClick={() => {
                              setSearchInput('')
                              setSearchQuery('')
                            }}
                          >
                            Clear search
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="optimize-empty-icon" aria-hidden>
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="m22 8-6 4 6 4V8Z" />
                              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                            </svg>
                          </span>
                          <h3 className="optimize-empty-title">
                            No {videoType === 'shorts' ? 'Shorts' : 'videos'} yet
                          </h3>
                          <p className="optimize-empty-desc">
                            {videoType === 'shorts'
                              ? 'You don\u2019t have any Shorts on this channel. Create Shorts in YouTube Studio to optimize them here.'
                              : 'Upload videos to your channel to see and optimize them here.'}
                          </p>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}

                {showGrid && (
                  <motion.div
                    key="grid"
                    className="optimize-grid-container"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <motion.div
                      className="optimize-video-grid"
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      {videos.map((v, i) => (
                        <motion.article
                          key={v.id}
                          className="optimize-video-card"
                          variants={cardVariants}
                          custom={i}
                          onClick={() => {
                            prefetchVideoOptimization(v.id)
                            setSelectedVideo(v)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              prefetchVideoOptimization(v.id)
                              setSelectedVideo(v)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          layout
                        >
                          <div className="optimize-card-thumb-wrap">
                            <img
                              className="optimize-card-thumb"
                              src={
                                v.thumbnail_url ||
                                `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`
                              }
                              alt=""
                              loading="lazy"
                            />
                            <div className="optimize-card-thumb-overlay" aria-hidden>
                              <svg
                                width="32"
                                height="32"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                              </svg>
                              <span>Optimize</span>
                            </div>
                          </div>
                          <div className="optimize-card-body">
                            <h3 className="optimize-card-title">
                              {(v.title || 'Untitled').substring(0, 80)}
                            </h3>
                            <div className="optimize-card-meta-row">
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
                                {formatCount(v.view_count)} views
                              </span>
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
                                {postedDaysAgo(v.published_at)}
                              </span>
                              {formatEngagement(v.engagement_rate) != null && (
                                <span className="optimize-card-meta-pill optimize-card-meta-pill--engagement">
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
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                  </svg>
                                  {formatEngagement(v.engagement_rate)}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              className="optimize-card-cta"
                              onMouseEnter={() => prefetchVideoOptimization(v.id)}
                              onClick={(e) => {
                                e.stopPropagation()
                                prefetchVideoOptimization(v.id)
                                setSelectedVideo(v)
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
                        </motion.article>
                      ))}
                    </motion.div>
                    {totalPages > 1 && (
                      <motion.div
                        className="optimize-pagination"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.3 }}
                      >
                        <button
                          type="button"
                          className="optimize-page-btn"
                          disabled={page <= 1 || videosLoading}
                          onClick={() => setPage(page - 1)}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M15 18l-6-6 6-6" />
                          </svg>
                          Previous
                        </button>
                        <span className="optimize-page-info">
                          Page {page} of {totalPages}
                        </span>
                        <button
                          type="button"
                          className="optimize-page-btn"
                          disabled={page >= totalPages || videosLoading}
                          onClick={() => setPage(page + 1)}
                        >
                          Next
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </button>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  )

  if (shellManaged) return innerContent

  return (
    <AppShellLayout
      pageClassName="dashboard-page"
      mainClassName="dashboard-main-wrap"
      sidebar={
        <Sidebar
          user={user}
          onOpenSettings={openSettings}
          onLogout={handleLogout}
          currentScreen="optimize"
        />
      }
    >
      {innerContent}

      <SettingsModal
        open={settingsOpen}
        initialSection={settingsSection}
        onClose={() => setSettingsOpen(false)}
        user={user}
        accountDeletePasswordOptional={
          typeof allowsPasswordlessAccountDelete === 'function' && allowsPasswordlessAccountDelete()
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
    </AppShellLayout>
  )
}
