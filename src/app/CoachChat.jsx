import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useQueryClient } from '@tanstack/react-query'

import { useAuthStore } from '../stores/authStore'
import { useOnboardingStore } from '../stores/onboardingStore'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { queryKeys } from '../lib/query/queryKeys'
import { refreshCoachConversationCache } from '../lib/query/chatCacheUtils'
import { coachApi } from '../api/coach'
import { youtubeApi } from '../api/youtube'
import { Sidebar } from './Sidebar'
import { SettingsModal } from './SettingsModal'
import { PersonasModal } from './PersonasModal'
import { StylesModal } from './StylesModal'
import { useCoachConversationQuery } from '../queries/coach/coachQueries'
import { useUserPreferencesQuery } from '../queries/user/preferencesQueries'
import { useUserProfileQuery } from '../queries/user/profileQueries'
/* Sidebar.css, SettingsModal.css, Dashboard.css imported by AuthenticatedRoutes */
import './CoachChat.css'
import { TabBar } from '../components/TabBar'
import { AppShellLayout } from '../components/AppShellLayout'
import { ChatHistoryLoading } from '../components/ChatHistoryLoading'
import { AnimatedComposerHint } from '../components/AnimatedComposerHint'
import { stripPrefillFromHash } from '../lib/dashboardActionPayload'
import { getCoachHashState } from '../lib/coachHashRoute'
import {
  normalizeMessageText,
  parseFollowUps,
  renderMessageContent,
} from '../lib/messageRender.jsx'
import { onShellEvent } from '../lib/shellEvents'
// import { ScriptGenerator } from './ScriptGenerator' // moved to src/next-update-ideas/ScriptGenerator
import { ThumbnailGenerator } from './ThumbnailGenerator'
import {
  CoachChatVirtuosoItem,
  CoachChatVirtuosoList,
  CoachChatVirtuosoScroller,
} from './coach/CoachChatVirtuosoShell.jsx'

const COACH_TABS = [
  { id: 'coach', label: 'Coach', hash: 'coach' },
  // { id: 'scripts', label: 'Scripts', hash: 'coach/scripts' }, // next update
  { id: 'thumbnails', label: 'Thumbnails', hash: 'coach/thumbnails' },
]

const COMPOSER_HINTS = [
  'Ask me anything about YouTube...',
  'Need help writing a video script?',
  'Want ideas for your next video?',
  'Ask me to review your thumbnail...',
  'How can I grow my channel faster?',
  "Paste a title and I'll improve it...",
  "Struggling with hooks? Let's fix that...",
  'What topic should you post about next?',
]

function setCoachTabHash(tabId, conversationId = null) {
  const tab = COACH_TABS.find((t) => t.id === tabId)
  if (!tab) return
  const baseHash = `#${tab.hash}`
  const hash = conversationId != null ? `${baseHash}?id=${conversationId}` : baseHash
  if (window.location.hash !== hash) window.location.hash = hash
}

function setCoachHash(conversationId = null) {
  window.location.hash = conversationId ? `#coach?id=${conversationId}` : '#coach'
}

function setThumbnailConversationHash(conversationId = null) {
  window.location.hash = conversationId
    ? `#coach/thumbnails?id=${conversationId}`
    : '#coach/thumbnails'
}

// function setScriptConversationHash(conversationId = null) { // next update
//   window.location.hash = conversationId ? `#coach/scripts?id=${conversationId}` : '#coach/scripts'
// }

const CUSTOM_RETRY_MARKER = '\n\nExtra direction for this retry: '

const COACH_COMPOSER_MAX_CHARS = 12000
const COACH_COMPOSER_TEXTAREA_MAX_PX = 240

function coachComposerSingleLineFloorPx(el) {
  if (!el) return 40
  const cs = getComputedStyle(el)
  let line = parseFloat(cs.lineHeight)
  if (!Number.isFinite(line) || line <= 0) {
    const fs = parseFloat(cs.fontSize)
    line = Number.isFinite(fs) && fs > 0 ? fs * 1.5 : 22
  }
  const py = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
  return Math.max(28, Math.ceil(line + py))
}

function IconEmptyIdeas() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  )
}

function IconEmptyHook() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconEmptyThumbnail() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

const EMPTY_GREETING_TITLES = [
  'What should we make next?',
  'Ready when you are.',
  'Let’s sharpen your next upload.',
  'What are we improving today?',
  'Need a stronger idea?',
  'Let’s build a better video.',
]
const EMPTY_QUICK_ACTIONS = [
  {
    id: 'ideas',
    label: 'Video ideas',
    text: 'Give me 10 strong YouTube video ideas for my channel and rank the top 3.',
    prompt: 'Give me 10 strong YouTube video ideas for my channel and rank the top 3.',
    Icon: IconEmptyIdeas,
  },
  {
    id: 'hook',
    label: 'Rewrite hook',
    text: 'Rewrite this hook and give me 5 stronger hook options with scores.',
    prompt: 'Rewrite this hook and give me 5 stronger hook options with scores: ',
    Icon: IconEmptyHook,
  },
  {
    id: 'thumbnail',
    label: 'Thumbnail review',
    text: 'Review my thumbnail idea and tell me what to change to improve clicks.',
    prompt: 'Review my thumbnail idea and tell me what to change to improve clicks.',
    Icon: IconEmptyThumbnail,
  },
]

function pickNextGreetingIndex(currentIndex) {
  if (EMPTY_GREETING_TITLES.length <= 1) return 0
  let nextIndex = currentIndex
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * EMPTY_GREETING_TITLES.length)
  }
  return nextIndex
}

function getImagesFromExtraData(extraData) {
  const items = Array.isArray(extraData?.images) ? extraData.images : []
  return items
    .map((item, index) => {
      const base64 = String(item?.base64 || '').trim()
      if (!base64) return null
      const mime = String(item?.mime || 'image/png').trim() || 'image/png'
      return {
        id: `${mime}-${index}`,
        mime,
        base64,
        src: `data:${mime};base64,${base64}`,
      }
    })
    .filter(Boolean)
}

function getUserMessagePresentation(message, messageIndex, allMessages) {
  const extraData = message?.extra_data || {}
  const images = getImagesFromExtraData(extraData)
  const hasDisplayMessage = typeof extraData?.display_message === 'string'
  const displayMessage = hasDisplayMessage ? normalizeMessageText(extraData.display_message) : ''
  const normalized = normalizeMessageText(message?.content)
  const visibleContent = hasDisplayMessage ? displayMessage : normalized
  const retryLabel =
    typeof extraData?.retry_label === 'string' ? normalizeMessageText(extraData.retry_label) : ''

  if (!visibleContent && images.length === 0) {
    return { content: '', badge: '', images: [] }
  }

  if (retryLabel) {
    return {
      content: visibleContent,
      badge: retryLabel,
      images,
    }
  }

  if (normalized.includes(CUSTOM_RETRY_MARKER)) {
    const [basePrompt = ''] = normalized.split(CUSTOM_RETRY_MARKER, 1)
    return {
      content: normalizeMessageText(basePrompt),
      badge: 'Custom retry',
      images,
    }
  }

  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    if (allMessages[index]?.role !== 'user') continue
    const previousPresentation = getUserMessagePresentation(allMessages[index], -1, [])
    const previousUserContent = normalizeMessageText(
      previousPresentation.content || allMessages[index]?.content
    )
    if (previousUserContent && previousUserContent === visibleContent) {
      return {
        content: visibleContent,
        badge: extraData?.deep_thinking ? 'Think longer' : 'Retry',
        images,
      }
    }
    break
  }

  return {
    content: visibleContent,
    badge: '',
    images,
  }
}

function IconArrowUp() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 19 0-14" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  )
}

function IconPaperclip() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.44 11.05-8.49 8.49a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.82-2.83l8.48-8.48" />
    </svg>
  )
}

function IconBrain() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 3a3.5 3.5 0 0 0-3.5 3.5V8a3 3 0 0 0-2 2.83A3 3 0 0 0 6 13.66V15.5A3.5 3.5 0 0 0 9.5 19H10" />
      <path d="M14.5 3A3.5 3.5 0 0 1 18 6.5V8a3 3 0 0 1 2 2.83 3 3 0 0 1-2 2.83V15.5A3.5 3.5 0 0 1 14.5 19H14" />
      <path d="M10 3.5c1 .4 1.5 1.3 1.5 2.5V20" />
      <path d="M14 3.5c-1 .4-1.5 1.3-1.5 2.5V20" />
      <path d="M8 8.5c1 .2 1.8.8 2.2 1.8" />
      <path d="M16 8.5c-1 .2-1.8.8-2.2 1.8" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconShare() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98" />
      <path d="m15.41 6.51-6.82 3.98" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15.55-6.36L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15.55 6.36L3 16" />
    </svg>
  )
}

function IconMic() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  )
}

function IconChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function IconStop() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="7" y="7" width="10" height="10" rx="2.25" />
    </svg>
  )
}

export function CoachChat({ onLogout, shellManaged, onOpenPersonas }) {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const {
    youtube,
    setYouTube,
    preferredLanguage,
    setPreferredLanguage,
    niche,
    videoFormat,
    uploadFrequency,
    preferredTone,
    speakingStyle,
    preferredCtaStyle,
    includePersonalStories,
    useFirstPerson,
    setNiche,
    setVideoFormat,
    setUploadFrequency,
    setPreferredTone,
    setSpeakingStyle,
    setPreferredCtaStyle,
    setIncludePersonalStories,
    setUseFirstPerson,
    clearLocalData,
    syncToBackend,
    syncChannelToBackend,
  } = useOnboardingStore()
  const {
    logout,
    changePassword,
    deleteData,
    deleteAccount,
    getValidAccessToken,
    allowsPasswordlessAccountDelete,
    isLoading: authLoading,
  } = useAuthStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState('account')
  const [youtubeChannels, setYoutubeChannels] = useState([])
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeOAuthError, setYoutubeOAuthError] = useState(null)
  const [hashState, setHashState] = useState(getCoachHashState)
  const [emptyGreetingIndex, setEmptyGreetingIndex] = useState(() => pickNextGreetingIndex(-1))
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState(null)
  const [pendingUserBadge, setPendingUserBadge] = useState('')
  const [pendingUserImages, setPendingUserImages] = useState([])
  const [pendingAssistant, setPendingAssistant] = useState(false)
  const [streamingReply, setStreamingReply] = useState('')
  const [, setAssistantLoadingPhase] = useState(0)
  const [assistantDeepThinkingMode, setAssistantDeepThinkingMode] = useState(false)
  const [attachedImages, setAttachedImages] = useState([])
  const [deepThinking, setDeepThinking] = useState(false)
  const [recorderState, setRecorderState] = useState('idle')
  const [sttSupported, setSttSupported] = useState(false)
  const [recordingLevels, setRecordingLevels] = useState(() =>
    Array.from({ length: 16 }, () => 0.18)
  )
  const [copiedMessageKey, setCopiedMessageKey] = useState('')
  const [generationStopped, setGenerationStopped] = useState(false)
  const [retryMenuKey, setRetryMenuKey] = useState('')
  const [customRetryPrompt, setCustomRetryPrompt] = useState('')
  const [imageViewer, setImageViewer] = useState(null)
  const [userActionDialog, setUserActionDialog] = useState(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [showPersonasModal, setShowPersonasModal] = useState(false)
  const [showStylesModal, setShowStylesModal] = useState(false)
  const threadRef = useRef(null)
  const virtuosoRef = useRef(null)
  const coachChatShellRef = useRef(null)
  const composerWrapRef = useRef(null)
  const messagesEndRef = useRef(null)
  const pendingUserRef = useRef(null)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)
  const retryInputRef = useRef(null)
  const assistantStatusTimersRef = useRef([])
  const streamTextRef = useRef('')
  const streamCommitRafRef = useRef(null)
  const prevPendingAssistantRef = useRef(false)
  const longPressTimerRef = useRef(null)
  const streamAbortRef = useRef(null)
  const transcribeAbortRef = useRef(null)
  const activeRequestIdRef = useRef(0)
  const previousConversationIdRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordingChunksRef = useRef([])
  const recordingStreamRef = useRef(null)
  const recordingMimeTypeRef = useRef('audio/webm')
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const waveformFrameRef = useRef(null)

  const userPreferencesQuery = useUserPreferencesQuery()
  const userProfileQuery = useUserProfileQuery()
  const prefsHydratedRef = useRef(false)
  const profileHydratedRef = useRef(false)

  const openSettings = (section) => {
    setSettingsSection(section ?? 'account')
    setSettingsOpen(true)
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
      const list = await youtubeApi.listChannels(token)
      setYoutubeChannels(list.channels || [])
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

  useEffect(() => {
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
  }, [getValidAccessToken])

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

  const clearAssistantTimers = () => {
    assistantStatusTimersRef.current.forEach((t) => clearTimeout(t))
    assistantStatusTimersRef.current = []
  }

  const isAbortError = (error) => error?.name === 'AbortError'

  const cancelActiveRequests = () => {
    activeRequestIdRef.current += 1
    streamAbortRef.current?.abort?.()
    streamAbortRef.current = null
    transcribeAbortRef.current?.abort?.()
    transcribeAbortRef.current = null
  }

  const handleStopGeneration = () => {
    cancelActiveRequests()
    clearAssistantTimers()
    if (streamCommitRafRef.current) cancelAnimationFrame(streamCommitRafRef.current)
    streamCommitRafRef.current = null
    // Flush any buffered text so the partial reply is complete
    const finalText = streamTextRef.current
    if (finalText) setStreamingReply(finalText)
    streamTextRef.current = ''
    // Keep pendingUserMessage and streamingReply visible — just stop the animation
    setPendingAssistant(false)
    setAssistantLoadingPhase(0)
    setAssistantDeepThinkingMode(false)
    setGenerationStopped(true)
  }

  const resetPendingExchange = () => {
    clearAssistantTimers()
    if (streamCommitRafRef.current) cancelAnimationFrame(streamCommitRafRef.current)
    streamCommitRafRef.current = null
    streamTextRef.current = ''
    setPendingUserMessage(null)
    setPendingUserBadge('')
    setPendingUserImages([])
    setPendingAssistant(false)
    setStreamingReply('')
    setAssistantLoadingPhase(0)
    setAssistantDeepThinkingMode(false)
    setGenerationStopped(false)
  }

  const canEditUserMessage = (messageId) =>
    messageId === lastUserMessageId || messageId === 'pending-user'

  const resetRecordingLevels = () => {
    setRecordingLevels(Array.from({ length: 16 }, () => 0.18))
  }

  const cleanupRecordingResources = () => {
    if (waveformFrameRef.current != null) {
      cancelAnimationFrame(waveformFrameRef.current)
      waveformFrameRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null

    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((track) => track.stop())
      recordingStreamRef.current = null
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null
      mediaRecorderRef.current.onerror = null
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current = null
    }

    recordingChunksRef.current = []
    resetRecordingLevels()
  }

  const pumpRecordingLevels = () => {
    const analyser = analyserRef.current
    if (!analyser) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    const update = () => {
      if (!analyserRef.current) return
      analyser.getByteFrequencyData(data)
      const bucketSize = Math.max(1, Math.floor(data.length / 16))
      const nextLevels = Array.from({ length: 16 }, (_, index) => {
        const start = index * bucketSize
        const end = Math.min(data.length, start + bucketSize)
        let sum = 0
        for (let cursor = start; cursor < end; cursor += 1) sum += data[cursor]
        const average = end > start ? sum / (end - start) / 255 : 0
        return Math.max(0.16, Math.min(1, average * 1.35 + 0.12))
      })
      setRecordingLevels(nextLevels)
      waveformFrameRef.current = requestAnimationFrame(update)
    }

    update()
  }

  const getPreferredRecordingMimeType = () => {
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return ''

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ]

    return candidates.find((item) => window.MediaRecorder.isTypeSupported(item)) || ''
  }

  useEffect(() => {
    const syncHash = () => setHashState(getCoachHashState())
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  const activeTab = hashState.activeTab || 'coach'
  const selectedConversationId = hashState.coachConversationId ?? null
  const selectedScriptConversationId = hashState.scriptConversationId ?? null
  const selectedThumbnailConversationId = hashState.thumbnailConversationId ?? null
  const dashboardRoutePrefill = hashState.dashboardPrefill ?? null

  const coachPrefillKeyRef = useRef('')

  useEffect(() => {
    if (activeTab !== 'coach') return
    const p = dashboardRoutePrefill
    if (!p || selectedConversationId) return
    const key = p.slice(0, 160)
    if (coachPrefillKeyRef.current === key) return
    coachPrefillKeyRef.current = key
    setDraft((d) => (d.trim() ? d : p))
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
    stripPrefillFromHash()
    setHashState(getCoachHashState())
  }, [activeTab, dashboardRoutePrefill, selectedConversationId])

  const handleTabClick = (tabId) => {
    setHashState((prev) => ({ ...prev, activeTab: tabId }))
    setCoachTabHash(tabId)
  }
  const channelId = youtube?.channelId || youtube?.channel_id || null

  const conversationQuery = useCoachConversationQuery(selectedConversationId)

  const messages = useMemo(
    () => conversationQuery.data?.messages?.items || [],
    [conversationQuery.data]
  )

  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') return messages[i].id
    }
    return null
  }, [messages])

  const lastAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'assistant') return messages[i].id
    }
    return null
  }, [messages])

  const isHistoryLoading =
    selectedConversationId != null &&
    (conversationQuery.isPending || conversationQuery.isPlaceholderData)
  const hasMessages = messages.length > 0
  const isEmptyScreen =
    !isHistoryLoading && !hasMessages && !pendingUserMessage && pendingUserImages.length === 0
  const coachLayoutCentered = isEmptyScreen || isHistoryLoading
  const showCoachVirtuoso = !isHistoryLoading && !isEmptyScreen

  useEffect(() => {
    if (
      !showCoachVirtuoso ||
      !pendingAssistant ||
      (!pendingUserMessage && pendingUserImages.length === 0)
    ) {
      prevPendingAssistantRef.current = pendingAssistant
      return
    }

    if (!prevPendingAssistantRef.current) {
      requestAnimationFrame(() => {
        if (virtuosoRef.current) {
          virtuosoRef.current.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })
        } else {
          pendingUserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
    }

    prevPendingAssistantRef.current = pendingAssistant
  }, [showCoachVirtuoso, pendingAssistant, pendingUserMessage, pendingUserImages.length])

  useEffect(() => {
    const lastKey = lastAssistantMessageId != null ? `message-${lastAssistantMessageId}` : ''
    if (retryMenuKey && retryMenuKey !== lastKey) setRetryMenuKey('')
  }, [lastAssistantMessageId, retryMenuKey])

  useEffect(() => {
    if (previousConversationIdRef.current == null) {
      previousConversationIdRef.current = selectedConversationId
      return
    }

    if (previousConversationIdRef.current !== selectedConversationId) {
      cancelActiveRequests()
      resetPendingExchange()
      if (recorderState === 'transcribing') {
        setRecorderState('idle')
      }
    }

    previousConversationIdRef.current = selectedConversationId
  }, [selectedConversationId, recorderState])

  useEffect(() => {
    setSendError('')
  }, [selectedConversationId])

  useEffect(() => {
    if (!sendError) return undefined

    const timeoutId = window.setTimeout(() => {
      setSendError('')
    }, 4000)

    return () => window.clearTimeout(timeoutId)
  }, [sendError])

  useLayoutEffect(() => {
    if (recorderState === 'recording' || recorderState === 'transcribing') return
    const el = textareaRef.current
    if (!el) return

    const prevHeight = el.offsetHeight

    el.style.transition = 'none'
    el.style.minHeight = '0'
    el.style.height = '0'
    el.style.overflow = 'hidden'
    const natural = el.scrollHeight
    el.style.minHeight = ''
    el.style.overflow = ''

    const floor = coachComposerSingleLineFloorPx(el)
    const target = Math.min(Math.max(natural, floor), COACH_COMPOSER_TEXTAREA_MAX_PX)

    el.style.height = `${prevHeight}px`
    void el.offsetHeight
    el.style.transition = 'height 0.28s cubic-bezier(0.25, 1, 0.5, 1)'
    requestAnimationFrame(() => {
      if (textareaRef.current !== el) return
      el.style.height = `${target}px`
    })
  }, [draft, recorderState])

  const scrollingToBottomRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    scrollingToBottomRef.current = true
    setShowScrollToBottom(false)
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })
    } else {
      const thread = threadRef.current
      if (!thread) return
      thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' })
    }
    const check = () => {
      const el = threadRef.current
      if (!el) {
        scrollingToBottomRef.current = false
        return
      }
      const { scrollTop, scrollHeight, clientHeight } = el
      const atBottom = scrollHeight - scrollTop - clientHeight <= 24
      if (atBottom) setShowScrollToBottom(false)
      if (atBottom || !scrollingToBottomRef.current) scrollingToBottomRef.current = false
    }
    ;[200, 400, 600, 900].forEach((ms) =>
      setTimeout(() => {
        check()
        if (ms === 900) scrollingToBottomRef.current = false
      }, ms)
    )
  }, [])

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return undefined

    const SCROLL_THRESHOLD = 24

    const checkScrollPosition = () => {
      const { scrollTop, scrollHeight, clientHeight } = thread
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      const atBottom = distanceFromBottom <= SCROLL_THRESHOLD
      const isScrollable = scrollHeight > clientHeight
      if (atBottom) {
        setShowScrollToBottom(false)
        scrollingToBottomRef.current = false
      } else if (!scrollingToBottomRef.current) {
        setShowScrollToBottom(isScrollable)
      }
    }

    checkScrollPosition()
    thread.addEventListener('scroll', checkScrollPosition, { passive: true })
    if ('onscrollend' in thread) {
      thread.addEventListener('scrollend', checkScrollPosition)
    }
    const ro = new ResizeObserver(checkScrollPosition)
    ro.observe(thread)
    return () => {
      thread.removeEventListener('scroll', checkScrollPosition)
      if ('onscrollend' in thread) {
        thread.removeEventListener('scrollend', checkScrollPosition)
      }
      ro.disconnect()
    }
  }, [messages.length, pendingAssistant, streamingReply, showCoachVirtuoso])

  useEffect(() => {
    if (!retryMenuKey) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-retry-root="true"]')) return
      setRetryMenuKey('')
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [retryMenuKey])

  useEffect(() => {
    if (!retryMenuKey) {
      setCustomRetryPrompt('')
      return
    }

    const frameId = requestAnimationFrame(() => {
      retryInputRef.current?.focus()
    })
    return () => cancelAnimationFrame(frameId)
  }, [retryMenuKey])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setImageViewer(null)
      setUserActionDialog(null)
      setRetryMenuKey('')
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const isSupported =
      typeof window !== 'undefined' &&
      typeof window.MediaRecorder !== 'undefined' &&
      !!navigator?.mediaDevices?.getUserMedia
    setSttSupported(isSupported)

    return () => {
      cancelActiveRequests()
      cleanupRecordingResources()
    }
  }, [])

  const handleNewChat = useCallback(() => {
    cancelActiveRequests()
    cleanupRecordingResources()
    setRecorderState('idle')
    setEmptyGreetingIndex((current) => pickNextGreetingIndex(current))
    setDraft('')
    setSendError('')
    resetPendingExchange()
    setAttachedImages([])
    setDeepThinking(false)
    setCoachHash(null)
  }, [])

  useEffect(() => {
    if (!shellManaged) return
    return onShellEvent('newChat', handleNewChat)
  }, [shellManaged, handleNewChat])

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const stopVoiceRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) {
      cleanupRecordingResources()
      setRecorderState('idle')
      return
    }

    setRecorderState('transcribing')
    try {
      if (recorder.state === 'recording') {
        recorder.requestData?.()
        recorder.stop()
      }
    } catch (_) {
      cleanupRecordingResources()
      setRecorderState('idle')
      setSendError('Recording could not stop cleanly.')
    }
  }

  const startVoiceRecording = async () => {
    if (!sttSupported) {
      setSendError('Voice recording is not supported in this browser.')
      return
    }

    setSendError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeType = getPreferredRecordingMimeType()
      const recorder = preferredMimeType
        ? new window.MediaRecorder(stream, { mimeType: preferredMimeType })
        : new window.MediaRecorder(stream)

      recordingStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recordingChunksRef.current = []
      recordingMimeTypeRef.current = recorder.mimeType || preferredMimeType || 'audio/webm'

      recorder.ondataavailable = (event) => {
        if (event.data?.size) recordingChunksRef.current.push(event.data)
      }

      recorder.onerror = () => {
        cleanupRecordingResources()
        setRecorderState('idle')
        setSendError('Recording stopped unexpectedly.')
      }

      recorder.onstop = async () => {
        const chunks = recordingChunksRef.current.slice()
        const mimeType = recordingMimeTypeRef.current || 'audio/webm'
        cleanupRecordingResources()

        const audioBlob = new Blob(chunks, { type: mimeType })
        if (!audioBlob.size) {
          setRecorderState('idle')
          setSendError('No audio was captured.')
          return
        }

        let controller = null
        try {
          const requestId = activeRequestIdRef.current + 1
          activeRequestIdRef.current = requestId
          transcribeAbortRef.current?.abort?.()
          controller = new AbortController()
          transcribeAbortRef.current = controller
          const token = await getAccessTokenOrNull()
          if (!token) throw new Error('Not authenticated')
          const result = await coachApi.transcribeAudio(token, audioBlob, mimeType, {
            signal: controller.signal,
          })
          if (activeRequestIdRef.current !== requestId) return
          const transcript = normalizeMessageText(result?.transcript)
          if (!transcript) {
            throw new Error('No speech was detected. Please try again.')
          }
          setDraft((current) => {
            const existing = current.trim()
            return existing ? `${existing} ${transcript}` : transcript
          })
          requestAnimationFrame(() => {
            textareaRef.current?.focus()
            const length = textareaRef.current?.value?.length || 0
            textareaRef.current?.setSelectionRange?.(length, length)
          })
        } catch (error) {
          if (isAbortError(error)) return
          setSendError(error?.message || 'Could not transcribe your recording.')
        } finally {
          if (controller && transcribeAbortRef.current === controller) {
            transcribeAbortRef.current = null
          }
          setRecorderState('idle')
        }
      }

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext
      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.82
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        audioContextRef.current = audioContext
        analyserRef.current = analyser
        pumpRecordingLevels()
      } else {
        resetRecordingLevels()
      }

      recorder.start(180)
      setRecorderState('recording')
    } catch (error) {
      cleanupRecordingResources()
      setRecorderState('idle')
      const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
      setSendError(denied ? 'Microphone access was denied.' : 'Voice recording could not start.')
    }
  }

  const handleEditMessage = (content) => {
    setDraft(normalizeMessageText(content))
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const length = textareaRef.current?.value?.length || 0
      textareaRef.current?.setSelectionRange?.(length, length)
    })
  }

  const handleCopyMessage = async (messageKey, content) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalizeMessageText(content))
      } else {
        throw new Error('Clipboard not available')
      }
      setCopiedMessageKey(messageKey)
      window.setTimeout(() => {
        setCopiedMessageKey((current) => (current === messageKey ? '' : current))
      }, 4500)
    } catch (_error) {
      setSendError('Could not copy that message.')
    }
  }

  const handleShareMessage = async (messageKey, content) => {
    const text = normalizeMessageText(content)
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text })
        return
      }
      await handleCopyMessage(messageKey, content)
    } catch (error) {
      if (error?.name === 'AbortError') return
      setSendError('Could not share that message.')
    }
  }

  const openImageViewer = (image) => {
    if (!image?.src && !image?.dataUrl) return
    setImageViewer({
      src: image.src || image.dataUrl,
    })
  }

  const openUserActionDialog = (message) => {
    if (!message || !normalizeMessageText(message.content)) return
    setUserActionDialog({
      id: message.id,
      content: message.content,
      canEdit: canEditUserMessage(message.id),
    })
  }

  const clearUserLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const startUserLongPress = (message, event) => {
    if (event.pointerType !== 'touch') return
    clearUserLongPress()
    longPressTimerRef.current = window.setTimeout(() => {
      openUserActionDialog(message)
      longPressTimerRef.current = null
    }, 420)
  }

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) {
      setSendError('Please attach image files.')
      e.target.value = ''
      return
    }
    setSendError('')
    try {
      const toAdd = []
      for (const file of images) {
        if (toAdd.length >= 2) break
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const raw = String(dataUrl)
        const [, base64 = ''] = raw.split(',', 2)
        toAdd.push({
          name: file.name,
          mime: file.type || 'image/png',
          base64,
          dataUrl: raw,
        })
      }
      setAttachedImages((prev) => [...prev, ...toAdd].slice(0, 2))
    } catch (_error) {
      setSendError('Could not read that image file.')
    } finally {
      e.target.value = ''
    }
  }

  const removeAttachedImage = (index) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleQuickAction = (prompt) => {
    if (pendingAssistant) return
    setDraft(prompt)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const len = textareaRef.current?.value?.length || 0
      textareaRef.current?.setSelectionRange?.(len, len)
    })
  }

  const sendCoachMessage = async ({
    message,
    visibleUserMessage = null,
    visibleUserBadge = '',
    imagePayload = null,
    imagePayloads = null,
    deepThinkingOverride = deepThinking,
    clearComposer = false,
  }) => {
    const normalizedImagePayloads = Array.isArray(imagePayloads)
      ? imagePayloads.filter(Boolean).slice(0, 2)
      : imagePayload
        ? [imagePayload]
        : []
    const primaryImagePayload = normalizedImagePayloads[0] || null
    const trimmedMessage = String(message || '').trim()
    const finalMessage =
      trimmedMessage ||
      (primaryImagePayload ? 'Please analyze these image(s) and coach me based on them.' : '')
    if ((!trimmedMessage && !primaryImagePayload) || pendingAssistant) return

    const composerDraftSnapshot = draft
    const composerImagesSnapshot = attachedImages.map((item) => ({ ...item }))
    const requestId = activeRequestIdRef.current + 1
    activeRequestIdRef.current = requestId
    streamAbortRef.current?.abort?.()
    const controller = new AbortController()
    streamAbortRef.current = controller

    setSendError('')
    if (generationStopped) {
      setGenerationStopped(false)
      setStreamingReply('')
    }
    const displayMessage =
      typeof visibleUserMessage === 'string' ? visibleUserMessage : trimmedMessage
    setPendingUserMessage(displayMessage)
    setPendingUserBadge(visibleUserBadge)
    setPendingUserImages(normalizedImagePayloads)
    setPendingAssistant(true)
    setStreamingReply('')
    setAssistantLoadingPhase(0)
    setAssistantDeepThinkingMode(!!deepThinkingOverride)
    streamTextRef.current = ''
    clearAssistantTimers()

    // Step-based loader text while the first tokens are still streaming.
    const t1 = deepThinkingOverride ? 900 : 650
    const t2 = deepThinkingOverride ? 2300 : 1600
    assistantStatusTimersRef.current.push(setTimeout(() => setAssistantLoadingPhase(1), t1))
    assistantStatusTimersRef.current.push(setTimeout(() => setAssistantLoadingPhase(2), t2))
    if (clearComposer) {
      setDraft('')
      setAttachedImages([])
    }

    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')

      let finalConversationId = selectedConversationId ?? null
      let streamError = null

      const streamPayload = {
        message: finalMessage,
        display_message: displayMessage || null,
        retry_label: visibleUserBadge || null,
        conversation_id: selectedConversationId != null ? Number(selectedConversationId) : null,
        deep_thinking: Boolean(deepThinkingOverride),
      }
      if (primaryImagePayload?.base64) {
        streamPayload.image_base64 = primaryImagePayload.base64
        streamPayload.image_mime = primaryImagePayload.mime || 'image/png'
      }
      if (normalizedImagePayloads.length > 0) {
        const validImages = normalizedImagePayloads.filter((item) => item?.base64)
        if (validImages.length > 0) {
          streamPayload.image_base64s = validImages.map((item) => item.base64)
          streamPayload.image_mimes = validImages.map((item) => item.mime || 'image/png')
        }
      }
      await coachApi.streamMessage(token, streamPayload, {
        channelId,
        signal: controller.signal,
        onEvent: ({ event, data }) => {
          if (activeRequestIdRef.current !== requestId) return
          if (event === 'meta' && data?.conversation_id != null) {
            finalConversationId = data.conversation_id
          }
          if (event === 'chunk') {
            const text = typeof data === 'string' ? data : data?.text
            if (text) {
              if (assistantStatusTimersRef.current.length) clearAssistantTimers()
              setAssistantLoadingPhase((prev) => (prev < 2 ? 2 : prev))

              streamTextRef.current += text
              if (streamCommitRafRef.current == null) {
                streamCommitRafRef.current = requestAnimationFrame(() => {
                  streamCommitRafRef.current = null
                  const next = streamTextRef.current
                  startTransition(() => {
                    setStreamingReply(next)
                  })
                })
              }
            }
          }
          if (event === 'replace') {
            const text = typeof data === 'string' ? data : data?.text
            if (assistantStatusTimersRef.current.length) clearAssistantTimers()
            setAssistantLoadingPhase(3)
            streamTextRef.current = text || ''
            if (streamCommitRafRef.current) cancelAnimationFrame(streamCommitRafRef.current)
            streamCommitRafRef.current = null
            startTransition(() => {
              setStreamingReply(text || '')
            })
          }
          if (event === 'done' && data?.conversation_id != null) {
            finalConversationId = data.conversation_id
          }
          if (event === 'error') {
            streamError = data?.detail || 'Could not stream coach response.'
          }
        },
      })

      if (streamError) {
        throw new Error(streamError)
      }

      if (activeRequestIdRef.current !== requestId) return

      if (finalConversationId != null) {
        await refreshCoachConversationCache(queryClient, finalConversationId)
        if (finalConversationId !== selectedConversationId) {
          setCoachHash(finalConversationId)
        }
      }
    } catch (error) {
      if (isAbortError(error)) return
      if (clearComposer) {
        setDraft(composerDraftSnapshot)
        setAttachedImages(
          composerImagesSnapshot.map((item) => ({
            ...item,
            dataUrl: item.dataUrl || `data:${item.mime || 'image/png'};base64,${item.base64 || ''}`,
          }))
        )
      }
      setSendError(error?.message || 'Could not send your message.')
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null
      }
      if (activeRequestIdRef.current === requestId) {
        // Delay one frame so React Query cache data renders before we
        // clear the streaming overlay — prevents a brief content flash.
        requestAnimationFrame(() => {
          if (activeRequestIdRef.current === requestId) {
            resetPendingExchange()
          }
        })
      }
    }
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (isVoiceMode) return
    const imagePayloads = attachedImages.slice(0, 2)
    await sendCoachMessage({
      message: draft,
      imagePayloads,
      clearComposer: true,
    })
  }

  const assistantPromptMap = useMemo(() => {
    const promptMap = new Map()
    for (let i = 0; i < messages.length; i += 1) {
      const current = messages[i]
      if (current.role !== 'assistant') continue
      for (let cursor = i - 1; cursor >= 0; cursor -= 1) {
        if (messages[cursor]?.role === 'user') {
          const presentation = getUserMessagePresentation(messages[cursor], cursor, messages)
          promptMap.set(current.id, {
            message: presentation.content,
            images: presentation.images,
          })
          break
        }
      }
    }
    return promptMap
  }, [messages])

  const handleRetryAssistant = async (assistantMessageId, mode) => {
    const retryContext = assistantPromptMap.get(assistantMessageId)
    if (
      !retryContext ||
      (!retryContext.message && (!retryContext.images || retryContext.images.length === 0))
    ) {
      setSendError('Could not find the original user prompt for this reply.')
      return
    }
    const basePrompt = retryContext.message || ''
    const imagePayloads = retryContext.images?.slice(0, 2) || []

    if (mode === 'custom') {
      const custom = customRetryPrompt.trim()
      if (!custom) return
      setRetryMenuKey('')
      setCustomRetryPrompt('')
      await sendCoachMessage({
        message: `${basePrompt}\n\nExtra direction for this retry: ${custom}`,
        visibleUserMessage: basePrompt,
        visibleUserBadge: 'Custom retry',
        imagePayloads,
      })
      return
    }

    setRetryMenuKey('')
    setCustomRetryPrompt('')
    await sendCoachMessage({
      message: basePrompt,
      visibleUserMessage: basePrompt,
      visibleUserBadge: mode === 'think-longer' ? 'Think longer' : 'Retry',
      imagePayloads,
      deepThinkingOverride: mode === 'think-longer' ? true : deepThinking,
    })
  }

  const renderMessageActions = (message) => {
    const messageKey = `message-${message.id}`

    if (message.role === 'user') {
      if (!normalizeMessageText(message.content)) return null
      const isCopied = copiedMessageKey === messageKey
      return (
        <div className="coach-message-actions coach-message-actions--user">
          <button
            type="button"
            className={`coach-message-action ${isCopied ? 'is-copied' : ''}`}
            onClick={() => handleCopyMessage(messageKey, message.content)}
            aria-label={isCopied ? 'Copied' : 'Copy'}
          >
            {isCopied ? <IconCheck /> : <IconCopy />}
          </button>
          {canEditUserMessage(message.id) ? (
            <button
              type="button"
              className="coach-message-action"
              onClick={() => handleEditMessage(message.content)}
              aria-label="Edit"
            >
              <IconEdit />
            </button>
          ) : null}
        </div>
      )
    }

    const isRetryMenuOpen = retryMenuKey === messageKey
    const isLatestAssistant = message.id === lastAssistantMessageId

    const isCopied = copiedMessageKey === messageKey
    return (
      <div className="coach-message-actions" data-retry-root="true">
        <button
          type="button"
          className={`coach-message-action ${isCopied ? 'is-copied' : ''}`}
          onClick={() => handleCopyMessage(messageKey, message.content)}
          aria-label={isCopied ? 'Copied' : 'Copy'}
        >
          {isCopied ? <IconCheck /> : <IconCopy />}
        </button>
        <button
          type="button"
          className="coach-message-action"
          onClick={() => handleShareMessage(messageKey, message.content)}
          aria-label="Share"
        >
          <IconShare />
        </button>
        {isLatestAssistant ? (
          <div className="coach-retry-menu-wrap" data-retry-root="true">
            <button
              type="button"
              className={`coach-message-action ${isRetryMenuOpen ? 'is-active' : ''}`}
              onClick={() => {
                setRetryMenuKey((current) => (current === messageKey ? '' : messageKey))
                setCustomRetryPrompt('')
              }}
              aria-label="Try again"
              aria-expanded={isRetryMenuOpen}
            >
              <IconRefresh />
            </button>
            {isRetryMenuOpen ? (
              <div className="coach-retry-menu" data-retry-root="true">
                <button
                  type="button"
                  className="coach-retry-option"
                  onClick={() => handleRetryAssistant(message.id, 'retry')}
                >
                  Try again
                </button>
                <button
                  type="button"
                  className="coach-retry-option"
                  onClick={() => handleRetryAssistant(message.id, 'think-longer')}
                >
                  Think longer
                </button>
                <div className="coach-retry-custom">
                  <textarea
                    ref={retryInputRef}
                    value={customRetryPrompt}
                    onChange={(e) => setCustomRetryPrompt(String(e.target.value).slice(0, 100))}
                    placeholder="Add a custom retry prompt..."
                    rows={3}
                    className="coach-retry-input"
                    maxLength={100}
                    onKeyDown={(event) => {
                      if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key === 'Enter' &&
                        customRetryPrompt.trim()
                      ) {
                        event.preventDefault()
                        handleRetryAssistant(message.id, 'custom')
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="coach-retry-submit"
                    disabled={!customRetryPrompt.trim()}
                    onClick={() => handleRetryAssistant(message.id, 'custom')}
                  >
                    Use custom prompt
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  const renderUserMessageBody = ({ content, badge = '', images = [], keyPrefix }) => (
    <div className="coach-user-message-stack">
      {badge ? (
        <div className="coach-user-message-meta">
          <span className="coach-user-retry-badge">{badge}</span>
        </div>
      ) : null}
      {images.length > 0 ? (
        <div className="coach-message-images">
          {images.map((image, index) => (
            <button
              key={`${keyPrefix}-image-${image.id || index}`}
              type="button"
              className="coach-message-image-card"
              onClick={() => openImageViewer(image)}
              aria-label="View attached image"
            >
              <img src={image.src || image.dataUrl} alt="" className="coach-message-image" />
            </button>
          ))}
        </div>
      ) : null}
      {content ? (
        <div className="coach-message-bubble">{renderMessageContent(content, keyPrefix)}</div>
      ) : null}
    </div>
  )

  /* Row/footer render closes over in-component render helpers; deps list tracks reactive state only */
  /* eslint-disable react-hooks/exhaustive-deps */
  const handleFollowUpClick = (prompt) => {
    if (pendingAssistant) return
    sendCoachMessage({ message: prompt, clearComposer: true })
  }

  const coachHistoryItemContent = useCallback(
    (messageIndex, message) => {
      const userPresentation =
        message.role === 'user' ? getUserMessagePresentation(message, messageIndex, messages) : null
      const visibleMessage = userPresentation
        ? { ...message, content: userPresentation.content }
        : message

      const isAssistant = message.role !== 'user'
      const isLastAssistant = isAssistant && message.id === lastAssistantMessageId
      let assistantCleanText = ''
      let assistantFollowUps = []
      if (isAssistant) {
        const parsed = parseFollowUps(visibleMessage.content)
        assistantCleanText = parsed.cleanText
        assistantFollowUps = parsed.followUps
      }

      return (
        <article
          className={`coach-message ${message.role === 'user' ? 'coach-message--user' : 'coach-message--assistant'}`}
          onContextMenu={
            message.role === 'user'
              ? (event) => {
                  event.preventDefault()
                  openUserActionDialog(visibleMessage)
                }
              : undefined
          }
          onPointerDown={
            message.role === 'user'
              ? (event) => startUserLongPress(visibleMessage, event)
              : undefined
          }
          onPointerUp={message.role === 'user' ? clearUserLongPress : undefined}
          onPointerLeave={message.role === 'user' ? clearUserLongPress : undefined}
          onPointerCancel={message.role === 'user' ? clearUserLongPress : undefined}
        >
          {message.role === 'user' ? (
            renderUserMessageBody({
              content: userPresentation?.content || '',
              badge: userPresentation?.badge || '',
              images: userPresentation?.images || [],
              keyPrefix: `message-${message.id}`,
            })
          ) : (
            <div className="coach-message-bubble">
              {renderMessageContent(assistantCleanText, `message-${message.id}`)}
            </div>
          )}
          {renderMessageActions(visibleMessage)}
          {isLastAssistant && assistantFollowUps.length > 0 && !pendingAssistant ? (
            <div className="coach-followup-actions">
              {assistantFollowUps.map((text, i) => (
                <button
                  key={`followup-${message.id}-${i}`}
                  type="button"
                  className="coach-followup-btn"
                  onClick={() => handleFollowUpClick(text)}
                >
                  <span className="coach-followup-btn-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 11l3-3-3-3" />
                      <path d="M9 11l3-3-3-3" />
                    </svg>
                  </span>
                  <span className="coach-followup-btn-label">{text}</span>
                </button>
              ))}
            </div>
          ) : null}
        </article>
      )
    },
    [
      messages,
      copiedMessageKey,
      retryMenuKey,
      customRetryPrompt,
      lastAssistantMessageId,
      lastUserMessageId,
      pendingAssistant,
    ]
  )

  const coachVirtuosoFooter = useCallback(
    () => (
      <div className="coach-virtuoso-footer">
        {pendingUserMessage || pendingUserImages.length > 0 ? (
          <article
            ref={pendingUserRef}
            className="coach-message coach-message--user coach-message--enter"
            onContextMenu={(event) => {
              event.preventDefault()
              openUserActionDialog({ id: 'pending-user', content: pendingUserMessage || '' })
            }}
            onPointerDown={(event) =>
              startUserLongPress({ id: 'pending-user', content: pendingUserMessage || '' }, event)
            }
            onPointerUp={clearUserLongPress}
            onPointerLeave={clearUserLongPress}
            onPointerCancel={clearUserLongPress}
          >
            {renderUserMessageBody({
              content: pendingUserMessage || '',
              badge: pendingUserBadge,
              images: pendingUserImages,
              keyPrefix: 'pending-user',
            })}
            {renderMessageActions({
              id: 'pending-user',
              role: 'user',
              content: pendingUserMessage,
            })}
          </article>
        ) : null}

        {pendingAssistant ? (
          <article className="coach-message coach-message--assistant coach-message--enter">
            <div
              className={`coach-message-bubble ${streamingReply ? 'coach-message-bubble--streaming' : 'coach-message-bubble--loading'}`}
            >
              {streamingReply ? (
                renderMessageContent(
                  parseFollowUps(streamingReply).cleanText,
                  'streaming-reply',
                  true
                )
              ) : (
                <div
                  className={`coach-assistant-loader ${assistantDeepThinkingMode ? 'is-deep' : ''}`}
                  aria-label={assistantDeepThinkingMode ? 'Deep thinking' : 'Loading response'}
                >
                  <span className="coach-assistant-loader-orb" aria-hidden="true" />
                  <span className="coach-assistant-loader-lines" aria-hidden="true">
                    <span className="coach-assistant-loader-line coach-assistant-loader-line--lg" />
                    <span className="coach-assistant-loader-line coach-assistant-loader-line--md" />
                    <span className="coach-assistant-loader-line coach-assistant-loader-line--sm" />
                  </span>
                  {assistantDeepThinkingMode ? (
                    <span className="coach-assistant-loader-label">Deep thinking</span>
                  ) : null}
                </div>
              )}
            </div>
            <button
              type="button"
              className="coach-stop-gen-btn"
              onClick={handleStopGeneration}
              aria-label="Stop generating"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                <rect x="3" y="3" width="10" height="10" rx="2" />
              </svg>
              <span>Stop</span>
            </button>
          </article>
        ) : !pendingAssistant && generationStopped && streamingReply ? (
          <article className="coach-message coach-message--assistant">
            <div className="coach-message-bubble">
              {renderMessageContent(parseFollowUps(streamingReply).cleanText, 'stopped-reply')}
            </div>
          </article>
        ) : null}

        {conversationQuery.isError ? (
          <div className="coach-thread-state coach-thread-state--error">
            {conversationQuery.error?.message || 'Could not load this chat.'}
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>
    ),
    [
      pendingUserMessage,
      pendingUserImages,
      pendingUserBadge,
      pendingAssistant,
      streamingReply,
      assistantDeepThinkingMode,
      generationStopped,
      conversationQuery.isError,
      conversationQuery.error,
    ]
  )
  /* eslint-enable react-hooks/exhaustive-deps */

  const virtuosoComponents = useMemo(
    () => ({
      Scroller: CoachChatVirtuosoScroller,
      List: CoachChatVirtuosoList,
      Item: CoachChatVirtuosoItem,
      Footer: coachVirtuosoFooter,
    }),
    [coachVirtuosoFooter]
  )

  const isRecording = recorderState === 'recording'
  const isTranscribing = recorderState === 'transcribing'
  const isVoiceMode = isRecording || isTranscribing
  const hasComposerContent = Boolean(draft.trim()) || attachedImages.length > 0
  const emptyGreeting = EMPTY_GREETING_TITLES[emptyGreetingIndex] || EMPTY_GREETING_TITLES[0]

  useLayoutEffect(() => {
    if (activeTab !== 'coach') return undefined
    const footer = composerWrapRef.current
    const shell = coachChatShellRef.current
    if (!footer || !shell) return undefined

    const syncComposerStackVar = () => {
      const h = footer.getBoundingClientRect().height
      shell.style.setProperty('--coach-composer-stack-px', `${Math.max(0, Math.ceil(h))}px`)
    }

    syncComposerStackVar()
    const ro = new ResizeObserver(syncComposerStackVar)
    ro.observe(footer)
    return () => {
      ro.disconnect()
      shell.style.removeProperty('--coach-composer-stack-px')
    }
  }, [activeTab])

  if (shellManaged) {
    return (
      <>
        <div className="coach-header-shade" aria-hidden="true" />
        <TabBar
          tabs={COACH_TABS.map((t) => ({ id: t.id, label: t.label }))}
          value={activeTab}
          onChange={handleTabClick}
          ariaLabel="Tool switcher"
          variant="modal"
          className="coach-tabbar coach-tabbar--floating"
        />
        <div className="coach-main-body">
          {/* Scripts tab — next update: <ScriptGenerator> moved to src/next-update-ideas/ScriptGenerator */}
          {activeTab === 'thumbnails' ? (
            <ThumbnailGenerator
              channelId={channelId}
              onOpenPersonas={() => onOpenPersonas?.()}
              onOpenStyles={() => setShowStylesModal(true)}
              conversationId={selectedThumbnailConversationId}
              onConversationCreated={setThumbnailConversationHash}
            />
          ) : (
            <div
              id="coach-panel-coach"
              className="coach-main"
              role="tabpanel"
              aria-labelledby="coach-tab-coach"
            >
              <section
                ref={coachChatShellRef}
                className={`coach-chat-shell${isEmptyScreen ? ' coach-chat-shell--empty' : ''}`}
              >
                <div
                  ref={(el) => {
                    if (!showCoachVirtuoso) threadRef.current = el
                  }}
                  className={`coach-thread ${coachLayoutCentered ? 'coach-thread--empty' : ''} ${showCoachVirtuoso ? 'coach-thread--virtualized' : ''} ${isHistoryLoading ? 'coach-thread--history-loading' : ''}`}
                >
                  {isHistoryLoading ? (
                    <ChatHistoryLoading
                      kicker="AI Coach"
                      label="Loading your conversation…"
                      subtitle="Syncing messages and channel context."
                    />
                  ) : null}

                  {isEmptyScreen ? (
                    <div className="coach-empty-state">
                      <span className="coach-empty-state-kicker">Scriptz AI Coach</span>
                      <h1>{emptyGreeting}</h1>
                      <div className="coach-empty-actions" role="group" aria-label="Quick actions">
                        {EMPTY_QUICK_ACTIONS.map((action) => {
                          const Icon = action.Icon
                          return (
                            <button
                              key={action.id}
                              type="button"
                              className={`coach-empty-action coach-empty-action--${action.id}`}
                              onClick={() => handleQuickAction(action.prompt)}
                            >
                              <span className="coach-empty-action-icon-wrap" aria-hidden>
                                {Icon ? <Icon /> : null}
                              </span>
                              <span className="coach-empty-action-label">{action.text}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {showCoachVirtuoso ? (
                    <Virtuoso
                      key={
                        selectedConversationId != null
                          ? String(selectedConversationId)
                          : 'coach-new'
                      }
                      ref={virtuosoRef}
                      className="coach-thread-virtuoso"
                      data={messages}
                      scrollerRef={(el) => {
                        if (showCoachVirtuoso) threadRef.current = el
                      }}
                      computeItemKey={(_, item) => item.id}
                      increaseViewportBy={{ top: 320, bottom: 420 }}
                      initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
                      skipAnimationFrameInResizeObserver
                      itemContent={coachHistoryItemContent}
                      components={virtuosoComponents}
                      atBottomStateChange={(atBottom) => {
                        if (atBottom) {
                          setShowScrollToBottom(false)
                          scrollingToBottomRef.current = false
                        } else if (!scrollingToBottomRef.current) {
                          const el = threadRef.current
                          if (el && el.scrollHeight > el.clientHeight + 1)
                            setShowScrollToBottom(true)
                        }
                      }}
                      followOutput={(isAtBottom) => (isAtBottom ? 'auto' : false)}
                    />
                  ) : null}

                  {!showCoachVirtuoso && !isHistoryLoading && conversationQuery.isError ? (
                    <div className="coach-thread-state coach-thread-state--error">
                      {conversationQuery.error?.message || 'Could not load this chat.'}
                    </div>
                  ) : null}

                  {!showCoachVirtuoso ? <div ref={messagesEndRef} /> : null}
                </div>

                <div
                  className={`coach-scroll-to-bottom ${showScrollToBottom && !isEmptyScreen ? 'coach-scroll-to-bottom--visible' : ''}`}
                  aria-hidden={!showScrollToBottom || isEmptyScreen}
                >
                  <button
                    type="button"
                    className="coach-scroll-to-bottom-btn"
                    onClick={scrollToBottom}
                    aria-label="Scroll to bottom"
                    title="Scroll to bottom"
                  >
                    <IconChevronDown />
                  </button>
                </div>

                <footer ref={composerWrapRef} className="coach-composer-wrap">
                  {sendError ? <div className="coach-compose-error">{sendError}</div> : null}
                  <form
                    className={`coach-composer ${isVoiceMode ? 'is-recording' : ''}`}
                    onSubmit={handleSubmit}
                    aria-busy={isTranscribing}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="coach-file-input"
                      onChange={handleFileChange}
                    />
                    {attachedImages.length > 0 ? (
                      <div className="coach-composer-previews">
                        {attachedImages.map((img, index) => (
                          <div key={index} className="coach-composer-preview-wrap">
                            <img src={img.dataUrl} alt="" className="coach-composer-preview-img" />
                            <button
                              type="button"
                              className="coach-composer-preview-remove"
                              onClick={() => removeAttachedImage(index)}
                              aria-label="Remove attached image"
                            >
                              <IconClose />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {isVoiceMode ? (
                      <div
                        className={`coach-composer-recording ${isTranscribing ? 'is-transcribing' : ''}`}
                        aria-live="polite"
                      >
                        <div className="coach-composer-recording-copy">
                          <span className="coach-composer-recording-label">
                            {isTranscribing ? 'Transcribing with Gemini...' : 'Recording...'}
                          </span>
                          <span className="coach-composer-recording-hint">
                            {isTranscribing
                              ? 'Turning your speech into text in the input bar.'
                              : 'Speak naturally, then press stop.'}
                          </span>
                        </div>
                        <div className="coach-composer-waveform" aria-hidden="true">
                          {recordingLevels.map((level, index) => (
                            <span
                              key={`wave-${index}`}
                              className="coach-composer-waveform-bar"
                              style={{ '--wave-scale': String(level) }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="coach-composer-input-wrap">
                        <textarea
                          ref={textareaRef}
                          value={draft}
                          onChange={(e) =>
                            setDraft(String(e.target.value).slice(0, COACH_COMPOSER_MAX_CHARS))
                          }
                          rows={1}
                          className="coach-composer-input"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleSubmit(e)
                            }
                          }}
                        />
                        {!draft ? <AnimatedComposerHint hints={COMPOSER_HINTS} /> : null}
                      </div>
                    )}
                    <div className="coach-composer-actions">
                      <div className="coach-composer-actions-left">
                        <button
                          type="button"
                          className="coach-composer-tool coach-composer-tool--circle"
                          onClick={handleAttachClick}
                          disabled={attachedImages.length >= 2 || isVoiceMode}
                          aria-label="Attach image"
                          title={attachedImages.length >= 2 ? 'Max 2 images' : 'Attach image'}
                        >
                          <IconPaperclip />
                        </button>
                        <button
                          type="button"
                          className={`coach-composer-tool coach-composer-tool--pill coach-composer-deep-thinking ${deepThinking ? 'is-active' : ''}`}
                          onClick={() => setDeepThinking((prev) => !prev)}
                          disabled={isVoiceMode}
                          aria-pressed={deepThinking}
                          title="Deep thinking"
                          aria-label="Deep thinking"
                        >
                          <IconBrain />
                          <span className="coach-composer-pill-label">Deep thinking</span>
                        </button>
                      </div>
                      {isRecording ? (
                        <button
                          type="button"
                          className="coach-composer-send coach-composer-primary-action coach-composer-stop"
                          onClick={stopVoiceRecording}
                          aria-label="Stop recording"
                          title="Stop recording"
                        >
                          <IconStop />
                        </button>
                      ) : pendingAssistant ? (
                        <button
                          type="button"
                          className="coach-composer-send coach-composer-primary-action coach-composer-stop"
                          onClick={handleStopGeneration}
                          aria-label="Stop generating"
                          title="Stop generating"
                        >
                          <IconStop />
                        </button>
                      ) : hasComposerContent ? (
                        <button
                          type="submit"
                          className="coach-composer-send coach-composer-primary-action is-send"
                          disabled={
                            (!draft.trim() && attachedImages.length === 0) || isTranscribing
                          }
                          aria-label="Send message"
                        >
                          <IconArrowUp />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`coach-composer-send coach-composer-primary-action coach-composer-mic ${isVoiceMode ? 'is-listening' : ''}`}
                          onClick={startVoiceRecording}
                          disabled={!sttSupported || pendingAssistant || isTranscribing}
                          aria-label={
                            sttSupported ? 'Start voice input' : 'Voice input not supported'
                          }
                          title={sttSupported ? 'Start voice input' : 'Voice input not supported'}
                        >
                          <IconMic />
                        </button>
                      )}
                    </div>
                  </form>
                </footer>
              </section>
            </div>
          )}
        </div>

        {imageViewer ? (
          <div
            className="coach-image-viewer-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setImageViewer(null)}
          >
            <div className="coach-image-viewer" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="coach-image-viewer-close"
                onClick={() => setImageViewer(null)}
                aria-label="Close image viewer"
              >
                <IconClose />
              </button>
              <img src={imageViewer.src} alt="" className="coach-image-viewer-img" />
            </div>
          </div>
        ) : null}

        {showStylesModal && <StylesModal onClose={() => setShowStylesModal(false)} />}

        {userActionDialog ? (
          <div
            className="coach-user-dialog-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setUserActionDialog(null)}
          >
            <div className="coach-user-dialog" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="coach-user-dialog-action"
                onClick={() => {
                  handleCopyMessage(`message-${userActionDialog.id}`, userActionDialog.content)
                  setUserActionDialog(null)
                }}
              >
                <IconCopy />
                <span>Copy</span>
              </button>
              {userActionDialog.canEdit ? (
                <button
                  type="button"
                  className="coach-user-dialog-action"
                  onClick={() => {
                    handleEditMessage(userActionDialog.content)
                    setUserActionDialog(null)
                  }}
                >
                  <IconEdit />
                  <span>Edit</span>
                </button>
              ) : null}
              <button
                type="button"
                className="coach-user-dialog-dismiss"
                onClick={() => setUserActionDialog(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="coach-page">
      <AppShellLayout
        shellOnly
        mainClassName="coach-main-wrap"
        sidebar={
          <Sidebar
            user={user}
            onOpenSettings={openSettings}
            onOpenPersonas={() => setShowPersonasModal(true)}
            onLogout={handleLogout}
            currentScreen="coach"
            activeTab={activeTab}
            activeConversationId={selectedConversationId}
            activeScriptConversationId={selectedScriptConversationId}
            activeThumbnailConversationId={selectedThumbnailConversationId}
            onNewChat={handleNewChat}
          />
        }
      >
        <div className="coach-header-shade" aria-hidden="true" />
        <TabBar
          tabs={COACH_TABS.map((t) => ({ id: t.id, label: t.label }))}
          value={activeTab}
          onChange={handleTabClick}
          ariaLabel="Tool switcher"
          variant="modal"
          className="coach-tabbar coach-tabbar--floating"
        />
        <div className="coach-main-body">
          {/* Scripts tab — next update: <ScriptGenerator> moved to src/next-update-ideas/ScriptGenerator */}
          {activeTab === 'thumbnails' ? (
            <ThumbnailGenerator
              channelId={channelId}
              onOpenPersonas={() => setShowPersonasModal(true)}
              onOpenStyles={() => setShowStylesModal(true)}
              conversationId={selectedThumbnailConversationId}
              onConversationCreated={setThumbnailConversationHash}
            />
          ) : (
            <div
              id="coach-panel-coach"
              className="coach-main"
              role="tabpanel"
              aria-labelledby="coach-tab-coach"
            >
              <section
                ref={coachChatShellRef}
                className={`coach-chat-shell${isEmptyScreen ? ' coach-chat-shell--empty' : ''}`}
              >
                <div
                  ref={(el) => {
                    if (!showCoachVirtuoso) threadRef.current = el
                  }}
                  className={`coach-thread ${coachLayoutCentered ? 'coach-thread--empty' : ''} ${showCoachVirtuoso ? 'coach-thread--virtualized' : ''} ${isHistoryLoading ? 'coach-thread--history-loading' : ''}`}
                >
                  {isHistoryLoading ? (
                    <ChatHistoryLoading
                      kicker="AI Coach"
                      label="Loading your conversation…"
                      subtitle="Syncing messages and channel context."
                    />
                  ) : null}

                  {isEmptyScreen ? (
                    <div className="coach-empty-state">
                      <span className="coach-empty-state-kicker">Scriptz AI Coach</span>
                      <h1>{emptyGreeting}</h1>
                      <div className="coach-empty-actions" role="group" aria-label="Quick actions">
                        {EMPTY_QUICK_ACTIONS.map((action) => {
                          const Icon = action.Icon
                          return (
                            <button
                              key={action.id}
                              type="button"
                              className={`coach-empty-action coach-empty-action--${action.id}`}
                              onClick={() => handleQuickAction(action.prompt)}
                            >
                              <span className="coach-empty-action-icon-wrap" aria-hidden>
                                {Icon ? <Icon /> : null}
                              </span>
                              <span className="coach-empty-action-label">{action.text}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {showCoachVirtuoso ? (
                    <Virtuoso
                      key={
                        selectedConversationId != null
                          ? String(selectedConversationId)
                          : 'coach-new'
                      }
                      ref={virtuosoRef}
                      className="coach-thread-virtuoso"
                      data={messages}
                      scrollerRef={(el) => {
                        if (showCoachVirtuoso) threadRef.current = el
                      }}
                      computeItemKey={(_, item) => item.id}
                      increaseViewportBy={{ top: 320, bottom: 420 }}
                      initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
                      skipAnimationFrameInResizeObserver
                      itemContent={coachHistoryItemContent}
                      components={virtuosoComponents}
                      atBottomStateChange={(atBottom) => {
                        if (atBottom) {
                          setShowScrollToBottom(false)
                          scrollingToBottomRef.current = false
                        } else if (!scrollingToBottomRef.current) {
                          const el = threadRef.current
                          if (el && el.scrollHeight > el.clientHeight + 1)
                            setShowScrollToBottom(true)
                        }
                      }}
                      followOutput={(isAtBottom) => (isAtBottom ? 'auto' : false)}
                    />
                  ) : null}

                  {!showCoachVirtuoso && !isHistoryLoading && conversationQuery.isError ? (
                    <div className="coach-thread-state coach-thread-state--error">
                      {conversationQuery.error?.message || 'Could not load this chat.'}
                    </div>
                  ) : null}

                  {!showCoachVirtuoso ? <div ref={messagesEndRef} /> : null}
                </div>

                <div
                  className={`coach-scroll-to-bottom ${showScrollToBottom && !isEmptyScreen ? 'coach-scroll-to-bottom--visible' : ''}`}
                  aria-hidden={!showScrollToBottom || isEmptyScreen}
                >
                  <button
                    type="button"
                    className="coach-scroll-to-bottom-btn"
                    onClick={scrollToBottom}
                    aria-label="Scroll to bottom"
                    title="Scroll to bottom"
                  >
                    <IconChevronDown />
                  </button>
                </div>

                <footer ref={composerWrapRef} className="coach-composer-wrap">
                  {sendError ? <div className="coach-compose-error">{sendError}</div> : null}
                  <form
                    className={`coach-composer ${isVoiceMode ? 'is-recording' : ''}`}
                    onSubmit={handleSubmit}
                    aria-busy={isTranscribing}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="coach-file-input"
                      onChange={handleFileChange}
                    />
                    {attachedImages.length > 0 ? (
                      <div className="coach-composer-previews">
                        {attachedImages.map((img, index) => (
                          <div key={index} className="coach-composer-preview-wrap">
                            <img src={img.dataUrl} alt="" className="coach-composer-preview-img" />
                            <button
                              type="button"
                              className="coach-composer-preview-remove"
                              onClick={() => removeAttachedImage(index)}
                              aria-label="Remove attached image"
                            >
                              <IconClose />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {isVoiceMode ? (
                      <div
                        className={`coach-composer-recording ${isTranscribing ? 'is-transcribing' : ''}`}
                        aria-live="polite"
                      >
                        <div className="coach-composer-recording-copy">
                          <span className="coach-composer-recording-label">
                            {isTranscribing ? 'Transcribing with Gemini...' : 'Recording...'}
                          </span>
                          <span className="coach-composer-recording-hint">
                            {isTranscribing
                              ? 'Turning your speech into text in the input bar.'
                              : 'Speak naturally, then press stop.'}
                          </span>
                        </div>
                        <div className="coach-composer-waveform" aria-hidden="true">
                          {recordingLevels.map((level, index) => (
                            <span
                              key={`wave-${index}`}
                              className="coach-composer-waveform-bar"
                              style={{ '--wave-scale': String(level) }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="coach-composer-input-wrap">
                        <textarea
                          ref={textareaRef}
                          value={draft}
                          onChange={(e) =>
                            setDraft(String(e.target.value).slice(0, COACH_COMPOSER_MAX_CHARS))
                          }
                          rows={1}
                          className="coach-composer-input"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleSubmit(e)
                            }
                          }}
                        />
                        {!draft ? <AnimatedComposerHint hints={COMPOSER_HINTS} /> : null}
                      </div>
                    )}
                    <div className="coach-composer-actions">
                      <div className="coach-composer-actions-left">
                        <button
                          type="button"
                          className="coach-composer-tool coach-composer-tool--circle"
                          onClick={handleAttachClick}
                          disabled={attachedImages.length >= 2 || isVoiceMode}
                          aria-label="Attach image"
                          title={attachedImages.length >= 2 ? 'Max 2 images' : 'Attach image'}
                        >
                          <IconPaperclip />
                        </button>
                        <button
                          type="button"
                          className={`coach-composer-tool coach-composer-tool--pill coach-composer-deep-thinking ${deepThinking ? 'is-active' : ''}`}
                          onClick={() => setDeepThinking((prev) => !prev)}
                          disabled={isVoiceMode}
                          aria-pressed={deepThinking}
                          title="Deep thinking"
                          aria-label="Deep thinking"
                        >
                          <IconBrain />
                          <span className="coach-composer-pill-label">Deep thinking</span>
                        </button>
                      </div>
                      {isRecording ? (
                        <button
                          type="button"
                          className="coach-composer-send coach-composer-primary-action coach-composer-stop"
                          onClick={stopVoiceRecording}
                          aria-label="Stop recording"
                          title="Stop recording"
                        >
                          <IconStop />
                        </button>
                      ) : pendingAssistant ? (
                        <button
                          type="button"
                          className="coach-composer-send coach-composer-primary-action coach-composer-stop"
                          onClick={handleStopGeneration}
                          aria-label="Stop generating"
                          title="Stop generating"
                        >
                          <IconStop />
                        </button>
                      ) : hasComposerContent ? (
                        <button
                          type="submit"
                          className="coach-composer-send coach-composer-primary-action is-send"
                          disabled={
                            (!draft.trim() && attachedImages.length === 0) || isTranscribing
                          }
                          aria-label="Send message"
                        >
                          <IconArrowUp />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`coach-composer-send coach-composer-primary-action coach-composer-mic ${isVoiceMode ? 'is-listening' : ''}`}
                          onClick={startVoiceRecording}
                          disabled={!sttSupported || pendingAssistant || isTranscribing}
                          aria-label={
                            sttSupported ? 'Start voice input' : 'Voice input not supported'
                          }
                          title={sttSupported ? 'Start voice input' : 'Voice input not supported'}
                        >
                          <IconMic />
                        </button>
                      )}
                    </div>
                  </form>
                </footer>
              </section>
            </div>
          )}
        </div>
      </AppShellLayout>

      {imageViewer ? (
        <div
          className="coach-image-viewer-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setImageViewer(null)}
        >
          <div className="coach-image-viewer" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="coach-image-viewer-close"
              onClick={() => setImageViewer(null)}
              aria-label="Close image viewer"
            >
              <IconClose />
            </button>
            <img src={imageViewer.src} alt="" className="coach-image-viewer-img" />
          </div>
        </div>
      ) : null}

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

      {showPersonasModal && <PersonasModal onClose={() => setShowPersonasModal(false)} />}
      {showStylesModal && <StylesModal onClose={() => setShowStylesModal(false)} />}

      {userActionDialog ? (
        <div
          className="coach-user-dialog-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setUserActionDialog(null)}
        >
          <div className="coach-user-dialog" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="coach-user-dialog-action"
              onClick={() => {
                handleCopyMessage(`message-${userActionDialog.id}`, userActionDialog.content)
                setUserActionDialog(null)
              }}
            >
              <IconCopy />
              <span>Copy</span>
            </button>
            {userActionDialog.canEdit ? (
              <button
                type="button"
                className="coach-user-dialog-action"
                onClick={() => {
                  handleEditMessage(userActionDialog.content)
                  setUserActionDialog(null)
                }}
              >
                <IconEdit />
                <span>Edit</span>
              </button>
            ) : null}
            <button
              type="button"
              className="coach-user-dialog-dismiss"
              onClick={() => setUserActionDialog(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
