import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { emailPreferencesApi } from '../../api/emailPreferences'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { resultOrNullOnAuthFailure } from '../../lib/query/safeApi'

export function useEmailPreferencesQuery() {
  return useQuery({
    queryKey: queryKeys.user.emailPreferences,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(emailPreferencesApi.get(token))
    },
    staleTime: queryFreshness.medium,
    gcTime: queryFreshness.long,
  })
}

export function useSaveEmailPreferencesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (prefs) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return emailPreferencesApi.save(token, prefs)
    },
    onMutate: async (prefs) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.emailPreferences })
      const previous = queryClient.getQueryData(queryKeys.user.emailPreferences)
      // Optimistic update — keep transactional locked on regardless of input.
      queryClient.setQueryData(queryKeys.user.emailPreferences, {
        ...(previous || {}),
        ...prefs,
        transactional: true,
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.previous) return
      queryClient.setQueryData(queryKeys.user.emailPreferences, ctx.previous)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.user.emailPreferences, saved)
    },
  })
}
