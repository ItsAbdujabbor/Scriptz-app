import { create } from 'zustand'
import { userApi } from '../api/user'
import { profileApi } from '../api/profile'

const STORAGE_KEY = 'scriptz_onboarding'

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveStored(data) {
  try {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

const defaultProfile = {
  onboardingCompleted: false,
  preferredLanguage: 'en', // en | es | pt | de | fr
  niche: '',
  videoFormat: '', // 'shorts' | 'longform' | 'both'
  uploadFrequency: '', // 'daily' | 'few_times' | 'weekly' | 'occasionally'
  preferredTone: '', // casual | professional | friendly | energetic | educational
  speakingStyle: '', // conversational | formal | humorous | direct
  preferredCtaStyle: '', // direct | subtle | enthusiastic | soft
  includePersonalStories: true,
  useFirstPerson: true,
  youtube: {
    connected: false,
    channelId: null,
    channelName: null,
    avatar: null,
    subscriberCount: null,
    viewCount: null,
    videoCount: null,
  },
}

function mergeStored() {
  const stored = loadStored()
  if (!stored) return defaultProfile
  return {
    ...defaultProfile,
    ...stored,
    youtube: { ...defaultProfile.youtube, ...(stored.youtube || {}) },
  }
}

const PERSIST_KEYS = ['onboardingCompleted', 'preferredLanguage', 'niche', 'videoFormat', 'uploadFrequency', 'preferredTone', 'speakingStyle', 'preferredCtaStyle', 'includePersonalStories', 'useFirstPerson', 'youtube']

function persist(getState) {
  const state = getState()
  const s = {}
  PERSIST_KEYS.forEach((k) => { s[k] = state[k] })
  saveStored(s)
}

export const useOnboardingStore = create((set, get) => ({
  ...defaultProfile,

  load() {
    set(mergeStored())
  },

  setPreferredLanguage(lang) {
    set({ preferredLanguage: lang })
    persist(get)
  },

  setNiche(niche) {
    set({ niche })
    persist(get)
  },

  setVideoFormat(videoFormat) {
    set({ videoFormat })
    persist(get)
  },

  setUploadFrequency(uploadFrequency) {
    set({ uploadFrequency })
    persist(get)
  },

  setPreferredTone(v) {
    set({ preferredTone: v })
    persist(get)
  },
  setSpeakingStyle(v) {
    set({ speakingStyle: v })
    persist(get)
  },
  setPreferredCtaStyle(v) {
    set({ preferredCtaStyle: v })
    persist(get)
  },
  setIncludePersonalStories(v) {
    set({ includePersonalStories: v })
    persist(get)
  },
  setUseFirstPerson(v) {
    set({ useFirstPerson: v })
    persist(get)
  },

  setYouTube(connected, data = {}) {
    const youtube = {
      connected: !!connected,
      channelId: data.channelId ?? data.channel_id ?? null,
      channelName: data.channelName ?? data.channel_title ?? null,
      avatar: data.avatar ?? data.profile_image ?? null,
      subscriberCount: data.subscriberCount ?? data.subscriber_count ?? null,
      viewCount: data.viewCount ?? data.view_count ?? null,
      videoCount: data.videoCount ?? data.video_count ?? null,
    }
    set({ youtube })
    persist(get)
  },

  /** Update channel in backend (PUT /api/profile/channel/{channel_id}). Call after connect/switch. */
  async syncChannelToBackend(accessToken, channelId, channelData = {}) {
    if (!accessToken || !channelId) return
    const data = get().youtube
    const payload = {
      channel_id: channelId,
      channel_title: channelData.channelName ?? channelData.channel_title ?? data?.channelName,
      profile_image: channelData.avatar ?? channelData.profile_image ?? data?.avatar,
      subscriber_count: channelData.subscriberCount ?? channelData.subscriber_count ?? data?.subscriberCount,
      view_count: channelData.viewCount ?? channelData.view_count ?? data?.viewCount,
      video_count: channelData.videoCount ?? channelData.video_count ?? data?.videoCount,
    }
    try {
      await profileApi.updateChannel(accessToken, channelId, payload)
    } catch (_) {}
  },

  completeOnboarding() {
    set({ onboardingCompleted: true })
    persist(get)
  },

  /** Clear all local onboarding/preferences data (e.g. after "delete my data"). */
  clearLocalData() {
    set({ ...defaultProfile })
    saveStored(null)
  },

  /** Sync current preferences and profile to backend (called after onboarding or when settings change). */
  async syncToBackend(accessToken) {
    if (!accessToken) return
    const state = get()
    try {
      await userApi.savePreferences(accessToken, {
        preferredLanguage: state.preferredLanguage,
        niche: state.niche,
        videoFormat: state.videoFormat,
        uploadFrequency: state.uploadFrequency,
        youtube: state.youtube,
      })
    } catch (_) {
      // Backend may not have endpoint yet; keep local state
    }
    try {
      await profileApi.updateProfile(accessToken, {
        niche: state.niche,
        video_format: state.videoFormat,
        upload_frequency: state.uploadFrequency,
        preferred_tone: state.preferredTone || null,
        speaking_style: state.speakingStyle || null,
        preferred_cta_style: state.preferredCtaStyle || null,
        include_personal_stories: state.includePersonalStories,
        use_first_person: state.useFirstPerson,
      })
    } catch (_) {}

    const cid = state.youtube?.channelId ?? state.youtube?.channel_id
    if (cid) {
      try {
        await profileApi.updateChannel(accessToken, cid, {
          channel_title: state.youtube.channelName,
          profile_image: state.youtube.avatar,
          subscriber_count: state.youtube.subscriberCount,
          view_count: state.youtube.viewCount,
          video_count: state.youtube.videoCount,
        })
      } catch (_) {}
    }
  },

  /** Load preferences, profile, and optional channel from backend (called on dashboard load). */
  async loadFromBackend(accessToken) {
    if (!accessToken) return
    const current = get()

    try {
      const prefs = await userApi.getPreferences(accessToken)
      if (prefs && typeof prefs === 'object') {
        set({
          preferredLanguage: prefs.preferredLanguage ?? current.preferredLanguage,
          niche: prefs.niche ?? current.niche,
          videoFormat: prefs.videoFormat ?? current.videoFormat,
          uploadFrequency: prefs.uploadFrequency ?? current.uploadFrequency,
          youtube: prefs.youtube ? { ...current.youtube, ...prefs.youtube } : current.youtube,
        })
        persist(get)
      }
    } catch (_) {
      // Keep existing local state
    }

    try {
      const profile = await profileApi.getProfile(accessToken)
      if (profile && typeof profile === 'object') {
        const next = get()
        set({
          niche: profile.niche ?? next.niche,
          videoFormat: profile.video_format ?? next.videoFormat,
          uploadFrequency: profile.upload_frequency ?? next.uploadFrequency,
          preferredTone: profile.preferred_tone ?? next.preferredTone,
          speakingStyle: profile.speaking_style ?? next.speakingStyle,
          preferredCtaStyle: profile.preferred_cta_style ?? next.preferredCtaStyle,
          includePersonalStories: profile.include_personal_stories !== false,
          useFirstPerson: profile.use_first_person !== false,
        })
        persist(get)
      }
    } catch (_) {}

    const channelId = get().youtube?.channelId ?? get().youtube?.channel_id
    if (channelId) {
      try {
        const channel = await profileApi.getChannel(accessToken, channelId)
        if (channel && typeof channel === 'object') {
          const next = get()
          const yt = next.youtube || {}
          set({
            youtube: {
              ...yt,
              channelName: channel.channel_title ?? channel.channel_name ?? yt.channelName,
              avatar: channel.profile_image ?? channel.avatar ?? yt.avatar,
              subscriberCount: channel.subscriber_count ?? channel.subscriberCount ?? yt.subscriberCount,
              viewCount: channel.view_count ?? channel.viewCount ?? yt.viewCount,
              videoCount: channel.video_count ?? channel.videoCount ?? yt.videoCount,
            },
          })
          persist(get)
        }
      } catch (_) {}
    }
  },
}))
