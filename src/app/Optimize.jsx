import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { queryFreshness } from '../lib/query/queryConfig'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import './Sidebar.css'
import './SettingsModal.css'
import './Dashboard.css'
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
  } catch (e) {
    return iso
  }
}

export function Optimize({ onLogout }) {
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
  }, [userPreferencesQuery.data, setNiche, setPreferredLanguage, setUploadFrequency, setVideoFormat])

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
  const videosError = videosQuery.isError ? (videosQuery.error?.message || 'Failed to load videos') : null
  const totalPages = videosQuery.data?.total_pages ?? 1

  const prefetchVideoOptimization = (videoId) => {
    if (!videoId) return
    if (!youtube?.connected) return
    queryClient
      .prefetchQuery({
        queryKey: queryKeys.youtube.videoOptimization(videoId),
        queryFn: async () => {
          const token = await getAccessTokenOrNull()
          if (!token) return null
          return youtubeApi.optimizeVideo(token, videoId)
        },
        staleTime: queryFreshness.short,
      })
      .catch(() => {})
  }

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
    setPage(1)
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

  return (
    <div className="dashboard-page">
      <div className="dashboard-app-shell">
        <Sidebar
          user={user}
          onOpenSettings={openSettings}
          onLogout={handleLogout}
          currentScreen="optimize"
        />
        <main className="dashboard-main-wrap">
          <div className="dashboard-main optimize-page">
            <div className="optimize-top-bar">
              <h1 className="optimize-heading">Optimize</h1>
              <div className="optimize-search-wrap">
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

            {dashPrefillBanner && (
              <div className="optimize-dash-prefill" role="status">
                <p className="optimize-dash-prefill-text">{dashPrefillBanner}</p>
                <button
                  type="button"
                  className="optimize-dash-prefill-dismiss"
                  onClick={() => setDashPrefillBanner(null)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}

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
                    </button>
                  ))}
                </nav>
              </div>
              <div className="optimize-filters-right">
                <select
                  className="optimize-sort-dropdown"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Sort by"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="optimize-divider optimize-divider--below-filters" aria-hidden />

            {!youtube?.connected && (
              <div className="optimize-state optimize-state-empty">
                <div className="optimize-empty-card">
                  <span className="optimize-empty-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </span>
                  <h3 className="optimize-empty-title">Connect YouTube</h3>
                  <p className="optimize-empty-desc">Connect your channel to see and optimize your videos here.</p>
                </div>
              </div>
            )}

            {showLoading && (
              <div className="optimize-state optimize-state-loading">
                <div className="optimize-spinner" aria-hidden />
                <p>Loading your videos…</p>
              </div>
            )}

            {showError && (
              <div className="optimize-state optimize-state-error">
                <p>{videosError}</p>
              </div>
            )}

            {showEmpty && (
              <div className="optimize-state optimize-state-empty">
                <div className="optimize-empty-card">
                  {emptyFromSearch ? (
                    <>
                      <span className="optimize-empty-icon" aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                        </svg>
                      </span>
                      <h3 className="optimize-empty-title">No results for “{searchQuery.trim()}”</h3>
                      <p className="optimize-empty-desc">Try a different search term or clear the search to see all your {videoType === 'shorts' ? 'Shorts' : 'videos'}.</p>
                      <button
                        type="button"
                        className="optimize-empty-action"
                        onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                      >
                        Clear search
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="optimize-empty-icon" aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m22 8-6 4 6 4V8Z" />
                          <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                        </svg>
                      </span>
                      <h3 className="optimize-empty-title">
                        No {videoType === 'shorts' ? 'Shorts' : 'videos'} yet
                      </h3>
                      <p className="optimize-empty-desc">
                        {videoType === 'shorts'
                          ? 'You don’t have any Shorts on this channel. Create Shorts in YouTube Studio to optimize them here.'
                          : 'Upload videos to your channel to see and optimize them here.'}
                      </p>
                      {videoType === 'shorts' && (
                        <p className="optimize-empty-hint">Switch to Videos to optimize your long-form content.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {showGrid && (
              <div className="optimize-grid-container">
                <div className="optimize-video-grid">
                  {videos.map((v) => (
                    <article
                      key={v.id}
                      className="optimize-video-card"
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
                    >
                      <div className="optimize-card-thumb-wrap">
                        <img
                          className="optimize-card-thumb"
                          src={v.thumbnail_url || `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                          alt=""
                          loading="lazy"
                        />
                      </div>
                      <div className="optimize-card-body">
                        <h3 className="optimize-card-title">{(v.title || 'Untitled').substring(0, 80)}</h3>
                        <div className="optimize-card-meta-row">
                          <span className="optimize-card-meta-pill">{formatCount(v.view_count)} views</span>
                          <span className="optimize-card-meta-pill">{postedDaysAgo(v.published_at)}</span>
                          {formatEngagement(v.engagement_rate) != null && (
                            <span className="optimize-card-meta-pill optimize-card-meta-pill--engagement">
                              {formatEngagement(v.engagement_rate)} engagement
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
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                          </span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="optimize-pagination">
                    <button
                      type="button"
                      className="optimize-page-btn"
                      disabled={page <= 1 || videosLoading}
                      onClick={() => setPage(page - 1)}
                    >
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
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <SettingsModal
            open={settingsOpen}
            initialSection={settingsSection}
            onClose={() => setSettingsOpen(false)}
            user={user}
            accountDeletePasswordOptional={typeof allowsPasswordlessAccountDelete === 'function' && allowsPasswordlessAccountDelete()}
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

          {selectedVideo && (
            <VideoOptimizeModal
              open={!!selectedVideo}
              onClose={() => setSelectedVideo(null)}
              video={selectedVideo}
              getValidAccessToken={getValidAccessToken}
              channelId={channelId}
              channelTitle={youtube?.channel_title}
            />
          )}
        </main>
      </div>
    </div>
  )
}
