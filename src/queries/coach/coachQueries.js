import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { coachApi } from '../../api/coach'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

export function useCoachConversationsQuery(params = {}) {
  return useQuery({
    queryKey: queryKeys.coach.conversations(params),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [], total: 0, has_more: false, limit: params.limit ?? 50, offset: params.offset ?? 0 }
      return coachApi.listConversations(token, params)
    },
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
  })
}

export function useCoachConversationQuery(conversationId) {
  return useQuery({
    queryKey: queryKeys.coach.conversation(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return coachApi.getConversation(token, conversationId)
    },
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
  })
}

export function useSendCoachMessageMutation(channelId) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return coachApi.sendMessage(token, payload, channelId)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['coach', 'conversations'] })
      if (data?.conversation_id != null) {
        queryClient.invalidateQueries({ queryKey: queryKeys.coach.conversation(data.conversation_id) })
      }
    },
  })
}

export function useUpdateCoachConversationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ conversationId, payload }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return coachApi.updateConversation(token, conversationId, payload)
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['coach', 'conversations'] })
      if (variables?.conversationId != null) {
        queryClient.invalidateQueries({ queryKey: queryKeys.coach.conversation(variables.conversationId) })
      }
      return data
    },
  })
}

export function useDeleteCoachConversationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      await coachApi.deleteConversation(token, conversationId)
      return conversationId
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['coach', 'conversations'] })
      if (conversationId != null) {
        queryClient.removeQueries({ queryKey: queryKeys.coach.conversation(conversationId) })
      }
    },
  })
}
