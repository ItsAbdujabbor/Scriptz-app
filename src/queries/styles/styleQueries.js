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
    staleTime: queryFreshness.long,
    gcTime: queryFreshness.long,
  })
}

/** Read a File/Blob as a base64 data URL — uses FileReader so we
 * don't have to chunk/encode by hand. Reject on read error so the
 * mutation surfaces a real reason instead of the generic toast. */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.readAsDataURL(file)
  })
}

export function useCreateStyleFromUploadMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ image, name }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      // Convert the file to a data URL and POST through the same JSON
      // /api/styles endpoint the YouTube path uses. The multipart
      // /upload route was reliably failing through the CloudFront edge
      // for some users — sending JSON instead removes that variable and
      // keeps both creation flows on one code path.
      if (image.size > 5 * 1024 * 1024) {
        throw new Error('Image too large — max 5MB. Try a smaller file.')
      }
      const dataUrl = await readFileAsDataUrl(image)
      return stylesApi.create(token, {
        name: (name || 'My Style').trim().slice(0, 80),
        image_url: dataUrl,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.styles.list() })
    },
  })
}

/** POST /api/styles — name + image URL (e.g. fetched YouTube thumbnail). */
export function useCreateStyleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, image_url }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return stylesApi.create(token, {
        name: (name || 'My Style').trim().slice(0, 80),
        image_url: image_url,
      })
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
