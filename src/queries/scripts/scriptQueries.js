import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { scriptsApi } from '../../api/scripts'
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
    staleTime: queryFreshness.short,
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
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.scripts.conversations() })
      if (variables?.conversationId != null) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scripts.conversation(variables.conversationId) })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.scripts.conversations() })
      if (conversationId != null) {
        queryClient.removeQueries({ queryKey: queryKeys.scripts.conversation(conversationId) })
      }
    },
  })
}
