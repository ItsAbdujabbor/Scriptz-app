import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { youtubeApi } from '../../api/youtube'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

/**
 * Infinite-scroll hook for the Optimize video list.
 * Each "page" is a backend page (per_page items). The hook automatically
 * deduplicates in-flight requests and keeps previous pages visible while
 * the next page loads.
 */
export function useYoutubeVideosList({
  channelId,
  perPage = 15,
  search,
  sort,
  videoType,
  enabled,
}) {
  return useInfiniteQuery({
    queryKey: queryKeys.youtube.videos({ channelId, perPage, search, sort, videoType }),
    queryFn: async ({ pageParam = 1 }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.listVideos(token, {
        page: pageParam,
        per_page: perPage,
        search: search?.trim() || undefined,
        sort,
        video_type: videoType,
        channel_id: channelId || undefined,
      })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.total_pages) return lastPage.page + 1
      return undefined
    },
    enabled: enabled && !!channelId,
    staleTime: queryFreshness.short,
  })
}

/**
 * Simple paginated query for dashboard — fetches a single page of videos.
 * Unlike the infinite-scroll hook above, this returns a flat list.
 */
export function useYoutubeVideosPage({
  channelId,
  page = 1,
  perPage = 10,
  sort = 'published_at',
  videoType = 'videos',
  enabled = true,
}) {
  return useQuery({
    queryKey: ['youtube', 'videosPage', channelId, page, perPage, sort, videoType],
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.listVideos(token, {
        page,
        per_page: perPage,
        sort,
        video_type: videoType,
        channel_id: channelId || undefined,
      })
    },
    enabled: enabled && !!channelId,
    staleTime: queryFreshness.short,
  })
}
