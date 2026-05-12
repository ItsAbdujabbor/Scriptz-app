/**
 * useOptimisticOpStore — Phase 3 replacement for `localOnlyMessages`.
 *
 * Today, the 5,294-line `ThumbnailGenerator.jsx` holds optimistic
 * placeholders in a single component-state array (`localOnlyMessages`)
 * decorated with refs (`_conversationId`, `_serverMessageId`,
 * `_promptPending`, `_kind`, `_optimistic`). That coupling is the
 * source of most recent bugs (jobs disappearing, hydration flickers,
 * spam-Enter races) and makes refactoring impossible without breaking
 * the chat surface.
 *
 * This store normalizes the model: ONE entity (`OptimisticOp`) keyed
 * by `op_id`, with a small state machine
 * (`pending → submitting → server-bound → completed|failed|timed_out`).
 * The render path is pure (`useOptimisticMerge`); the lifecycle
 * subscriber (Phase 3.4 hydration hook) evicts ops once their server
 * twins land or the job hits a terminal SSE event.
 *
 * Persistence: ops survive a hard refresh via Zustand `persist`. The
 * partialize step strips payload blobs (image data URLs, base64) so
 * localStorage stays well under the 5MB browser cap even after dozens
 * of in-flight submissions. The server owns the canonical content
 * anyway — once an op is `server-bound`, its visible content comes
 * from the conversation cache via the bound message ids.
 *
 * STALE-EVICTION: ops created more than 30 minutes ago are dropped on
 * mount. The backend has had ample time to either complete or fail by
 * then; anything still labelled "pending" is almost certainly an
 * orphan from a tab the user closed before /chat/submit returned.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'clixa-pending-ops-v1'
const STALE_EVICT_MS = 30 * 60 * 1000 // 30 minutes

/**
 * @typedef {Object} OptimisticOp
 * @property {string} op_id
 * @property {number|null} conversation_id
 * @property {'chat'|'recreate'|'analyze'|'titles'|'edit'} mode
 * @property {'pending'|'submitting'|'server-bound'|'completed'|'failed'|'timed_out'} status
 * @property {number} created_at
 * @property {number|null} server_user_message_id
 * @property {number|null} server_assistant_message_id
 * @property {string|null} job_id
 * @property {Object|null} error
 * @property {Object} [payload]            // not persisted
 */

export const useOptimisticOpStore = create(
  persist(
    (set, get) => ({
      /** Map of op_id → OptimisticOp. */
      ops: {},

      /**
       * Insert a new op. Idempotent on op_id (re-adding the same
       * op_id replaces the existing entry — handy for the
       * submission-time retry path where the caller wants a fresh
       * status without minting a new op).
       *
       * @param {OptimisticOp} op
       */
      add(op) {
        if (!op || !op.op_id) return
        set((state) => ({
          ops: {
            ...state.ops,
            [op.op_id]: { ...op },
          },
        }))
      },

      /**
       * Shallow-merge a patch onto an op. No-op when the op_id is
       * absent (e.g. user cleared localStorage between mount and a
       * delayed SSE event).
       *
       * @param {string} op_id
       * @param {Partial<OptimisticOp>} patch
       */
      update(op_id, patch) {
        if (!op_id || !patch) return
        set((state) => {
          const existing = state.ops[op_id]
          if (!existing) return state
          return {
            ops: {
              ...state.ops,
              [op_id]: { ...existing, ...patch },
            },
          }
        })
      },

      /**
       * Mark an op as failed. Convenience wrapper for the
       * useChatSubmission catch path. Uses ``get().update`` because
       * Zustand's create returns an object whose methods don't keep
       * a stable ``this`` — calling ``this.update`` from outside the
       * store throws.
       *
       * @param {string} op_id
       * @param {Object} error
       */
      fail(op_id, error) {
        get().update(op_id, { status: 'failed', error })
      },

      /**
       * Drop an op from the store. Called by the hydration
       * subscriber once a server twin lands AND the job is
       * terminal, or by the stale-eviction sweep.
       *
       * @param {string} op_id
       */
      evict(op_id) {
        if (!op_id) return
        set((state) => {
          if (!(op_id in state.ops)) return state
          const next = { ...state.ops }
          delete next[op_id]
          return { ops: next }
        })
      },

      /**
       * Drop every op older than `STALE_EVICT_MS`. Called once on
       * mount by the hydration hook. Sample usage in tests too.
       */
      sweepStale(now = Date.now()) {
        set((state) => {
          let changed = false
          const next = {}
          for (const [id, op] of Object.entries(state.ops)) {
            if (op && now - (op.created_at || 0) <= STALE_EVICT_MS) {
              next[id] = op
            } else {
              changed = true
            }
          }
          return changed ? { ops: next } : state
        })
      },
    }),
    {
      name: STORAGE_KEY,
      // Strip transient payload blobs from the persisted form — they
      // can be megabytes (image data URLs) and the localStorage quota
      // is 5MB total per origin. The server owns canonical content;
      // a refreshed op renders from the conversation cache via its
      // bound message ids once it transitions to `server-bound`.
      partialize: (state) => ({
        ops: Object.fromEntries(
          Object.entries(state.ops || {}).map(([id, op]) => [
            id,
            {
              op_id: op.op_id,
              conversation_id: op.conversation_id ?? null,
              mode: op.mode,
              status: op.status,
              created_at: op.created_at,
              server_user_message_id: op.server_user_message_id ?? null,
              server_assistant_message_id: op.server_assistant_message_id ?? null,
              job_id: op.job_id ?? null,
              error: op.error ?? null,
              // Intentionally omit `payload` — text-only summaries are
              // recoverable from the server's user_message row once
              // `server_user_message_id` lands.
            },
          ])
        ),
      }),
      // Versioned: a schema change in a future release should bump
      // this and provide a migrate(). For now a single v1 schema.
      version: 1,
    }
  )
)

// ── Selectors ────────────────────────────────────────────────────────
// Lightweight selectors for callers that don't want to subscribe to
// the entire `ops` map (which churns on every update). Use these via
// `useOptimisticOpStore(selectOpsForConversation(id))`.

export const selectAllOps = (state) => Object.values(state.ops)

export const selectOpsForConversation = (conversationId) => (state) => {
  const all = Object.values(state.ops)
  if (conversationId == null) {
    return all.filter((o) => o.conversation_id == null)
  }
  return all.filter((o) => Number(o.conversation_id) === Number(conversationId))
}

export const selectActiveOps = (state) =>
  Object.values(state.ops).filter(
    (o) => o.status !== 'completed' && o.status !== 'failed' && o.status !== 'timed_out'
  )

export const selectOpByJobId = (jobId) => (state) => {
  if (!jobId) return null
  for (const op of Object.values(state.ops)) {
    if (op.job_id && String(op.job_id) === String(jobId)) return op
  }
  return null
}
