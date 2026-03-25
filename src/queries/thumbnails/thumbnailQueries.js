import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { thumbnailsApi } from '../../api/thumbnails'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { queryKeys } from '../../lib/query/queryKeys'
import { queryFreshness } from '../../lib/query/queryConfig'

export function useThumbnailConversationsQuery(params = {}) {
  return useQuery({
    queryKey: queryKeys.thumbnails.conversations(params),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [], total: 0, has_more: false, limit: params.limit ?? 50, offset: params.offset ?? 0 }
      return thumbnailsApi.listConversations(token, params)
    },
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
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
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
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
      queryClient.invalidateQueries({ queryKey: ['thumbnails', 'conversations'] })
      if (data?.conversation_id != null) {
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnails.conversation(data.conversation_id) })
        onConversationCreated?.(data.conversation_id)
      }
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
      queryClient.invalidateQueries({ queryKey: ['thumbnails', 'conversations'] })
      if (variables?.conversationId != null) {
        queryClient.invalidateQueries({ queryKey: queryKeys.thumbnails.conversation(variables.conversationId) })
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
      queryClient.invalidateQueries({ queryKey: ['thumbnails', 'conversations'] })
      if (conversationId != null) {
        queryClient.removeQueries({ queryKey: queryKeys.thumbnails.conversation(conversationId) })
      }
    },
  })
}

export function useThumbnailsQuery(params = {}) {
  return useQuery({
    queryKey: queryKeys.thumbnails.list(params),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [], total: 0 }
      return thumbnailsApi.list(token, params)
    },
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.medium,
  })
}

export function useSaveThumbnailVariantMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return thumbnailsApi.saveVariant(token, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thumbnails'] })
    },
  })
}

export function useDeleteThumbnailMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (thumbnailId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      await thumbnailsApi.delete(token, thumbnailId)
      return thumbnailId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thumbnails'] })
    },
  })
}
