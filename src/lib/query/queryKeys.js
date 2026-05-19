export const queryKeys = {
  // Auth/session is kept in Zustand; these keys are for cached server state.
  user: {
    preferences: ['user', 'preferences'],
    profile: ['user', 'profile'],
    emailPreferences: ['user', 'emailPreferences'],
  },
  youtube: {
    channels: () => ['youtube', 'channels'],
    activeChannel: () => ['youtube', 'activeChannel'],
    channelInfo: (channelId) => ['youtube', 'channelInfo', channelId],
    videos: ({ channelId, perPage, search, sort, videoType }) => [
      'youtube',
      'videos',
      channelId,
      perPage,
      search ?? '',
      sort,
      videoType,
    ],
    videoOptimization: (videoId) => ['youtube', 'videoOptimization', videoId],
    titleRecommendations: (videoId, idea) => [
      'youtube',
      'titleRecommendations',
      videoId,
      idea ?? '',
    ],
    refinedDescription: (videoId, instruction, description) => [
      'youtube',
      'refinedDescription',
      videoId,
      instruction ?? '',
      description ?? '',
    ],
    generatedTags: (videoId, title, description) => [
      'youtube',
      'generatedTags',
      videoId,
      title ?? '',
      description ?? '',
    ],
  },
  dashboard: {
    insights: (channelId) => ['dashboard', 'insights', channelId ?? 'onboarding'],
    audit: (channelId) => ['dashboard', 'audit', channelId],
    growth: (channelId) => ['dashboard', 'growth', channelId],
    snapshot: (channelId, from, to) => ['dashboard', 'snapshot', channelId, from, to],
    bestTime: (channelId, utcOffsetMinutes) => [
      'dashboard',
      'bestTime',
      channelId,
      utcOffsetMinutes,
    ],
  },
  personas: {
    list: () => ['personas', 'list'],
    detail: (id) => ['personas', 'detail', id ?? ''],
  },
  styles: {
    list: () => ['styles', 'list'],
    detail: (id) => ['styles', 'detail', id ?? ''],
  },
  thumbnails: {
    conversations: (params = {}) => [
      'thumbnails',
      'conversations',
      params.limit ?? 50,
      params.offset ?? 0,
      params.channelId ?? '',
    ],
    conversation: (conversationId) => ['thumbnails', 'conversation', conversationId ?? 'new'],
    /**
     * Rating cache — keyed by a short fingerprint of the image URL so the
     * same rendered thumbnail is only rated once per session. The actual
     * URL (often a 400KB data URL) is never used as part of the key.
     */
    rating: (imageFingerprint) => ['thumbnails', 'rating', imageFingerprint ?? ''],
  },
  billing: {
    credits: ['billing', 'credits'],
    featureCosts: ['billing', 'featureCosts'],
    subscription: ['billing', 'subscription'],
    plans: ['billing', 'plans'],
    /* Ledger key — shared by useLedgerQuery in BillingSettingsPanel and
     * by `refreshBillingState()` so a single helper can invalidate every
     * billing surface (credits + sub + ledger) atomically after a payment. */
    ledger: ['billing', 'ledger', 'recent'],
    paymentMethod: ['billing', 'paymentMethod'],
  },
  modelTier: {
    state: ['modelTier', 'state'],
  },
}
