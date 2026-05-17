import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useOnboardingStore } from '../stores/onboardingStore'
import { AppShellLayout } from '../components/AppShellLayout'
import { Sidebar } from './Sidebar'
import { SettingsModal } from './SettingsModal'
import { ProPricingContent } from './ProPricingContent'
import { useUserPreferencesQuery } from '../queries/user/preferencesQueries'
import { useUserProfileQuery } from '../queries/user/profileQueries'
/* Sidebar.css, SettingsModal.css, Dashboard.css imported by AuthenticatedRoutes */
import './Pro.css'

export function Pro({ onLogout, shellManaged }) {
  const {
    user,
    logout,
    deleteData,
    deleteAccount,
    getValidAccessToken,
    allowsPasswordlessAccountDelete,
    clearError,
  } = useAuthStore()
  const {
    preferredLanguage,
    niche,
    videoFormat,
    uploadFrequency,
    youtube,
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
  } = useOnboardingStore()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState('account')
  // STM-06: YouTube account integration removed. SettingsModal no longer
  // renders a YouTube section, but still accepts these (now-inert) props
  // — pass stable empty placeholders instead of dead component state.
  const youtubeChannels = []
  const youtubeLoading = false
  const youtubeOAuthError = null
  const setYoutubeOAuthError = () => {}

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

  // STM-06: The full YouTube account integration was removed
  // (api/youtube.js now only fetches thumbnails — no OAuth, no channel
  // listing). These handlers used to call `youtubeApi.getAuthorizationUrl`
  // / `getChannelInfo` and `onboardingStore.bootstrapYouTube`, all of
  // which no longer exist and would throw on invoke. SettingsModal does
  // not render a YouTube section anymore, so these are kept only as
  // inert prop fillers for its (now-unused) youtube props rather than
  // re-threading a dead prop contract.
  const handleConnectYouTube = () => {}
  const handleDisconnectYouTube = () => {}
  const handleSwitchChannel = () => {}

  useEffect(() => {
    clearError?.()
  }, [clearError])

  const innerContent = (
    <div className="dashboard-main-scroll">
      <div className="dashboard-main dashboard-main--subpage">
        <div className="dashboard-content-shell dashboard-content-shell--page">
          <div className="pro-page">
            <ProPricingContent onStartTrial={handleStartTrial} />
          </div>
        </div>
      </div>
    </div>
  )

  if (shellManaged) return innerContent

  return (
    <div className="dashboard-page">
      <AppShellLayout
        shellOnly
        mainClassName="dashboard-main-wrap"
        sidebar={
          <Sidebar
            user={user}
            onOpenSettings={openSettings}
            onLogout={handleLogout}
            currentScreen="pro"
          />
        }
      >
        {innerContent}
      </AppShellLayout>

      {settingsOpen && (
        <SettingsModal
          open={settingsOpen}
          initialSection={settingsSection}
          onClose={() => setSettingsOpen(false)}
          user={user}
          accountDeletePasswordOptional={
            typeof allowsPasswordlessAccountDelete === 'function' &&
            allowsPasswordlessAccountDelete()
          }
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
