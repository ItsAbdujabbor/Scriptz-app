/**
 * Warm the sidebar thumbnail-history cache as soon as the user is signed in
 * (before Dashboard mounts). Uses longer staleTime so prefetched data
 * survives until the Sidebar mounts.
 */
import { thumbnailsApi } from '../../api/thumbnails'
import { prefetchTopThumbnailConversationDetails } from './chatCacheUtils'
import { getAccessTokenOrNull } from './authToken'
import { queryFreshness } from './queryConfig'
import { queryKeys } from './queryKeys'

const LIST_PARAMS = { limit: 50 }

let _prefetched = false

export async function prefetchHistoryConversations(queryClient) {
  if (_prefetched) return
  const token = await getAccessTokenOrNull()
  if (!token) return

  _prefetched = true
  const stale = queryFreshness.long
  const listGc = queryFreshness.chatThreadGc

  const thumbList = await queryClient.fetchQuery({
    queryKey: queryKeys.thumbnails.conversations(LIST_PARAMS),
    queryFn: () => thumbnailsApi.listConversations(token, LIST_PARAMS),
    staleTime: stale,
    gcTime: listGc,
  })

  // Thread bodies are heavy; run after paint / when idle so first navigation stays responsive.
  const idle =
    typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : (cb) => setTimeout(cb, 16)
  idle(
    () => {
      void prefetchTopThumbnailConversationDetails(queryClient, thumbList?.items, 2)
    },
    typeof requestIdleCallback !== 'undefined' ? { timeout: 4000 } : undefined
  )
}

export function resetPrefetchFlag() {
  _prefetched = false
}
