/**
 * Server-Sent Events client for thumbnail job lifecycle.
 *
 * Replaces polling with real-time push for connected users. Updates
 * the same Zustand store the polling adapter writes to, so consumers
 * (the loader hint, the credits badge, etc.) don't care which
 * transport delivered the event.
 *
 * Lifecycle:
 *   * `connectJobEventStream(token)` — opens the stream. Idempotent:
 *     calling it again with a different token closes the previous one.
 *   * Auto-reconnect on transport errors with bounded exponential
 *     backoff (1s → 2s → 4s → 8s, capped at 30s; jitter applied).
 *   * `disconnectJobEventStream()` — call on logout.
 *
 * Auth: EventSource can't send custom headers, so we pass the access
 * token in the URL (`?access_token=...`). The backend's
 * `get_current_user_query_or_header` dep accepts both Bearer-header
 * and query-param transport.
 */
import { getApiBaseUrl } from '../lib/env.js'
import { useJobStore } from '../stores/useJobStore.js'
import { useThumbnailJobStatusStore } from '../stores/thumbnailJobStatusStore.js'
import { showJobDoneNotification } from '../lib/browserNotification.js'

let _eventSource = null
let _reconnectTimer = null
let _reconnectAttempt = 0
let _currentToken = null
let _disposed = false
// Highest ``stream_event_id`` observed on the current connection.
// Sent as ``?last_event_id=`` on forced reconnects so the backend's
// durable-replay path (Phase 1.4 SSE handler) catches us up on
// anything published while the connection was down. The browser's
// auto-reconnect also sends ``Last-Event-ID`` via header, but we
// force-close on every error to apply our own backoff, so the
// EventSource forgets the cursor unless we plumb it through.
let _lastEventId = null

const MAX_RECONNECT_DELAY_MS = 30_000
const BASE_RECONNECT_DELAY_MS = 1_000

function clearReconnect() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
}

function scheduleReconnect() {
  clearReconnect()
  if (_disposed || !_currentToken) return
  const exp = Math.min(
    MAX_RECONNECT_DELAY_MS,
    BASE_RECONNECT_DELAY_MS * 2 ** Math.min(8, _reconnectAttempt)
  )
  const jitter = Math.random() * (BASE_RECONNECT_DELAY_MS / 2)
  const delay = exp + jitter
  _reconnectAttempt += 1
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null
    if (_disposed || !_currentToken) return
    openStream(_currentToken)
  }, delay)
}

function handleStatusEvent(payload) {
  // Phase 3.6: write to the per-job_id `useJobStore` so multiple
  // jobs in flight (recreate + chat + analyze running concurrently)
  // each get their own status without overwriting each other.
  // The legacy singleton `useThumbnailJobStatusStore` is updated as
  // well during the migration window so components that haven't
  // moved to the new store yet keep working.
  const status = {
    job_id: payload.job_id,
    status: payload.status,
    progress: payload.progress,
    status_message: payload.status_message,
    attempt_count: payload.attempt_count,
    max_attempts: payload.max_attempts,
    conversation_id: payload.conversation_id,
    stream_event_id: payload.stream_event_id,
  }
  if (payload.job_id) {
    useJobStore.getState().setStatus(payload.job_id, status)
  }
  useThumbnailJobStatusStore.getState().update(status)
  // Track the highest stream_event_id we've actually consumed so a
  // forced reconnect can request "everything after this" from the
  // durable replay log.
  if (payload.stream_event_id != null) {
    const next = Number(payload.stream_event_id)
    if (Number.isFinite(next) && (_lastEventId == null || next > _lastEventId)) {
      _lastEventId = next
    }
  }
}

function handleTerminalEvent(payload, isSuccess) {
  // Update the store one last time with the terminal state — the
  // polling adapter clears the store on its own when its loop sees
  // a terminal status, but a pure-push consumer benefits from one
  // last status_message render before the failed-card or thumbnail
  // takes over.
  handleStatusEvent(payload)

  // Browser notification ONLY when the tab isn't visible. If the user
  // is right here looking at the loader, the in-app UI is doing its
  // job already.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    showJobDoneNotification({
      success: isSuccess,
      message:
        payload.status_message ||
        (isSuccess ? 'Your thumbnail is ready.' : "Your thumbnail couldn't be generated."),
    })
  }
}

function openStream(token) {
  // Close any existing connection before opening a new one. EventSource
  // has its own auto-reconnect on transient network errors, but we want
  // tight control so token-rotation, logout, etc. cleanly tear down.
  if (_eventSource) {
    try {
      _eventSource.close()
    } catch {}
    _eventSource = null
  }

  // Resume from the last stream_event_id we observed so the backend's
  // durable-replay path streams missed events before tailing live.
  // Browsers also send ``Last-Event-ID`` via header on native
  // auto-reconnects, but since we force-close + reopen on every
  // error path the new EventSource forgets the cursor; pass it
  // explicitly.
  const params = new URLSearchParams({ access_token: token })
  if (_lastEventId != null) {
    params.set('last_event_id', String(_lastEventId))
  }
  const url = `${getApiBaseUrl()}/api/thumbnails/jobs/stream?${params.toString()}`

  let es
  try {
    es = new EventSource(url)
  } catch (err) {
    // Browser doesn't support EventSource — fall back to polling
    // (which is always on). Don't retry; SSE will never work here.

    console.warn('[jobEventStream] EventSource not available:', err)
    return
  }
  _eventSource = es

  es.addEventListener('connected', () => {
    // Reset the reconnect counter on successful handshake — the next
    // disconnect should retry quickly, not back off as if we'd been
    // failing for a while.
    _reconnectAttempt = 0
  })

  // The runner publishes `job.queued`, `job.running`, `job.retry`,
  // `job.done`, `job.failed`, AND in-flight `job.progress` /
  // `job.status_message` (pushed by JobContext.set_progress /
  // .set_status_message during long-running handlers — used to drive
  // the live progress bar without 1.5s poll lag). Wire each to the
  // store; the terminal ones additionally trigger the browser-
  // notification path.
  ;['job.queued', 'job.running', 'job.retry', 'job.progress', 'job.status_message'].forEach(
    (evt) => {
      es.addEventListener(evt, (e) => {
        try {
          handleStatusEvent(JSON.parse(e.data))
        } catch {
          /* ignore malformed payload */
        }
      })
    }
  )

  es.addEventListener('job.done', (e) => {
    try {
      handleTerminalEvent(JSON.parse(e.data), true)
    } catch {}
  })
  es.addEventListener('job.failed', (e) => {
    try {
      handleTerminalEvent(JSON.parse(e.data), false)
    } catch {}
  })

  es.onerror = () => {
    // Native EventSource will keep reconnecting on its own, but with no
    // backoff and no awareness of token expiry. We force-close and
    // reschedule with backoff so a 401 (expired token) doesn't burn
    // CPU in a tight reconnect loop.
    try {
      es.close()
    } catch {}
    if (_eventSource === es) {
      _eventSource = null
      scheduleReconnect()
    }
  }
}

/**
 * Open (or reopen) the job-event SSE stream. Safe to call repeatedly
 * — the previous connection is closed when the token changes.
 */
export function connectJobEventStream(accessToken) {
  if (!accessToken) return
  // A token change is a different identity — drop the per-user
  // event cursor so we don't accidentally surface user A's events
  // to user B on the next reconnect. Cleared on login transitions.
  if (accessToken !== _currentToken) {
    _lastEventId = null
  }
  _disposed = false
  _currentToken = accessToken
  _reconnectAttempt = 0
  clearReconnect()
  openStream(accessToken)
}

/**
 * Tear down the stream — call on logout or app shutdown.
 */
export function disconnectJobEventStream() {
  _disposed = true
  _currentToken = null
  // Reset the durable-replay cursor on logout so the next login
  // doesn't bleed events across users.
  _lastEventId = null
  clearReconnect()
  if (_eventSource) {
    try {
      _eventSource.close()
    } catch {}
    _eventSource = null
  }
}
