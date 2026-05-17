import { create } from 'zustand'
import { userApi } from '../api/user'
import { profileApi } from '../api/profile'

const STORAGE_KEY = 'clixa_onboarding'
const LEGACY_STORAGE_KEY = 'scriptz_onboarding'

function loadStored() {
  try {
    // One-shot migration from the legacy "scriptz_*" brand key so existing
    // users keep their onboarding profile after the rebrand.
    let raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacy) {
        localStorage.setItem(STORAGE_KEY, legacy)
        raw = legacy
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    }
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

const PERSIST_KEYS = [
  'preferredLanguage',
  'niche',
  'videoFormat',
  'uploadFrequency',
  'preferredTone',
  'speakingStyle',
  'preferredCtaStyle',
  'includePersonalStories',
  'useFirstPerson',
  'youtube',
]

function persist(getState) {
  const state = getState()
  const s = {}
  PERSIST_KEYS.forEach((k) => {
    s[k] = state[k]
  })
  saveStored(s)
}

function toYouTubeState(data = {}) {
  return {
    connected: !!(data.channelId ?? data.channel_id),
    channelId: data.channelId ?? data.channel_id ?? null,
    channelName: data.channelName ?? data.channel_title ?? null,
    avatar: data.avatar ?? data.profile_image ?? null,
    subscriberCount: data.subscriberCount ?? data.subscriber_count ?? null,
    viewCount: data.viewCount ?? data.view_count ?? null,
    videoCount: data.videoCount ?? data.video_count ?? null,
  }
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
    const youtube = connected
      ? toYouTubeState(data)
      : { ...defaultProfile.youtube, connected: false }
    set({ youtube })
    persist(get)
  },

  // STM-06: `bootstrapYouTube` (and its module-level TTL cache) was
  // removed. It called `youtubeApi.listChannels` / `getChannelInfo`,
  // which no longer exist — the full YouTube account integration was
  // deleted and `api/youtube.js` only exposes thumbnail fetching now.
  // Any call would have thrown. The local `youtube` profile field is
  // still kept (it's surfaced by Thumbnails.jsx and synced via
  // preferences/profile), only the dead OAuth bootstrap path is gone.

  /** Update channel in backend (PUT /api/profile/channel/{channel_id}). Call after connect/switch. */
  async syncChannelToBackend(accessToken, channelId, channelData = {}) {
    if (!accessToken || !channelId) return
    const data = get().youtube
    const channelName =
      channelData.channelName ?? channelData.channel_title ?? data?.channelName ?? null
    const payload = {
      channel_id: channelId,
      channel_name: channelName || null,
    }
    try {
      await profileApi.updateChannel(accessToken, channelId, payload)
    } catch (_) {}
  },

  /** Clear all local preferences data (e.g. after "delete my data"). */
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
          channel_id: cid,
          channel_name: state.youtube.channelName ?? null,
        })
      } catch (_) {}
    }
  },

  /** Load preferences, profile, and optional channel from backend in parallel. */
  async loadFromBackend(accessToken) {
    if (!accessToken) return
    const current = get()

    const [prefsResult, profileResult] = await Promise.allSettled([
      userApi.getPreferences(accessToken),
      profileApi.getProfile(accessToken),
    ])

    const prefs = prefsResult.status === 'fulfilled' ? prefsResult.value : null
    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null

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
              subscriberCount:
                channel.subscriber_count ?? channel.subscriberCount ?? yt.subscriberCount,
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
