/**
 * useOptimisticMerge — pure server-messages + active-ops → ordered render list.
 *
 * Phase 3 of the architectural rewrite. Replaces the `renderedMessages`
 * useMemo currently buried inside `ThumbnailGenerator.jsx:2914-2995`.
 * Same contract, but pure and tested in isolation:
 *
 *   * Server messages are the canonical source. Each carries a numeric
 *     `id` assigned by the backend at insert time.
 *
 *   * Optimistic ops (`OptimisticOp`) are the in-flight client-side
 *     placeholders for submissions whose server response hasn't
 *     landed yet (or whose terminal SSE event hasn't reconciled
 *     against the conversation cache).
 *
 *   * Each op pins to a single `conversation_id` (or `null` while the
 *     op is unbound, i.e. submitted in the "new chat" surface and
 *     waiting for the backend to mint the canonical id).
 *
 *   * Each op acquires `server_user_message_id` and
 *     `server_assistant_message_id` after its submission completes.
 *     The merge function suppresses any server message whose id
 *     appears in either of those fields — the op IS the visible row
 *     for that user/assistant turn, providing a stable React key
 *     across `pending → bound → done` so the card never remounts.
 *
 * Failure folding: when a server "failure" message exists whose
 * `_userMessageId` extra-field points at the op's user-side server
 * id, the merge function lays the op (rendering as the user bubble)
 * AND the failure card together, dropping the failure's own user
 * bubble so the user message isn't rendered twice.
 *
 * This file is a PURE JavaScript module — no React, no Zustand, no
 * fetch. Tested via `vitest`; embedded in `ChatThread.jsx` once
 * Phase 3.6 (component split) lands.
 */

/**
 * @typedef {Object} OptimisticOp
 * @property {string} op_id
 * @property {number|null} conversation_id
 * @property {'chat'|'recreate'|'analyze'|'titles'|'edit'} mode
 * @property {'pending'|'submitting'|'server-bound'|'completed'|'failed'|'timed_out'} status
 * @property {number} created_at        // epoch ms
 * @property {number|null} server_user_message_id
 * @property {number|null} server_assistant_message_id
 * @property {string|null} job_id
 * @property {Object|null} error
 */

/**
 * @typedef {Object} ServerMessage
 * @property {number} id
 * @property {'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {string} [_kind]                  // 'failure' | undefined
 * @property {number} [_userMessageId]         // set on failure rows
 */

/**
 * @typedef {{kind:'msg', msg:ServerMessage} | {kind:'op', op:OptimisticOp}} RenderEntry
 */

/**
 * Server messages carry ISO ``created_at`` strings; ops carry epoch-ms
 * ``created_at`` numbers. Normalise both to epoch ms so the
 * chronological-position sort doesn't drift on string-vs-number
 * comparisons. Returns ``null`` when the entry has no usable marker
 * (defensive — every real entry has one in production).
 *
 * @param {ServerMessage|OptimisticOp} entry
 * @returns {number|null}
 */
function entryTimestamp(entry) {
  if (!entry) return null
  if (typeof entry.created_at === 'string') {
    const t = new Date(entry.created_at).getTime()
    return Number.isFinite(t) ? t : null
  }
  if (entry.created_at != null) {
    const n = Number(entry.created_at)
    return Number.isFinite(n) ? n : null
  }
  // Legacy `createdAt` field on optimistic ops (matches the live
  // ThumbnailGenerator's local-entry shape).
  if (entry.createdAt != null) {
    const n = Number(entry.createdAt)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Merge `serverMessages` (id-sorted ascending) and `ops` into a single
 * ordered render list, scoped to `conversationId`.
 *
 * Ordering contract (the bug-prevention spec):
 *
 *   1. Server messages preserve their input order (already id-sorted
 *      by the caller).
 *
 *   2. Server twins of ops are suppressed in-place. The op is rendered
 *      at the same logical position — same stable React key from
 *      pending through completed → no remount during status flips.
 *
 *   3. Failure folding: a server `_kind='failure'` row whose
 *      `_userMessageId` matches an op's `server_user_message_id`
 *      renders the op + failure as a paired entry (drops the
 *      failure card's internal user bubble).
 *
 *   4. Ops that have NO matching server twin yet (still submitting,
 *      or an `appendEvent` for a failure card hasn't returned) slot
 *      into the result list at their CHRONOLOGICAL position by
 *      `created_at`, NOT at the end. This is the fix for the
 *      "failure card appears at the bottom while appendEvent is
 *      in flight" bug.
 *
 * @param {ServerMessage[]} serverMessages
 * @param {OptimisticOp[]} ops
 * @param {number|null} conversationId
 * @returns {RenderEntry[]}
 */
export function mergeOpsAndMessages(serverMessages, ops, conversationId) {
  const safeMsgs = Array.isArray(serverMessages) ? serverMessages : []
  const safeOps = Array.isArray(ops) ? ops : []

  // Scope ops to this view: `null` conversation_id surfaces on the
  // "new chat" empty state (op was submitted before the backend
  // minted an id); numeric ids must match exactly.
  const visibleOps = safeOps.filter((o) => {
    if (!o) return false
    if (conversationId == null) return o.conversation_id == null
    return Number(o.conversation_id) === Number(conversationId)
  })

  // Build the dedup index: server ids that an op already covers
  // (either user-side, assistant-side, or both).
  const linkedServerIds = new Set()
  const userIdToOp = new Map()
  for (const op of visibleOps) {
    if (op.server_user_message_id != null) {
      linkedServerIds.add(Number(op.server_user_message_id))
      userIdToOp.set(Number(op.server_user_message_id), op)
    }
    if (op.server_assistant_message_id != null) {
      linkedServerIds.add(Number(op.server_assistant_message_id))
    }
  }

  /** @type {RenderEntry[]} */
  const out = []
  const consumed = new Set()

  for (const m of safeMsgs) {
    if (m == null || m.id == null) continue
    const mid = Number(m.id)

    // Server twin of an op — suppress the server row and render the
    // op instead. The op is rendering server content via the conv
    // cache lookup, so this is identity-preserving (no visible swap).
    if (linkedServerIds.has(mid)) continue

    // Failure folding: a `_kind='failure'` server message that points
    // at an op's user_message becomes a paired render — the op
    // renders the user bubble, the failure card renders the assistant
    // side. Drop the failure card's own user bubble so the user's
    // message doesn't render twice.
    if (m._kind === 'failure' && m._userMessageId != null) {
      const op = userIdToOp.get(Number(m._userMessageId))
      if (op && !consumed.has(op.op_id)) {
        out.push({ kind: 'op', op })
        consumed.add(op.op_id)
        out.push({ kind: 'msg', msg: { ...m, _skipUserBubble: true } })
        continue
      }
    }

    out.push({ kind: 'msg', msg: m })
  }

  // Slot any remaining ops into their CHRONOLOGICAL position. Walking
  // back from the tail finds the rightmost result entry whose
  // timestamp is older-or-equal to this op's timestamp — the op
  // belongs immediately after it. If every existing result entry is
  // newer (op predates them all, e.g. brand-new chat surface), the
  // op slots at index 0. Entries without a usable timestamp fall
  // through to a tail-append matching the legacy behaviour for that
  // defensive edge case.
  for (const op of visibleOps) {
    if (consumed.has(op.op_id)) continue
    const opT = entryTimestamp(op)
    let insertAt = out.length
    if (opT != null) {
      for (let i = out.length - 1; i >= 0; i--) {
        const entry = out[i].kind === 'op' ? out[i].op : out[i].msg
        const rt = entryTimestamp(entry)
        if (rt == null) continue
        if (rt <= opT) {
          insertAt = i + 1
          break
        }
        insertAt = i
      }
    }
    out.splice(insertAt, 0, { kind: 'op', op })
  }

  return out
}
