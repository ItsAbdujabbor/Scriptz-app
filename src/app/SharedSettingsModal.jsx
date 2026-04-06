/**
 * Self-contained SettingsModal that reads from Zustand stores directly,
 * eliminating the need for every screen to prop-drill auth/onboarding state.
 */
import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { useOnboardingStore } from '../stores/onboardingStore'
import { youtubeApi } from '../api/youtube'
import { queryKeys } from '../lib/query/queryKeys'
import { SettingsModal } from './SettingsModal'

export function SharedSettingsModal({ open, initialSection, onClose, onLogout }) {
  const {
    user,
    logout,
    changePassword,
    deleteData,
    deleteAccount,
    getValidAccessToken,
    allowsPasswordlessAccountDelete,
    isLoading: authLoading,
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
  } = useOnboardingStore()

  const queryClient = useQueryClient()
  const [youtubeChannels, setYoutubeChannels] = useState([])
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeOAuthError, setYoutubeOAuthError] = useState(null)

  // Bootstrap YouTube channels when modal opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getValidAccessToken().then(async (token) => {
      if (!token || cancelled) return
      try {
        const bootstrap = await useOnboardingStore.getState().bootstrapYouTube(token)
        if (!cancelled) setYoutubeChannels(bootstrap.channels || [])
      } catch (_) {
        if (!cancelled) setYoutubeChannels([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, getValidAccessToken])

  const handleConnectYouTube = useCallback(async () => {
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
  }, [getValidAccessToken])

  const handleDisconnectYouTube = useCallback(async () => {
    const channelId = youtube?.channelId || youtube?.channel_id
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
  }, [youtube, getValidAccessToken, setYouTube, syncToBackend, queryClient])

  const handleSwitchChannel = useCallback(
    async (channel) => {
      if (!channel?.channel_id) return
      setYoutubeLoading(true)
      const token = await getValidAccessToken()
      if (!token) {
        setYoutubeLoading(false)
        return
      }
      try {
        await youtubeApi.switchChannel(token, channel.channel_id)
        setYouTube(true, {
          channelId: channel.channel_id,
          channel_title: channel.channel_title,
          profile_image: channel.profile_image,
          subscriberCount: channel.subscriber_count,
          viewCount: channel.view_count,
          videoCount: channel.video_count,
        })
        await syncToBackend(token)
        queryClient.invalidateQueries({ queryKey: queryKeys.user.preferences })
      } catch (e) {
        setYoutubeOAuthError(e?.message || 'Could not switch channel.')
      }
      setYoutubeLoading(false)
    },
    [getValidAccessToken, setYouTube, syncToBackend, queryClient]
  )

  const handleLogout = useCallback(async () => {
    await logout()
    onLogout?.()
  }, [logout, onLogout])

  return (
    <SettingsModal
      open={open}
      initialSection={initialSection}
      onClose={onClose}
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
      onLogout={handleLogout}
    />
  )
}
