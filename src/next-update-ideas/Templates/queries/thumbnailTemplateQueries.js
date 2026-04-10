import { useQuery } from '@tanstack/react-query'
import { thumbnailTemplatesApi } from '../../api/thumbnailTemplates'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { queryKeys } from '../../lib/query/queryKeys'

const TEMPLATES_STALE_MS = 1000 * 60 * 5
const TEMPLATES_GC_MS = 1000 * 60 * 30
const CATEGORIES_STALE_MS = 1000 * 60 * 15

export function useThumbnailTemplateCategoriesQuery() {
  return useQuery({
    queryKey: queryKeys.thumbnailTemplates.categories(),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { categories: [] }
      return thumbnailTemplatesApi.categories(token)
    },
    staleTime: CATEGORIES_STALE_MS,
    gcTime: TEMPLATES_GC_MS,
  })
}

export function useThumbnailTemplatesListQuery({ limit, offset, category, q }) {
  return useQuery({
    queryKey: queryKeys.thumbnailTemplates.list({ limit, offset, category, q }),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [], total: 0, limit, offset }
      return thumbnailTemplatesApi.list(token, { limit, offset, category, q })
    },
    staleTime: TEMPLATES_STALE_MS,
    gcTime: TEMPLATES_GC_MS,
    placeholderData: (prev) => prev,
  })
}
