/**
 * Warm the sidebar History cache as soon as the user is signed in (before Coach/Dashboard mount).
 * Uses longer staleTime so prefetched data survives until the Sidebar mounts.
 */
import { coachApi } from '../../api/coach'
// import { scriptsApi } from '../../api/scripts' // next update — moved to src/next-update-ideas
import { thumbnailsApi } from '../../api/thumbnails'
import {
  prefetchTopCoachConversationDetails,
  // prefetchTopScriptConversationDetails, // next update
  prefetchTopThumbnailConversationDetails,
} from './chatCacheUtils'
import { getAccessTokenOrNull } from './authToken'
import { queryFreshness } from './queryConfig'
import { queryKeys } from './queryKeys'

const COACH_HISTORY_PARAMS = { limit: 50, isActive: true }
const LIST_PARAMS = { limit: 50 }

let _prefetched = false

export async function prefetchHistoryConversations(queryClient) {
  if (_prefetched) return
  const token = await getAccessTokenOrNull()
  if (!token) return

  _prefetched = true
  const stale = queryFreshness.long
  const listGc = queryFreshness.chatThreadGc

  const [coachList, thumbList] = await Promise.all([
    queryClient.fetchQuery({
      queryKey: queryKeys.coach.conversations(COACH_HISTORY_PARAMS),
      queryFn: () => coachApi.listConversations(token, COACH_HISTORY_PARAMS),
      staleTime: stale,
      gcTime: listGc,
    }),
    queryClient.fetchQuery({
      queryKey: queryKeys.thumbnails.conversations(LIST_PARAMS),
      queryFn: () => thumbnailsApi.listConversations(token, LIST_PARAMS),
      staleTime: stale,
      gcTime: listGc,
    }),
  ])

  // Thread bodies are heavy; run after paint / when idle so first navigation stays responsive.
  const idle =
    typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : (cb) => setTimeout(cb, 16)
  idle(
    () => {
      void Promise.all([
        prefetchTopCoachConversationDetails(queryClient, coachList?.items, 2),
        // prefetchTopScriptConversationDetails — next update
        prefetchTopThumbnailConversationDetails(queryClient, thumbList?.items, 2),
      ])
    },
    typeof requestIdleCallback !== 'undefined' ? { timeout: 4000 } : undefined
  )
}

export function resetPrefetchFlag() {
  _prefetched = false
}
