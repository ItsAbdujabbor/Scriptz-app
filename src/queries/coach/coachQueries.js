import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { coachApi } from '../../api/coach'
import {
  mergeCoachConversationsListCache,
  refreshCoachConversationCache,
  removeCoachConversationFromListCaches,
} from '../../lib/query/chatCacheUtils'
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
    staleTime: queryFreshness.long,
    gcTime: queryFreshness.chatThreadGc,
    placeholderData: (prev) => prev,
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
    staleTime: queryFreshness.chatThread,
    gcTime: queryFreshness.chatThreadGc,
    placeholderData: (prev) => prev,
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
      if (data?.conversation_id != null) {
        void refreshCoachConversationCache(queryClient, data.conversation_id)
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
      const id = variables?.conversationId
      if (id != null && data) {
        queryClient.setQueryData(queryKeys.coach.conversation(id), (old) =>
          old && typeof old === 'object' ? { ...old, ...data } : old
        )
        mergeCoachConversationsListCache(queryClient, id, data)
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
      if (conversationId != null) {
        removeCoachConversationFromListCaches(queryClient, conversationId)
        queryClient.removeQueries({ queryKey: queryKeys.coach.conversation(conversationId) })
      }
    },
  })
}
