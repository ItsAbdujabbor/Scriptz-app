import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { stylesApi } from '../../api/styles'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

export function useStylesQuery() {
  return useQuery({
    queryKey: queryKeys.styles.list(),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [], total: 0 }
      return stylesApi.list(token)
    },
    staleTime: queryFreshness.medium,
    gcTime: queryFreshness.long,
  })
}

export function useCreateStyleFromUploadMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ image, name }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const formData = new FormData()
      formData.append('image', image)
      formData.append('name', (name || 'My Style').trim().slice(0, 80))
      return stylesApi.createFromUpload(token, formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.styles.list() })
    },
  })
}

export function useUpdateStyleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ styleId, payload }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return stylesApi.update(token, styleId, payload)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.styles.list() })
      if (variables?.styleId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.styles.detail(variables.styleId) })
      }
    },
  })
}

export function useDeleteStyleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (styleId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      await stylesApi.delete(token, styleId)
      return styleId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.styles.list() })
    },
  })
}
