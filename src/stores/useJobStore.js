/**
 * useJobStore — Phase 3.3 replacement for the singleton job-status store.
 *
 * `thumbnailJobStatusStore.js` (legacy) holds ONE in-flight job's
 * status at a time. That was fine when the chat surface only ever
 * had one job running; it falls apart the moment a user submits
 * recreate while a chat-mode generation is still going, or the
 * sidebar wants to render per-conversation pending indicators that
 * each reflect a different job.
 *
 * This store keys by `job_id` so any number of jobs can have their
 * own live status. Writes come from two sources:
 *
 *   * Polling (legacy fallback) — `thumbnailsApi.chat`'s
 *     `pollThumbnailChatJob` loop calls `setStatus(job_id, status)`
 *     on each tick.
 *
 *   * SSE — `jobEventStream.js` (rewritten in Phase 3.6) routes
 *     every `job.queued`/`job.running`/`job.progress`/
 *     `job.status_message`/`job.retry`/`job.done`/`job.failed` event
 *     to `setStatus(payload.job_id, payload)`.
 *
 * Readers are typically the loader / progress UI for a specific
 * job_id (looked up via `selectJobStatus(jobId)`), and the eviction
 * subscriber (`useOptimisticOpsHydration` in Phase 3.4) that watches
 * for terminal status events to evict ops.
 *
 * No persistence — job status is volatile. On refresh, the SSE
 * Last-Event-ID replay (Phase 1.4 backend) rebuilds the state from
 * the durable replay log.
 */
import { create } from 'zustand'

const TERMINAL_STATUSES = new Set(['done', 'failed'])

export const useJobStore = create((set) => ({
  /** Map of job_id → JobStatus. JobStatus shape mirrors the backend's
   * `ThumbnailChatJobStatus`: { job_id, status, progress, status_message,
   * attempt_count, max_attempts, conversation_id?, stream_event_id?, ... } */
  statuses: {},

  /**
   * Replace the status for a job_id. Idempotent. No-op when payload
   * lacks a job_id (defensive against malformed SSE payloads).
   *
   * @param {string} jobId
   * @param {Object} status
   */
  setStatus(jobId, status) {
    if (!jobId || !status) return
    set((state) => ({
      statuses: {
        ...state.statuses,
        [String(jobId)]: { ...status },
      },
    }))
  },

  /**
   * Drop a job's status. Called after eviction reconciles the
   * op against its server twin, or on user-driven dismissal of a
   * failed card.
   *
   * @param {string} jobId
   */
  clear(jobId) {
    if (!jobId) return
    set((state) => {
      const key = String(jobId)
      if (!(key in state.statuses)) return state
      const next = { ...state.statuses }
      delete next[key]
      return { statuses: next }
    })
  },

  /** Drop every job's status. Used by sessionReset (user logout). */
  clearAll() {
    set({ statuses: {} })
  },
}))

// ── Selectors ────────────────────────────────────────────────────────

/**
 * Return the live status for a specific job, or `null` when there's
 * no entry for that id. Callers that only render a single job's
 * progress should use this with a per-job selector to avoid
 * re-rendering every time SOME OTHER job's status changes.
 */
export const selectJobStatus = (jobId) => (state) => {
  if (!jobId) return null
  return state.statuses[String(jobId)] ?? null
}

/**
 * True iff the job has reached a terminal state (done or failed).
 * Used by the op-eviction subscriber.
 */
export const selectIsTerminal = (jobId) => (state) => {
  const s = jobId ? state.statuses[String(jobId)] : null
  return s ? TERMINAL_STATUSES.has(String(s.status || '')) : false
}

/**
 * Live count of jobs currently in flight (status != done/failed).
 * Cheap UI signal for "is anything happening right now?" indicators.
 */
export const selectInFlightCount = (state) => {
  let n = 0
  for (const s of Object.values(state.statuses)) {
    if (s && !TERMINAL_STATUSES.has(String(s.status || ''))) n += 1
  }
  return n
}
