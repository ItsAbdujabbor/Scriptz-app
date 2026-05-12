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

  // Append any ops that didn't get folded in alongside a server row.
  // These are the "pure" optimistic placeholders — submission in
  // flight, or terminal-error ops still showing a Retry card.
  for (const op of visibleOps) {
    if (consumed.has(op.op_id)) continue
    out.push({ kind: 'op', op })
  }

  return out
}
