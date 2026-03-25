import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { personasApi } from '../../api/personas'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

export function usePersonasQuery() {
  return useQuery({
    queryKey: queryKeys.personas.list(),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [], total: 0, pinned_ids: [] }
      return personasApi.list(token)
    },
    staleTime: queryFreshness.medium,
    gcTime: queryFreshness.long,
  })
}

export function usePersonaDetailQuery(personaId) {
  return useQuery({
    queryKey: queryKeys.personas.detail(personaId),
    enabled: !!personaId,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return personasApi.get(token, personaId)
    },
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
  })
}

export function useCreatePersonaMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return personasApi.create(token, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas.list() })
    },
  })
}

export function useCreatePersonaFromImagesMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ frontImage, leftImage, rightImage, name }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const formData = new FormData()
      formData.append('front_image', frontImage)
      formData.append('left_image', leftImage)
      formData.append('right_image', rightImage)
      formData.append('name', (name || 'My Persona').trim().slice(0, 120))
      return personasApi.createFromImages(token, formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas.list() })
    },
  })
}

export function useUpdatePersonaMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personaId, payload }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return personasApi.update(token, personaId, payload)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas.list() })
      if (variables?.personaId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.personas.detail(variables.personaId) })
      }
    },
  })
}

export function useDeletePersonaMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (personaId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      await personasApi.delete(token, personaId)
      return personaId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas.list() })
    },
  })
}

export function useAddPersonaFavoriteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return personasApi.addFavorite(token, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas.list() })
    },
  })
}

export function useRemovePersonaFavoriteMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (personaId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      await personasApi.removeFavorite(token, personaId)
      return personaId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.personas.list() })
    },
  })
}
