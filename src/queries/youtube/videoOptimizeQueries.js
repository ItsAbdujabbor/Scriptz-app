/**
 * Hooks for the Video Optimize modal.
 *
 * Two cooperating concerns live here:
 *
 * 1. AI artifact cache hydration — every AI mutation in the modal writes
 *    its result to the per-video cache server-side (see
 *    services/video_ai_cache.py). On modal open we read that cache via
 *    `useVideoAICache` and prefill title recommendations / tags /
 *    refined description without re-running (and re-charging) the AI.
 *
 * 2. Async thumbnail jobs — the POST /generate endpoint now returns a
 *    job_id immediately and runs the work in a server background task.
 *    `useActiveThumbnailJob` finds an in-flight job for the video on
 *    modal open so we can resume the progress UI when the user returns,
 *    and `useThumbnailJob` polls a specific job_id while it's running.
 *    Polling is gated by status: queued/running poll every 2s, terminal
 *    states stop polling so we don't churn the network.
 */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { youtubeApi } from '../../api/youtube'
import { videoThumbnailsApi } from '../../api/videoThumbnails'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

export const videoOptimizeKeys = {
  aiCache: (videoId) => ['video-ai-cache', videoId],
  activeThumbJob: (videoId) => ['video-thumbnail-active-job', videoId],
  thumbJob: (jobId) => ['video-thumbnail-job', jobId],
  thumbList: (videoId) => ['video-thumbnails-list', videoId],
}

/**
 * Hydrates the modal from disk on open. No credits charged — pure read.
 * Disabled until ``videoId`` is set so opening the modal without a video
 * doesn't fire a request. ``placeholderData: prev`` keeps last known data
 * on screen while a refetch is in flight.
 */
export function useVideoAICache(videoId, { enabled = true } = {}) {
  return useQuery({
    queryKey: videoOptimizeKeys.aiCache(videoId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.getVideoAICache(token, videoId)
    },
    enabled: enabled && !!videoId,
    // The cache rows have multi-day server-side TTLs; on the client we
    // just need this fresh per-session.
    staleTime: 1000 * 60 * 5, // 5min
    gcTime: 1000 * 60 * 30,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })
}

/**
 * Fetches the active thumbnail job for a video on modal open and polls
 * while one is in progress. Once the job completes we invalidate the
 * thumbnails listing so the modal picks up the new rows automatically.
 */
export function useActiveThumbnailJob(videoId, { enabled = true } = {}) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: videoOptimizeKeys.activeThumbJob(videoId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const data = await videoThumbnailsApi.getActiveJob(token, videoId)
      // When the server reports no active job, the polling stops via
      // refetchInterval below. If we transitioned from running → done,
      // the job-specific poller (useThumbnailJob) is what triggers the
      // listing invalidation; this hook is just for resume-on-open.
      return data
    },
    enabled: enabled && !!videoId,
    // Poll while a job is active; pause when idle.
    refetchInterval: (query) => {
      const s = query.state.data?.status
      if (s === 'queued' || s === 'running') return 2000
      return false
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    // Manually invalidate the thumb-list query when the job clears so
    // the freshly-saved rows appear without the user clicking refresh.
    onSuccess: (data) => {
      if (!data?.job_id) {
        queryClient.invalidateQueries({
          queryKey: videoOptimizeKeys.thumbList(videoId),
        })
      }
    },
  })
}

/**
 * Polls a specific job by id every 2s until it reaches a terminal state.
 * On done, invalidates the thumbnail listing so the new rows appear.
 */
export function useThumbnailJob(jobId, { videoId, enabled = true } = {}) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: videoOptimizeKeys.thumbJob(jobId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return videoThumbnailsApi.getJob(token, jobId)
    },
    enabled: enabled && !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      if (s === 'done' || s === 'failed') return false
      return 2000
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
    onSuccess: (data) => {
      if (data?.status === 'done' && videoId) {
        queryClient.invalidateQueries({
          queryKey: videoOptimizeKeys.thumbList(videoId),
        })
        queryClient.invalidateQueries({
          queryKey: videoOptimizeKeys.activeThumbJob(videoId),
        })
      }
    },
  })
}

/**
 * The list of saved thumbnails for a video. Replaces the inline
 * `videoThumbnailsApi.list(...).then(...)` calls in the modal so the
 * cache invalidations from the job pollers above can refresh it.
 *
 * The response shape includes ``rating_score`` + ``rating_id`` per row
 * (when rated), so the modal renders score badges in the same paint as
 * the images — no separate fetch needed for ratings on common paths.
 */
export function useVideoThumbnails(videoId, { enabled = true } = {}) {
  return useQuery({
    queryKey: videoOptimizeKeys.thumbList(videoId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return videoThumbnailsApi.list(token, videoId)
    },
    enabled: enabled && !!videoId,
    staleTime: 1000 * 60, // 1min
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })
}

/**
 * Mutation that rates a single saved thumbnail by id. Server-side this
 * is a no-op when the row already has a score (no AI call, no credit
 * charge), so it's safe to call eagerly.
 *
 * On success we patch the cached listing in-place rather than
 * invalidating the whole query — invalidation would refetch every
 * thumbnail, blow away pagination scroll position, and trigger
 * unnecessary network. A targeted setQueryData keeps the UI smooth as
 * scores fill in one by one.
 */
export function useRateVideoThumbnail(videoId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (thumbnailId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return videoThumbnailsApi.rate(token, thumbnailId)
    },
    onSuccess: (data) => {
      if (!data || !videoId) return
      queryClient.setQueryData(videoOptimizeKeys.thumbList(videoId), (prev) => {
        if (!prev?.thumbnails) return prev
        return {
          ...prev,
          thumbnails: prev.thumbnails.map((t) =>
            t.id === data.id
              ? { ...t, rating_score: data.rating_score, rating_id: data.rating_id }
              : t
          ),
        }
      })
    },
  })
}

/**
 * Run ``mapper`` over ``items`` with at most ``concurrency`` in flight
 * at any time. Used for lazy-rating: kicking off /rate for a fresh grid
 * of 4 thumbnails serially (or all at once) is wasteful in either
 * direction — 2 in flight is the sweet spot for UI responsiveness vs
 * server load.
 */
async function runWithConcurrency(items, concurrency, mapper) {
  const queue = items.slice()
  let active = 0
  return new Promise((resolve) => {
    let resolved = 0
    const total = queue.length
    if (total === 0) return resolve()
    const next = () => {
      while (active < concurrency && queue.length > 0) {
        const item = queue.shift()
        active += 1
        Promise.resolve()
          .then(() => mapper(item))
          .catch(() => {}) // swallow — one failed rating shouldn't block the rest
          .finally(() => {
            active -= 1
            resolved += 1
            if (resolved === total) resolve()
            else next()
          })
      }
    }
    next()
  })
}

/** Effect-style helper used in the modal: rates every thumbnail in
 *  ``items`` that doesn't have a score yet, with bounded concurrency.
 *  Returns a no-op if there's nothing to do.
 *  Caller is responsible for guarding against duplicate calls. */
export async function lazyRateUnrated(items, rateMutation) {
  if (!Array.isArray(items)) return
  const unrated = items.filter((t) => t && t.id && t.rating_score == null)
  if (unrated.length === 0) return
  await runWithConcurrency(unrated, 2, (t) => rateMutation.mutateAsync(t.id))
}
