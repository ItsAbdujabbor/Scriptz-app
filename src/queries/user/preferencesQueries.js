import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userApi } from '../../api/user'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { resultOrNullOnAuthFailure } from '../../lib/query/safeApi'

export function useUserPreferencesQuery() {
  return useQuery({
    queryKey: queryKeys.user.preferences,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(userApi.getPreferences(token))
    },
    staleTime: queryFreshness.long,
    gcTime: queryFreshness.long,
  })
}

export function useSaveUserPreferencesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (preferences) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return userApi.savePreferences(token, preferences)
    },
    onMutate: async (preferences) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.preferences })
      const previous = queryClient.getQueryData(queryKeys.user.preferences)
      queryClient.setQueryData(queryKeys.user.preferences, preferences)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.previous) return
      queryClient.setQueryData(queryKeys.user.preferences, ctx.previous)
    },
    onSuccess: (savedPreferences) => {
      queryClient.setQueryData(queryKeys.user.preferences, savedPreferences)
    },
  })
}

