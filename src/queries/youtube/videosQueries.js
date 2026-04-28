import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { youtubeApi } from '../../api/youtube'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

/**
 * Infinite-scroll hook for the Optimize video list.
 *
 * Each "page" is a backend page (per_page items). React Query automatically
 * deduplicates in-flight requests; the backend layers a Redis SWR cache and
 * sends ETag + Cache-Control: private, max-age=60 so the browser also
 * short-circuits identical requests within the freshness window.
 *
 * placeholderData: keepPreviousData → switching sort / video_type doesn't
 * flash an empty grid; the old pages stay rendered until the new query
 * resolves, and React Query swaps in the fresh data. Together with the
 * server cache that's usually a sub-100ms swap.
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
    // Match the server-side L1 fresh window so React Query doesn't refetch
    // the same page within seconds of a hit. Server has its own SWR layer,
    // so even when we ask, it answers from cache.
    staleTime: 1000 * 60, // 60s
    gcTime: 1000 * 60 * 10, // 10min — cached pages stay in memory between visits
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
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
