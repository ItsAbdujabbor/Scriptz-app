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

export function useThumbnailConversationQuery(conversationId) {
  return useQuery({
    queryKey: queryKeys.thumbnails.conversation(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return thumbnailsApi.getConversation(token, conversationId)
    },
    ...chatThreadQueryOptions,
    placeholderData: (prev) => prev,
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
