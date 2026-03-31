import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { useOnboardingStore } from '../stores/onboardingStore'
import { youtubeApi } from '../api/youtube'
import { Sidebar } from './Sidebar'
import { SettingsModal } from './SettingsModal'
import { ProPricingContent } from './ProPricingContent'
import { useUserPreferencesQuery } from '../queries/user/preferencesQueries'
import { useUserProfileQuery } from '../queries/user/profileQueries'
import { queryKeys } from '../lib/query/queryKeys'
import './Sidebar.css'
import './SettingsModal.css'
import './Dashboard.css'
import './Pro.css'
import '../landing/sections/pricing/pricing.css'

export function Pro({ onLogout }) {
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
    setPreferredTone,
    setSpeakingStyle,
    setPreferredCtaStyle,
  ])

  const handleLogout = () => {
    logout?.()
    onLogout?.()
  }

  const openSettings = (section) => {
    setSettingsSection(section ?? 'account')
    setSettingsOpen(true)
  }

  const handleStartTrial = () => {
    window.location.hash = 'register'
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

  const handleDisconnectYouTube = () => {
    setYouTube(false)
    setYoutubeChannels([])
  }

  const handleSwitchChannel = async (channelId) => {
    if (!channelId) return
    const token = await getValidAccessToken()
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
      await syncChannelToBackend?.(token, channelId, info)
      await syncToBackend(token)
      queryClient.invalidateQueries({ queryKey: queryKeys.user.preferences })
    } catch (_) {
      setYoutubeOAuthError('Could not switch channel.')
    }
  }

  useEffect(() => {
    clearError?.()
  }, [clearError])

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

  return (
    <div className="dashboard-page">
      <div className="dashboard-app-shell">
        <Sidebar
          user={user}
          onOpenSettings={openSettings}
          onLogout={handleLogout}
          currentScreen="pro"
        />
        <main className="dashboard-main-wrap">
          <div className="dashboard-main pro-page">
            <ProPricingContent onStartTrial={handleStartTrial} />
          </div>
        </main>
      </div>

      {settingsOpen && (
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
          syncToBackend={syncChannelToBackend}
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
    </div>
  )
}
