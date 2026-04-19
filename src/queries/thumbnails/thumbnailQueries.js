import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { thumbnailsApi } from '../../api/thumbnails'
import {
  chatThreadQueryOptions,
  mergeThumbnailConversationsListCache,
  refreshThumbnailConversationCache,
  removeThumbnailConversationFromListCaches,
} from '../../lib/query/chatCacheUtils'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { queryKeys } from '../../lib/query/queryKeys'
import { queryFreshness } from '../../lib/query/queryConfig'
import { invalidateCredits } from '../billing/creditsQueries'

/** Warm React Query after a chat turn so the thread is ready when the URL gains ?id= */
export async function prefetchThumbnailConversationCache(queryClient, conversationId) {
  if (conversationId == null) return
  const token = await getAccessTokenOrNull()
  if (!token) return
  try {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.thumbnails.conversation(conversationId),
      queryFn: () => thumbnailsApi.getConversation(token, conversationId),
      ...chatThreadQueryOptions,
    })
  } catch {
    /* Active screen will refetch; avoid wiping cache */
  }
}

export function useThumbnailConversationsQuery(params = {}) {
  return useQuery({
    queryKey: queryKeys.thumbnails.conversations(params),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token)
        return {
          items: [],
          total: 0,
          has_more: false,
          limit: params.limit ?? 50,
          offset: params.offset ?? 0,
        }
      return thumbnailsApi.listConversations(token, params)
    },
    staleTime: queryFreshness.long,
    gcTime: queryFreshness.chatThreadGc,
    placeholderData: (prev) => prev,
  })
}

/**
 * @param {number|string|null} conversationId
 * @param {{ pollWhilePending?: boolean }} [options] — when `pollWhilePending`
 *   is true, re-fetches the conversation every 4 seconds. Used so that a
 *   generation started by this tab finishes and shows up in the thread even
 *   if the user navigates away mid-request (the backend persists messages on
 *   completion; we just need to pick them up when polling ticks over).
 */
export function useThumbnailConversationQuery(conversationId, options = {}) {
  const { pollWhilePending = false } = options
  return useQuery({
    queryKey: queryKeys.thumbnails.conversation(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return thumbnailsApi.getConversation(token, conversationId)
    },
    ...chatThreadQueryOptions,
    refetchInterval: pollWhilePending ? 4000 : false,
    refetchIntervalInBackground: pollWhilePending,
    // When pending we want the latest server truth — ignore the short
    // staleTime that otherwise suppresses mount-time refetches.
    refetchOnMount: pollWhilePending ? 'always' : true,
    placeholderData: (prev) => prev,
  })
}

/**
 * Create an empty thumbnail conversation up-front so the UI can navigate
 * into it immediately (showing a pending spinner) while the first
 * generation request is still running in the background.
 */
export function useCreateThumbnailConversationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params = {}) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return thumbnailsApi.createConversation(token, params)
    },
    onSuccess: (conv) => {
      if (!conv?.id) return
      // Seed the detail cache so the destination screen renders instantly
      // with an empty thread (no flicker while the chat endpoint runs).
      // Shape must match ThumbnailConversationDetailResponse exactly:
      // { conversation, messages: { items, total, ... } }.
      queryClient.setQueryData(queryKeys.thumbnails.conversation(conv.id), {
        conversation: conv,
        messages: {
          items: [],
          total: 0,
          has_more: false,
          limit: 50,
          offset: 0,
          conversation_id: conv.id,
        },
      })
      // Prepend to any cached list so the sidebar shows the row immediately.
      queryClient.setQueriesData(
        { queryKey: ['thumbnails', 'conversations'], exact: false },
        (old) => {
          if (!old || typeof old !== 'object') return old
          const items = Array.isArray(old.items) ? old.items : []
          if (items.some((i) => Number(i.id) === Number(conv.id))) return old
          return { ...old, items: [conv, ...items], total: (old.total || 0) + 1 }
        }
      )
    },
  })
}

export function useThumbnailChatMutation(onConversationCreated) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return thumbnailsApi.chat(token, payload)
    },
    onSuccess: (data) => {
      if (data?.conversation_id != null) {
        onConversationCreated?.(data.conversation_id)
        void refreshThumbnailConversationCache(queryClient, data.conversation_id)
      }
      // Thumbnail generations debit credits server-side (20 × num_thumbnails) —
      // refresh the badge so the user sees the drop immediately.
      invalidateCredits(queryClient)
    },
    onError: () => {
      // Server may have refunded on AI failure — reconcile.
      invalidateCredits(queryClient)
    },
  })
}

export function useUpdateThumbnailConversationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ conversationId, payload }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return thumbnailsApi.updateConversation(token, conversationId, payload)
    },
    onSuccess: (data, variables) => {
      const id = variables?.conversationId
      if (id != null && data) {
        queryClient.setQueryData(queryKeys.thumbnails.conversation(id), (old) =>
          old && typeof old === 'object' ? { ...old, ...data } : old
        )
        mergeThumbnailConversationsListCache(queryClient, id, data)
      }
      return data
    },
  })
}

export function useDeleteThumbnailConversationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      await thumbnailsApi.deleteConversation(token, conversationId)
      return conversationId
    },
    onSuccess: (conversationId) => {
      if (conversationId != null) {
        removeThumbnailConversationFromListCaches(queryClient, conversationId)
        queryClient.removeQueries({ queryKey: queryKeys.thumbnails.conversation(conversationId) })
      }
    },
  })
}

/**
 * Cheap, non-cryptographic fingerprint of a large string (usually a data URL).
 * Good enough to uniquely identify a thumbnail in the rating cache — and it
 * keeps the React Query key under a few dozen bytes instead of hundreds of KB.
 */
function fingerprintImageUrl(url) {
  if (!url) return ''
  let h = 0
  for (let i = 0; i < url.length; i += 1) {
    h = (h * 31 + url.charCodeAt(i)) | 0
  }
  // Base36 encoding + length gives good separation with no collisions in
  // practice for our volumes.
  return `${url.length.toString(36)}:${(h >>> 0).toString(36)}`
}

function extractBase64FromDataUrl(url) {
  if (!url || typeof url !== 'string') return null
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma === -1) return null
  return url.slice(comma + 1)
}

/**
 * Rate a thumbnail exactly once per distinct image URL for the lifetime of
 * the session. The rating is cached in React Query with
 * `staleTime: Infinity`, so re-rendering, revisiting a conversation, or
 * mounting the same thumbnail elsewhere never triggers a second /rate call
 * (and never double-charges credits).
 *
 * Returns ``{ data: { rating_id, overall_score, ... }, isPending, error }``
 * — same shape the component used before, just centrally cached.
 */
export function useThumbnailRatingQuery(imageUrl) {
  const fingerprint = fingerprintImageUrl(imageUrl)
  return useQuery({
    queryKey: queryKeys.thumbnails.rating(fingerprint),
    enabled: !!imageUrl,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const base64 = extractBase64FromDataUrl(imageUrl)
      const payload = base64
        ? { thumbnail_image_base64: base64 }
        : { thumbnail_image_url: imageUrl }
      return thumbnailsApi.rate(token, payload)
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
