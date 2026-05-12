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
 *   4. Ops that have NO matching server twin yet slot into the result
 *      list IMMEDIATELY AFTER their ``anchorAfterServerId`` — the
 *      highest server-message id known at the moment the op was
 *      pushed. Multiple ops with the same anchor stack in their
 *      push order.
 *
 *      Wall-clock timestamps are NOT used for ordering. Server ids
 *      are monotone increasing per conversation, so they're a
 *      drift-proof anchor. Timestamp-based slotting broke under
 *      client/server clock skew — a local op stamped with
 *      ``Date.now()`` on a client whose clock ran behind the server
 *      would have an "older" timestamp than every prior server
 *      entry and slot at the TOP of the list.
 *
 *      Ops with no anchor (brand-new chat — no server messages yet)
 *      tail-append. Ops whose anchor id isn't in the current server
 *      list (rare — conversation reset) also tail-append. Neither
 *      fallback can produce an out-of-order render because both
 *      paths land the op after every visible server entry.
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
  const intermediate = []
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
        intermediate.push({ kind: 'op', op })
        consumed.add(op.op_id)
        intermediate.push({ kind: 'msg', msg: { ...m, _skipUserBubble: true } })
        continue
      }
    }

    intermediate.push({ kind: 'msg', msg: m })
  }

  // Group unconsumed ops by their anchor id, preserving insertion
  // order so multiple ops with the same anchor (typical for a
  // user_local + failure_local pair) stack correctly.
  const opsByAnchor = new Map()
  const orphanOps = []
  for (const op of visibleOps) {
    if (consumed.has(op.op_id)) continue
    const anchor =
      op.anchorAfterServerId != null
        ? Number(op.anchorAfterServerId)
        : op._anchorAfterServerId != null
          ? Number(op._anchorAfterServerId)
          : null
    if (anchor == null || !Number.isFinite(anchor)) {
      orphanOps.push(op)
      continue
    }
    if (!opsByAnchor.has(anchor)) opsByAnchor.set(anchor, [])
    opsByAnchor.get(anchor).push(op)
  }

  // Single-pass merge. After each server entry, emit any ops anchored
  // after it. Ops never appear between server entries with adjacent
  // ids — the anchor pin guarantees position determinism.
  const out = []
  for (const e of intermediate) {
    out.push(e)
    const eid = e.kind === 'msg' && typeof e.msg.id === 'number' ? e.msg.id : null
    if (eid != null && opsByAnchor.has(eid)) {
      for (const op of opsByAnchor.get(eid)) out.push({ kind: 'op', op })
      opsByAnchor.delete(eid)
    }
  }
  // Orphan ops (no anchor — brand-new chat) tail-append in push order.
  for (const op of orphanOps) out.push({ kind: 'op', op })
  // Ops whose anchor server id wasn't in the result list (the anchor
  // row was dropped, e.g. conversation refetch returned a different
  // slice). Tail-append rather than silently losing them.
  for (const arr of opsByAnchor.values()) {
    for (const op of arr) out.push({ kind: 'op', op })
  }

  return out
}
