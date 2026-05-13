/**
 * pendingActionStore — synchronous localStorage queue for in-flight
 * non-chat thumbnail operations (recreate / analyze / titles / edit).
 *
 * Each handler writes a ticket BEFORE the pre-persist POST so a
 * refresh during the ~100–300ms request window doesn't completely lose
 * the user's submission. The store is intentionally tiny: it doesn't
 * replay automatically (server-side completion + pending-row polling
 * already cover most cases), it just keeps a record so we can prune
 * stragglers and, if needed, surface a "we still have these queued"
 * notice in the future.
 *
 * Lifecycle:
 *
 *   1. Handler creates an `op_id` (uuid) + writes a ticket with
 *      `enqueue` BEFORE the network call. Synchronous → survives an
 *      immediate refresh.
 *   2. After pre-persist returns, `markPersisted` records the server
 *      message ids. The ticket is now "in flight, server-bound."
 *   3. After generation completes (success or failure), `complete`
 *      removes the ticket entirely. Idempotent.
 *   4. On mount, `prune(maxAgeMs)` drops tickets older than 30min —
 *      the stale-pending sweep already finalised those rows
 *      server-side, the ticket is no longer useful.
 *
 * The store is process-local (no cross-tab sync). Two tabs running
 * the same generation would each have their own queue, which is fine
 * because both pre-persist requests dedup by Idempotency-Key on the
 * server anyway.
 */

const STORAGE_KEY = 'clixa-pending-actions-v1'
const DEFAULT_MAX_AGE_MS = 30 * 60_000 // 30 min — matches stale-pending sweep + buffer

function safeRead() {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function safeWrite(map) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota / disabled / private mode — no-op */
  }
}

/**
 * Write a ticket for a freshly-submitted op. SYNCHRONOUS — call this
 * BEFORE any await so a refresh in the pre-persist window has a
 * record. Returns the same op for chaining.
 */
export function enqueue(op) {
  if (!op || !op.op_id) return op
  const map = safeRead()
  map[op.op_id] = {
    op_id: op.op_id,
    kind: op.kind,
    conversationId: op.conversationId ?? null,
    userText: op.userText ?? '',
    sourceImageUrl: op.sourceImageUrl ?? null,
    extra: op.extra ?? null,
    createdAt: Date.now(),
    status: 'unsynced',
    serverConvId: null,
    serverUserMessageId: null,
    serverAssistantMessageId: null,
  }
  safeWrite(map)
  return op
}

/** Bind the ticket to its server-assigned ids after pre-persist returns. */
export function markPersisted(op_id, ids) {
  if (!op_id) return
  const map = safeRead()
  const cur = map[op_id]
  if (!cur) return
  map[op_id] = {
    ...cur,
    status: 'persisted',
    serverConvId: ids?.serverConvId ?? cur.serverConvId,
    serverUserMessageId: ids?.serverUserMessageId ?? cur.serverUserMessageId,
    serverAssistantMessageId: ids?.serverAssistantMessageId ?? cur.serverAssistantMessageId,
  }
  safeWrite(map)
}

/** Drop the ticket — call on terminal success or failure. Idempotent. */
export function complete(op_id) {
  if (!op_id) return
  const map = safeRead()
  if (!(op_id in map)) return
  delete map[op_id]
  safeWrite(map)
}

/** Snapshot of all unresolved tickets. */
export function list() {
  return Object.values(safeRead())
}

/**
 * Drop tickets older than `maxAgeMs`. Stale-pending sweep on the
 * backend has already finalised those rows server-side (5min) — the
 * client-side record is just bookkeeping past that point.
 *
 * Call on mount.
 */
export function prune(maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const now = Date.now()
  const map = safeRead()
  let mutated = false
  for (const [id, entry] of Object.entries(map)) {
    if (!entry || typeof entry.createdAt !== 'number' || now - entry.createdAt > maxAgeMs) {
      delete map[id]
      mutated = true
    }
  }
  if (mutated) safeWrite(map)
}

/**
 * Clear every ticket. Useful on logout — tickets are scoped to the
 * current session and would otherwise leak across user switches on
 * the same browser.
 */
export function clearAll() {
  safeWrite({})
}
