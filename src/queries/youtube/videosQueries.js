import { useQuery } from '@tanstack/react-query'
import { youtubeApi } from '../../api/youtube'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

export function useYoutubeVideosList({
  channelId,
  page,
  perPage,
  search,
  sort,
  videoType,
  enabled,
}) {
  return useQuery({
    queryKey: queryKeys.youtube.videos({ channelId, page, perPage, search, sort, videoType }),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.listVideos(token, {
        page,
        per_page: perPage,
        search: search?.trim() || undefined,
        sort,
        video_type: videoType,
      })
    },
    enabled: enabled && !!channelId && !!page,
    staleTime: queryFreshness.short,
    keepPreviousData: true,
  })
}

