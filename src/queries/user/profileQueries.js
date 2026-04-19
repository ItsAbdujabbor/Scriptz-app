import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '../../api/profile'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { resultOrNullOnAuthFailure } from '../../lib/query/safeApi'

export function useUserProfileQuery() {
  return useQuery({
    queryKey: queryKeys.user.profile,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(profileApi.getProfile(token))
    },
    staleTime: queryFreshness.long,
    gcTime: queryFreshness.long,
  })
}

export function useUpdateUserProfileMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (profile) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return profileApi.updateProfile(token, profile)
    },
    onMutate: async (profile) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.user.profile })
      const previous = queryClient.getQueryData(queryKeys.user.profile)
      queryClient.setQueryData(queryKeys.user.profile, profile)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.previous) return
      queryClient.setQueryData(queryKeys.user.profile, ctx.previous)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile })
    },
  })
}
