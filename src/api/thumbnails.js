/** Thumbnail generation and chat API. */
import { apiFetch } from '../lib/apiFetch.js'
import { useThumbnailJobStatusStore } from '../stores/thumbnailJobStatusStore.js'
import { getAppQueryClient } from '../lib/sessionReset.js'
import { invalidateCredits } from '../queries/billing/creditsQueries.js'
import { isSSEConnected } from '../services/jobEventStream.js'

/**
 * Refresh the credits badge from anywhere in the transport layer. No-ops
 * if the QueryClient hasn't bootstrapped yet (e.g. during module init).
 * React Query dedupes concurrent invalidations of the same key, so it's
 * safe to call this multiple times in a single request lifecycle — only
 * one refetch will fly.
 */
function refreshCreditsBadge() {
  try {
    const qc = getAppQueryClient()
    if (qc) invalidateCredits(qc)
  } catch {
    /* never block the request on a cache hiccup */
  }
}

/** UUID-ish key for the Idempotency-Key header — see api/videoThumbnails.js
 *  for the full design. One key per *click intent*, reused on retries. */
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

/**
 * Thin shim onto the centralized apiFetch. Keeps the legacy
 * (method, path, accessToken, body, headers, fetchInit) signature every
 * caller in this module uses. `headers['Idempotency-Key']` is lifted to
 * apiFetch's first-class `idempotencyKey` option; `fetchInit.signal` is
 * threaded straight through so AbortController cancellation works.
 */
function request(method, path, accessToken, body = null, headers = {}, fetchInit = {}) {
  const { 'Idempotency-Key': idempotencyKey, ...restHeaders } = headers || {}
  return apiFetch(path, {
    method,
    body: body ?? undefined,
    token: accessToken,
    idempotencyKey: idempotencyKey || undefined,
    signal: fetchInit?.signal,
    headers: restHeaders,
  })
}

export const thumbnailsApi = {
  fetchExistingThumbnail(accessToken, youtubeUrl) {
    return apiFetch(
      `/api/thumbnails/youtube/fetch-existing?youtube_url=${encodeURIComponent(youtubeUrl)}`,
      { method: 'POST', token: accessToken }
    )
  },
  generateConcepts(accessToken, payload) {
    return request('POST', '/api/thumbnails/concepts', accessToken, payload)
  },
  /**
   * Generate 1-4 thumbnails. Sends an Idempotency-Key so a double-click
   * or a network-layer retry can't create two batches and double-charge.
   * Pass ``options.idempotencyKey`` to control retry semantics from the
   * caller (e.g. share one key across automatic retries of the same
   * click intent); otherwise a fresh key is generated per call.
   */
  generateBatch(accessToken, payload, options = {}) {
    const key = options.idempotencyKey || newIdempotencyKey()
    // Fire badge refresh in parallel with the POST so the post-deduction
    // balance is visible before the long-running batch resolves.
    refreshCreditsBadge()
    return request('POST', '/api/thumbnails/generate-batch', accessToken, payload, {
      'Idempotency-Key': key,
    })
  },
  regenerateWithPersona(accessToken, payload) {
    refreshCreditsBadge()
    return request('POST', '/api/thumbnails/regenerate-with-persona', accessToken, payload)
  },
  generateSync(accessToken, payload) {
    refreshCreditsBadge()
    return request('POST', '/api/thumbnails/generate-sync', accessToken, payload)
  },
  /** Create an empty conversation up-front so the sidebar can show a row
   *  immediately while the first generation runs in the background. */
  createConversation(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request(
      'POST',
      qs ? `/api/thumbnails/conversations?${qs}` : '/api/thumbnails/conversations',
      accessToken
    )
  },
  listConversations(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request(
      'GET',
      qs ? `/api/thumbnails/conversations?${qs}` : '/api/thumbnails/conversations',
      accessToken
    )
  },
  getConversation(accessToken, conversationId, params = {}, fetchInit = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request(
      'GET',
      qs
        ? `/api/thumbnails/conversations/${conversationId}?${qs}`
        : `/api/thumbnails/conversations/${conversationId}`,
      accessToken,
      null,
      {},
      fetchInit
    )
  },
  /**
   * Async submit + poll wrapper. From the consumer's perspective this
   * still returns a Promise that resolves to a ThumbnailChatResponse —
   * but underneath the hood we POST /chat/submit, get a job_id back
   * immediately, then poll /chat-jobs/{job_id} until terminal. The
   * server does the heavy work in the background-job worker process,
   * NOT in the request cycle, so the API thread is freed in <100ms.
   *
   * Live status: every poll updates `useThumbnailJobStatusStore` with
   * the worker's latest status_message. The loader hint reads from
   * that store and shows polite progress text ("Calling provider",
   * "Retrying after timeout") instead of a static spinner.
   *
   * Idempotency: each "Generate" click gets a fresh Idempotency-Key.
   * Double-taps replay the same job_id — no double charges.
   */
  async chat(accessToken, payload, fetchInit = {}) {
    const opts = (fetchInit && fetchInit.options) || {}
    const idempotencyKey = opts.idempotencyKey || newIdempotencyKey()

    // Reset live status before submit so a stale message from a
    // previous run doesn't briefly flash.
    useThumbnailJobStatusStore.getState().clear()

    // Kick a credits refresh in parallel with the submit POST so the
    // badge reflects the post-deduction balance while the worker runs
    // in the background — instead of staying at the pre-deduction value
    // until the poll loop ends ~10s+ later. On a 429/queue_full the
    // backend auto-refunds, so this same refetch reconciles the badge
    // back up within ~1s of the failure.
    refreshCreditsBadge()

    let submission
    try {
      submission = await request(
        'POST',
        '/api/thumbnails/chat/submit',
        accessToken,
        payload,
        { 'Idempotency-Key': idempotencyKey },
        fetchInit
      )
      // Fire-and-forget product-analytics event. Imported here to avoid a
      // circular dep with main.jsx; the SDK noops when not initialized.
      try {
        const { track } = await import('../lib/analytics')
        track('generation_submitted', {
          conversation_id: payload?.conversation_id || null,
          intent: payload?.intent || null,
          batch_size: payload?.batch_size || null,
        })
      } catch {}
    } catch (err) {
      useThumbnailJobStatusStore.getState().clear()
      throw err
    }

    if (!submission?.job_id) {
      // Defensive fallback: the server returned the legacy sync chat
      // response shape (e.g. older deploy). Return as-is.
      return submission
    }

    try {
      const result = await pollThumbnailChatJob(accessToken, submission.job_id, fetchInit)
      return result
    } finally {
      useThumbnailJobStatusStore.getState().clear()
    }
  },
  updateConversation(accessToken, conversationId, payload) {
    return request('PATCH', `/api/thumbnails/conversations/${conversationId}`, accessToken, payload)
  },
  deleteConversation(accessToken, conversationId) {
    return request('DELETE', `/api/thumbnails/conversations/${conversationId}`, accessToken)
  },
  /** Mark the conversation as seen — clears the unread dot server-side.
   *  Idempotent: only bumps last_seen_at forward. */
  markConversationSeen(accessToken, conversationId) {
    return request('POST', `/api/thumbnails/conversations/${conversationId}/seen`, accessToken)
  },
  rate(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/rate', accessToken, payload, {}, fetchInit)
  },
  /** Unified analyze — image, title, or both.
   *  payload: { thumbnail_image_base64?, thumbnail_image_url?, video_title?, niche? }
   *  Response: AnalyzeResponse with has_thumbnail / has_title flags */
  analyze(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/analyze', accessToken, payload, {}, fetchInit)
  },
  rateFeedback(accessToken, ratingId, feedback, extra = {}) {
    return request('POST', `/api/thumbnails/ratings/${ratingId}/feedback`, accessToken, {
      feedback,
      ...extra,
    })
  },
  improve(accessToken, payload) {
    return request('POST', '/api/thumbnails/improve', accessToken, payload)
  },
  getJob(accessToken, jobId) {
    return request('GET', `/api/jobs/${jobId}`, accessToken)
  },
  cancelChatJob(accessToken, jobId) {
    return request(
      'POST',
      `/api/thumbnails/chat-jobs/${encodeURIComponent(jobId)}/cancel`,
      accessToken
    )
  },
  editRegion(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/edit-region', accessToken, payload, {}, fetchInit)
  },
  /** Swap the face inside a thumbnail with a target face image.
   *  payload: { thumbnail_image_base64?, thumbnail_image_url?, face_image_base64?, face_image_url?, extra_hint? }
   *  Response: { image_url, tier, steps } */
  faceSwap(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/face-swap', accessToken, payload, {}, fetchInit)
  },
  /** Brainstorm YouTube title ideas with Gemini.
   *  payload: { topic: string, count: 10 | 20, is_short?: boolean }
   *  Response: { titles: [{ title: string, reasoning: string }] } */
  titleIdeas(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/title-ideas', accessToken, payload, {}, fetchInit)
  },
  /** Append a typed event (recreate / analyze / edit / faceswap / titles)
   *  to a thumbnail conversation. Creates the conversation if
   *  `conversation_id` is null. Used fire-and-forget after each
   *  non-prompt operation succeeds, so all flows persist into one
   *  thread and survive a reload.
   *  payload: { conversation_id?, channel_id?, kind, user_content, extra_data }
   *  Response: { conversation_id, user_message, assistant_message } */
  appendEvent(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/events', accessToken, payload, {}, fetchInit)
  },

  /** Finalize a previously pre-persisted (pending) message. Used by the
   *  persistent-action pattern: handlers first call `appendEvent` with
   *  `extra_data.pending = true` BEFORE running generation, then PATCH
   *  the assistant row in-place with the result. If the client refreshes
   *  mid-generation the pending pair is already on disk, so the chat is
   *  not empty — the conversation reload renders the pending placeholder
   *  and the backend's stale-pending sweep ultimately marks an abandoned
   *  row as failed (a retryable card) after 5 minutes.
   *  body: { content?, extra_data_patch? }
   *  Response: { message } */
  patchEvent(accessToken, messageId, body, fetchInit = {}) {
    return request(
      'PATCH',
      `/api/thumbnails/events/${encodeURIComponent(messageId)}`,
      accessToken,
      body || {},
      {},
      fetchInit
    )
  },
}

// ─── Async-job polling helpers ──────────────────────────────────────────────
//
// Used by `thumbnailsApi.chat` to wait on a worker-processed job. The
// frontend's mutation hook stays unchanged (resolves with a
// ThumbnailChatResponse); only the transport changes underneath.

const POLL_INITIAL_INTERVAL = 1_000
const POLL_MAX_INTERVAL = 15_000
const POLL_BACKOFF_FACTOR = 1.5
// When the SSE stream is the live channel, polling is just a safety
// net — drop to a slow heartbeat so the two transports don't both
// write the job-status store every second (STM-03).
const POLL_SSE_ACTIVE_INTERVAL = 10_000
const POLL_TIMEOUT_MS = 180_000 // 3 min hard cap; the worker has its
//   own ~30s retry budget per job

// Jittered exponential backoff, applied ONLY after a poll error. A
// clean tick resets back to the initial interval. ±20% jitter so a
// transient backend blip doesn't sync-up retries across every open tab
// into a thundering herd. Capped at POLL_MAX_INTERVAL.
function backoffInterval(consecutiveErrors) {
  const raw = POLL_INITIAL_INTERVAL * Math.pow(POLL_BACKOFF_FACTOR, consecutiveErrors)
  const capped = Math.min(raw, POLL_MAX_INTERVAL)
  return Math.round(capped * (0.8 + Math.random() * 0.4))
}

// Cadence for the *success* path. SSE connected → slow heartbeat;
// otherwise the normal 1s tick.
function steadyInterval() {
  return isSSEConnected() ? POLL_SSE_ACTIVE_INTERVAL : POLL_INITIAL_INTERVAL
}

/**
 * Abort-aware sleep. Resolves after `ms`, OR rejects with an AbortError
 * the instant `signal` fires — so cancelling a generation doesn't have
 * to wait out the remaining poll interval before unwinding.
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Poll a chat-job's status until it terminates. Updates the
 * job-status store on each tick so the live loader hint can read it.
 * Resolves with the final ThumbnailChatResponse or throws an error
 * shaped like the legacy sync route's failures (so existing catch
 * blocks in the caller continue to work unchanged).
 *
 * API-02: the loop checks the abort signal at the top of every
 * iteration AND the sleep between ticks is abort-aware, so a caller
 * that aborts mid-poll (component unmount, user cancel) unwinds within
 * milliseconds instead of one full poll interval.
 *
 * IMG-03: on abort we also fire POST /chat-jobs/{id}/cancel so the
 * worker stops + refunds server-side instead of grinding on a
 * generation nobody is waiting for.
 *
 * IMG-02: poll *errors* back off exponentially (1s → 15s, ±20% jitter)
 * instead of hammering a struggling backend every second.
 *
 * STM-03: on the success path the cadence drops to a 10s heartbeat
 * whenever the SSE stream is connected (SSE is then the live channel;
 * polling is only a correctness backstop).
 */
async function pollThumbnailChatJob(accessToken, jobId, fetchInit = {}) {
  const start = Date.now()
  const signal = fetchInit?.signal
  const path = `/api/thumbnails/chat-jobs/${encodeURIComponent(jobId)}`

  // IMG-03: when the caller aborts (unmount / explicit user cancel),
  // tell the backend to stop the job so it isn't left running (and so
  // credits are refunded server-side). Best-effort and fire-and-forget
  // — a fresh token is resolved by apiFetch; we deliberately do NOT
  // pass the (now-aborted) signal so the cancel request itself can land.
  if (signal && !signal.aborted) {
    signal.addEventListener(
      'abort',
      () => {
        if (!jobId) return
        Promise.resolve()
          .then(() => thumbnailsApi.cancelChatJob(accessToken, jobId))
          .catch((e) => console.warn('[polling] Failed to cancel job on abort:', e))
      },
      { once: true }
    )
  }

  // Periodic credit-badge refresh during the poll loop. The backend may
  // adjust the balance mid-job (e.g. partial refund, tiered upcharge);
  // surfacing those promptly avoids the "badge dips then jumps back" UX.
  let tickCount = 0
  const REFRESH_EVERY_N_TICKS = 6
  // Consecutive *error* count drives the exponential backoff; reset to
  // zero on every clean tick.
  let consecutiveErrors = 0
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    // Bail immediately if the caller aborted (unmount / explicit cancel).
    signal?.throwIfAborted()

    let s
    try {
      s = await request('GET', path, accessToken, null, {}, fetchInit)
    } catch (err) {
      // Abort is terminal — propagate so the caller stops waiting.
      if (err?.name === 'AbortError' || signal?.aborted) throw err
      // Network blip — exponential backoff so a struggling backend
      // isn't hammered every second (abort-aware sleep).
      consecutiveErrors += 1
      await sleep(backoffInterval(consecutiveErrors), signal)
      continue
    }

    // Clean response — reset the error backoff.
    consecutiveErrors = 0

    useThumbnailJobStatusStore.getState().update(s)

    if (s.status === 'done' && s.result) return s.result
    if (s.status === 'failed') {
      // Refund (if any) happens server-side before the FAILED status is
      // visible — refresh credits BEFORE throwing so the toast fires
      // against a badge that already reflects the refund.
      refreshCreditsBadge()
      // Re-shape into the same payload the legacy sync route raised so
      // the existing catch block in ThumbnailGenerator.jsx parses it
      // identically. parseApiError already handles this shape.
      const err = new Error(s.error || 'Generation failed')
      err.status = 502
      err.payload = {
        error: {
          code: s.error_code || 'PROVIDER_UNAVAILABLE',
          message: s.error || 'Generation failed',
          extra: {
            ...(s.error_extra || {}),
            attempt: s.attempt_count,
            max_attempts: s.max_attempts,
            retryable: true,
          },
        },
      }
      throw err
    }

    tickCount += 1
    if (tickCount % REFRESH_EVERY_N_TICKS === 0) {
      refreshCreditsBadge()
    }

    // STM-03: slow heartbeat while SSE is the live channel, full
    // cadence otherwise. Re-evaluated every tick so a mid-job SSE
    // drop transparently speeds polling back up.
    await sleep(steadyInterval(), signal)
  }
  // Soft timeout — don't claim failure; let the user wait or retry.
  // Refund logic already handled server-side regardless; refresh the
  // badge before throwing so the post-refund balance is visible.
  refreshCreditsBadge()
  const err = new Error('Generation is taking longer than expected. Please wait or try again.')
  err.status = 504
  err.payload = {
    error: {
      code: 'JOB_POLL_TIMEOUT',
      message: "We're still working on this thumbnail — please refresh in a minute.",
      extra: { retryable: true },
    },
  }
  throw err
}
