/**
 * useChatSubmission — Phase 3.5 of the architectural rewrite.
 *
 * Owns the chat-submit state machine that today is buried inside the
 * 5,294-line `ThumbnailGenerator.jsx`. The old code uses a ref-soup
 * (`submitGuardRef`, `isSubmittingRef`, `submissionTargetRef`,
 * `sawMessagesRef`, `prevConversationIdRef`) plus an `RAF×2` lock
 * release to coordinate optimistic state with conversation switches.
 * That coupling is the source of most recent bugs.
 *
 * This hook replaces all of it with a deterministic per-op state
 * machine:
 *
 *     pending → submitting → server-bound → completed | failed | timed_out
 *
 * The `useOptimisticOpStore` (Phase 3.2) holds the ops; this hook
 * mutates them through their lifecycle. The merge function (Phase
 * 3.1) renders them. The job store (Phase 3.3) tracks live SSE
 * progress. Each piece is independently testable.
 *
 * Signature:
 *     const { submit } = useChatSubmission()
 *     const { op_id, conversationIdPromise } = await submit({
 *       message, conversationId, mode, options,
 *     })
 *
 *   * `op_id` is the client-side identifier — also reused as the
 *     backend's `Idempotency-Key` so replays land on the same row.
 *   * `conversationIdPromise` resolves with the backend's canonical
 *     conversation id (or null on failure). Callers that need to
 *     flip the URL hash after a new chat completes can await it.
 *
 * Synchronous spam-guard lives in the COMPOSER (a 3-line `useRef`
 * around the click handler) — not here. The hook is fire-and-forget
 * from the caller's perspective; the op state in the store is the
 * source of truth for "is anything in flight?".
 */
import { useCallback } from 'react'

import { useThumbnailChatMutation } from '../../../queries/thumbnails/thumbnailQueries.js'

import { useOptimisticOpStore } from '../../../stores/useOptimisticOpStore.js'

function newOpId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * @typedef {Object} SubmitInput
 * @property {string} message
 * @property {number|null} [conversationId]
 * @property {'chat'|'recreate'|'analyze'|'titles'|'edit'} [mode]
 * @property {Object} [options]
 * @property {(conversationId: number|null) => void} [onConversationCreated]
 */

/**
 * @typedef {Object} SubmitResult
 * @property {string} op_id
 * @property {Promise<number|null>} conversationIdPromise
 */

export function useChatSubmission() {
  const addOp = useOptimisticOpStore((s) => s.add)
  const updateOp = useOptimisticOpStore((s) => s.update)
  const failOp = useOptimisticOpStore((s) => s.fail)
  const chatMutation = useThumbnailChatMutation()

  const submit = useCallback(
    /**
     * @param {SubmitInput} input
     * @returns {SubmitResult}
     */
    (input) => {
      const {
        message,
        conversationId = null,
        mode = 'chat',
        options = {},
        onConversationCreated,
      } = input || {}

      const op_id = newOpId()
      const now = Date.now()

      // Mint the op in the `pending` state synchronously so the
      // composer can read its `op_id` back and the merge function
      // immediately includes it in the render list. No race window
      // between "user clicked Send" and "loader card on screen."
      addOp({
        op_id,
        conversation_id: conversationId ?? null,
        mode,
        status: 'pending',
        created_at: now,
        server_user_message_id: null,
        server_assistant_message_id: null,
        job_id: null,
        error: null,
        payload: { message, options },
      })

      // Resolve `conversationIdPromise` with the canonical id (or
      // null on failure). Callers that need to flip the URL hash
      // after a new-chat submission completes can await this.
      let resolveConvId
      const conversationIdPromise = new Promise((resolve) => {
        resolveConvId = resolve
      })

      const run = async () => {
        try {
          updateOp(op_id, { status: 'submitting' })
          const result = await chatMutation.mutateAsync({
            message,
            conversation_id: conversationId ?? undefined,
            mode,
            ...options,
            // op_id IS the idempotency key — a fresh op gets a fresh
            // key, a replay (Retry button) reuses the original key
            // by re-submitting through the same op_id.
            _idempotencyKey: op_id,
          })
          const boundConvId =
            result?.conversation_id != null ? Number(result.conversation_id) : null
          updateOp(op_id, {
            status: 'server-bound',
            conversation_id: boundConvId,
            server_user_message_id: result?.user_message?.id ?? null,
            server_assistant_message_id: result?.assistant_message?.id ?? null,
            job_id: result?.job_id ?? null,
          })
          // Notify the caller about the new conversation id ONLY
          // when this was a brand-new chat. For continuations on an
          // existing chat the URL is already correct.
          if (conversationId == null && boundConvId != null) {
            onConversationCreated?.(boundConvId)
          }
          resolveConvId(boundConvId)
        } catch (err) {
          failOp(op_id, {
            message: err?.message || 'Submission failed',
            code: err?.code || err?.status || null,
            payload: err?.payload || err?.body || null,
          })
          resolveConvId(conversationId ?? null)
        }
      }

      // Fire-and-forget — return the op handle to the caller
      // immediately so the composer can update its synchronous spam
      // guard and clear the textarea.
      run()

      return { op_id, conversationIdPromise }
    },
    [addOp, updateOp, failOp, chatMutation]
  )

  return { submit }
}
