/**
 * Video Optimize Thumbnail API — generate, list, delete.
 * Separate from thumbnail chat. Stored per video.
 */
import { apiFetch } from '../lib/apiFetch.js'

function request(method, path, accessToken, body = null, extraHeaders = {}) {
  // API-03: apiFetch only parses JSON when Content-Type says so, so the
  // old unconditional `res.json()` (which threw on empty 204 bodies) is
  // gone — empty responses now resolve to `null` instead of crashing.
  return apiFetch(path, {
    method,
    body: body ?? undefined,
    token: accessToken,
    headers: extraHeaders,
  })
}

/** UUID-ish key — `crypto.randomUUID` where available, fall back to a
 *  random hex string for older browsers. The server only requires a
 *  reasonably-unique string per click; collision risk is negligible at
 *  the per-user scope where these are validated. */
function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12)
  )
}

export const videoThumbnailsApi = {
  /**
   * Start an async thumbnail generation job.
   * Returns { job_id, status: "queued", video_id, expected_count, thumbnails: [] }
   * — the actual AI work runs in a background task. Poll /api/jobs/{job_id}
   * for progress and /api/video-thumbnails/{video_id} once done.
   *
   * `idempotencyKey` (optional): if the caller supplies one, the server
   * deduplicates retries with the same key for 24h — a double-click or
   * a flaky-network retry won't create two jobs and won't double-charge.
   * Caller should generate ONE key per click intent, not per retry, so
   * retries with the same key actually replay.
   */
  generate(
    accessToken,
    { video_id, channel_id, message, num_thumbnails, persona_id, style_id },
    { idempotencyKey } = {}
  ) {
    const key = idempotencyKey || newIdempotencyKey()
    return apiFetch('/api/video-thumbnails/generate', {
      method: 'POST',
      body: { video_id, channel_id, message, num_thumbnails, persona_id, style_id },
      token: accessToken,
      idempotencyKey: key,
    })
  },

  list(accessToken, videoId) {
    return request('GET', `/api/video-thumbnails/${encodeURIComponent(videoId)}`, accessToken)
  },

  delete(accessToken, thumbnailId) {
    return request('DELETE', `/api/video-thumbnails/${thumbnailId}`, accessToken)
  },

  /**
   * Find the in-flight thumbnail job for this user/video, if any.
   * Returns { job_id, status, progress, expected_count, started_at } —
   * fields are null when no job is queued/running. Used on modal open
   * to resume the progress UI when the user returns mid-generation.
   */
  getActiveJob(accessToken, videoId) {
    return request(
      'GET',
      `/api/video-thumbnails/${encodeURIComponent(videoId)}/active-job`,
      accessToken
    )
  },

  /** GET /api/jobs/{job_id} — poll for progress on an async generation. */
  getJob(accessToken, jobId) {
    return request('GET', `/api/jobs/${encodeURIComponent(jobId)}`, accessToken)
  },

  /**
   * POST /api/video-thumbnails/{thumbnail_id}/rate.
   * Idempotent — server returns the persisted score immediately if the
   * row is already rated; otherwise runs the AI call (Redis L1 + SETNX
   * coalescing in front, DB dedup behind) and persists the score back
   * onto the row.
   */
  rate(accessToken, thumbnailId) {
    return request(
      'POST',
      `/api/video-thumbnails/${encodeURIComponent(thumbnailId)}/rate`,
      accessToken
    )
  },
}
