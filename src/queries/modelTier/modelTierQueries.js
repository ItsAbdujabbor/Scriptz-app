/**
 * SRX model tier — query + mutation hooks.
 *
 *   const { data } = useModelTierStateQuery()
 *   const setTier  = useSetModelTierMutation()
 *   setTier.mutate('SRX-2')
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getModelTierState, setModelTier } from '../../api/modelTier'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { resultOrNullOnAuthFailure } from '../../lib/query/safeApi'

export function useModelTierStateQuery() {
  return useQuery({
    queryKey: queryKeys.modelTier.state,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(getModelTierState(token))
    },
    staleTime: queryFreshness.medium,
    gcTime: queryFreshness.long,
  })
}

export function useSetModelTierMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tier) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return setModelTier(token, tier)
    },
    onSuccess: (fresh) => {
      // Server returns the full fresh state — patch it in to skip a refetch.
      queryClient.setQueryData(queryKeys.modelTier.state, fresh)
    },
    onError: (err) => {
      // 403 = plan upgrade required — redirect to pricing page.
      if (err?.status === 403) {
        window.location.hash = 'pro'
      }
    },
  })
}
