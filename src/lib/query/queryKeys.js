export const queryKeys = {
  // Auth/session is kept in Zustand; these keys are for cached server state.
  user: {
    preferences: ['user', 'preferences'],
    profile: ['user', 'profile'],
  },
  youtube: {
    channels: () => ['youtube', 'channels'],
    activeChannel: () => ['youtube', 'activeChannel'],
    channelInfo: (channelId) => ['youtube', 'channelInfo', channelId],
    videos: ({ channelId, page, perPage, search, sort, videoType }) => [
      'youtube',
      'videos',
      channelId,
      page,
      perPage,
      search ?? '',
      sort,
      videoType,
    ],
    videoOptimization: (videoId) => ['youtube', 'videoOptimization', videoId],
    titleRecommendations: (videoId, idea) => ['youtube', 'titleRecommendations', videoId, idea ?? ''],
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
    bestTime: (channelId, utcOffsetMinutes) => ['dashboard', 'bestTime', channelId, utcOffsetMinutes],
  },
  coach: {
    conversations: (params = {}) => [
      'coach',
      'conversations',
      params.limit ?? 50,
      params.offset ?? 0,
      params.search ?? '',
      params.isActive ?? 'all',
    ],
    conversation: (conversationId) => ['coach', 'conversation', conversationId ?? 'new'],
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
    list: (params = {}) => ['thumbnails', 'list', params.limit ?? 20, params.offset ?? 0],
    conversations: (params = {}) => [
      'thumbnails',
      'conversations',
      params.limit ?? 50,
      params.offset ?? 0,
      params.channelId ?? '',
    ],
    conversation: (conversationId) => ['thumbnails', 'conversation', conversationId ?? 'new'],
  },
  scripts: {
    conversations: (params = {}) => [
      'scripts',
      'conversations',
      params.limit ?? 50,
      params.offset ?? 0,
      params.channelId ?? '',
    ],
    conversation: (conversationId) => ['scripts', 'conversation', conversationId ?? 'new'],
  },
}

