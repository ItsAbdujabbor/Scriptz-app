/** Thumbnail generation and chat API. */
import { getApiBaseUrl } from '../lib/env.js'
import { parseApiError } from '../lib/aiErrors.js'
import { useThumbnailJobStatusStore } from '../stores/thumbnailJobStatusStore.js'

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

function request(method, path, accessToken, body = null, headers = {}, fetchInit = {}) {
  const url = getApiBaseUrl() + path
  const h = { 'Content-Type': 'application/json', ...headers }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`

  const opts = { method, headers: h, ...fetchInit }
  if (body != null) opts.body = JSON.stringify(body)

  return fetch(url, opts).then(async (res) => {
    const contentType = res.headers.get('Content-Type') || ''
    const isJson = contentType.includes('application/json')
    const data = isJson ? await res.json().catch(() => ({})) : {}
    if (!res.ok) {
      // Rich error: status, code, retryAfterMs, feature — see lib/aiErrors.
      throw parseApiError(res, data)
    }
    return data
  })
}

function fetchThumbnailUrl(accessToken, youtubeUrl) {
  const base = getApiBaseUrl()
  const url = `${base}/api/thumbnails/youtube/fetch-existing?youtube_url=${encodeURIComponent(youtubeUrl)}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  }).then(async (r) => {
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      throw parseApiError(r, data)
    }
    return r.json()
  })
}

export const thumbnailsApi = {
  fetchExistingThumbnail(accessToken, youtubeUrl) {
    return fetchThumbnailUrl(accessToken, youtubeUrl)
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
    return request('POST', '/api/thumbnails/generate-batch', accessToken, payload, {
      'Idempotency-Key': key,
    })
  },
  regenerateWithPersona(accessToken, payload) {
    return request('POST', '/api/thumbnails/regenerate-with-persona', accessToken, payload)
  },
  generateSync(accessToken, payload) {
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
  improve(accessToken, payload) {
    return request('POST', '/api/thumbnails/improve', accessToken, payload)
  },
  getJob(accessToken, jobId) {
    return request('GET', `/api/jobs/${jobId}`, accessToken)
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
}

// ─── Async-job polling helpers ──────────────────────────────────────────────
//
// Used by `thumbnailsApi.chat` to wait on a worker-processed job. The
// frontend's mutation hook stays unchanged (resolves with a
// ThumbnailChatResponse); only the transport changes underneath.

const POLL_INTERVAL_MS = 1500
const POLL_TIMEOUT_MS = 180_000 // 3 min hard cap; the worker has its
//   own ~30s retry budget per job

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Poll a chat-job's status until it terminates. Updates the
 * job-status store on each tick so the live loader hint can read it.
 * Resolves with the final ThumbnailChatResponse or throws an error
 * shaped like the legacy sync route's failures (so existing catch
 * blocks in the caller continue to work unchanged).
 */
async function pollThumbnailChatJob(accessToken, jobId, fetchInit = {}) {
  const start = Date.now()
  const path = `/api/thumbnails/chat-jobs/${encodeURIComponent(jobId)}`
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    let s
    try {
      s = await request('GET', path, accessToken, null, {}, fetchInit)
    } catch (err) {
      // Network blip — keep polling unless caller's signal says stop.
      if (fetchInit?.signal?.aborted) throw err
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    useThumbnailJobStatusStore.getState().update(s)

    if (s.status === 'done' && s.result) return s.result
    if (s.status === 'failed') {
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

    await sleep(POLL_INTERVAL_MS)
  }
  // Soft timeout — don't claim failure; let the user wait or retry.
  // Refund logic already handled server-side regardless.
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
