import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { scriptsApi } from '../../api/scripts'
import {
  mergeScriptConversationsListCache,
  removeScriptConversationFromListCaches,
} from '../../lib/query/chatCacheUtils'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

export function useScriptConversationsQuery(params = {}) {
  return useQuery({
    queryKey: queryKeys.scripts.conversations(params),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [], total: 0, has_more: false, limit: params.limit ?? 50, offset: params.offset ?? 0 }
      return scriptsApi.listConversations(token, params)
    },
    staleTime: queryFreshness.long,
    gcTime: queryFreshness.chatThreadGc,
    placeholderData: (prev) => prev,
  })
}

export function useScriptWritingSuggestionsQuery(channelId, enabled) {
  return useQuery({
    queryKey: ['scripts', 'writing-suggestions', channelId ?? 'none'],
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return scriptsApi.writingSuggestions(token, channelId || undefined)
    },
    enabled: Boolean(enabled),
    staleTime: queryFreshness.medium,
    gcTime: queryFreshness.long,
  })
}

export function useScriptConversationQuery(conversationId) {
  return useQuery({
    queryKey: queryKeys.scripts.conversation(conversationId),
    enabled: !!conversationId,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return scriptsApi.getConversation(token, conversationId)
    },
    staleTime: queryFreshness.chatThread,
    gcTime: queryFreshness.chatThreadGc,
    placeholderData: (prev) => prev,
  })
}

export function useUpdateScriptConversationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ conversationId, payload }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return scriptsApi.updateConversation(token, conversationId, payload)
    },
    onSuccess: (data, variables) => {
      const id = variables?.conversationId
      if (id != null && data) {
        queryClient.setQueryData(queryKeys.scripts.conversation(id), (old) =>
          old && typeof old === 'object' ? { ...old, ...data } : old
        )
        mergeScriptConversationsListCache(queryClient, id, data)
      }
      return data
    },
  })
}

export function useDeleteScriptConversationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      await scriptsApi.deleteConversation(token, conversationId)
      return conversationId
    },
    onSuccess: (conversationId) => {
      if (conversationId != null) {
        removeScriptConversationFromListCaches(queryClient, conversationId)
        queryClient.removeQueries({ queryKey: queryKeys.scripts.conversation(conversationId) })
      }
    },
  })
}
