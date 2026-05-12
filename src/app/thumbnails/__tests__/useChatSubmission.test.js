/**
 * useChatSubmission tests — verify the state machine drives
 * `useOptimisticOpStore` through the documented transitions on
 * success, failure, and idempotency-key reuse.
 *
 * We don't mount React; we exercise the hook's internals by
 * replacing the mutation hook it calls (`useThumbnailChatMutation`)
 * with a stub via `vi.mock`. The hook's returned `submit()` then
 * exercises the op store directly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useOptimisticOpStore } from '../../../stores/useOptimisticOpStore.js'

// Mock `useThumbnailChatMutation` so we can control its resolve/reject
// behavior per test. The hook returns an object with `mutateAsync`;
// our stub queues a `mutateAsyncImpl` to return whatever the test
// wants.
let mutateAsyncImpl = async () => ({})

vi.mock('../../../queries/thumbnails/thumbnailQueries.js', () => ({
  useThumbnailChatMutation: () => ({
    mutateAsync: (payload) => mutateAsyncImpl(payload),
  }),
}))

// Dynamic import AFTER the mock is registered.
const { useChatSubmission } = await import('../hooks/useChatSubmission.js')

// Tiny `renderHook`-equivalent: a hook can be invoked outside React
// only via `react`'s test utilities, but useCallback/useState require
// a fiber. Instead, we invoke the underlying logic directly by
// installing the mocked module and constructing a one-off hook
// shell — but that's overkill. Simpler: bypass React and rely on
// the fact that `useChatSubmission` calls only Zustand selectors
// (which work outside React) and `useThumbnailChatMutation` (mocked).
//
// We extract the closure by calling the hook through React's
// renderHook from `@testing-library/react-hooks`. The repo doesn't
// install that, so we'll directly invoke the underlying machinery
// by reconstructing the call sites. That's brittle — instead, just
// integration-test through the op store: any submit() that runs
// drives observable store transitions.

import { renderToString } from 'react-dom/server'
import { createElement, useEffect, useRef } from 'react'

/** Mount a one-shot React subtree, run `fn(hookResult)` once, return
 * the resolved promise from `fn`. */
function runHookOnce(useHook, fn) {
  let resolve
  const done = new Promise((r) => (resolve = r))
  function Probe() {
    const ranRef = useRef(false)
    const result = useHook()
    useEffect(() => {
      // SSR rendering doesn't actually run useEffect — but we'll
      // call fn synchronously below.
    })
    if (!ranRef.current) {
      ranRef.current = true
      Promise.resolve(fn(result)).then(resolve)
    }
    return null
  }
  renderToString(createElement(Probe))
  return done
}

beforeEach(() => {
  useOptimisticOpStore.setState({ ops: {} })
})

describe('useChatSubmission', () => {
  it('happy path: pending → submitting → server-bound', async () => {
    mutateAsyncImpl = async () => ({
      conversation_id: 42,
      user_message: { id: 101 },
      assistant_message: { id: 102 },
      job_id: 'job-abc',
    })

    let onConvCreatedCalled = null
    const submitResult = await runHookOnce(useChatSubmission, async ({ submit }) => {
      const { op_id, conversationIdPromise } = submit({
        message: 'hello',
        conversationId: null,
        mode: 'chat',
        onConversationCreated: (cid) => {
          onConvCreatedCalled = cid
        },
      })
      const conv = await conversationIdPromise
      return { op_id, conv }
    })

    const { op_id, conv } = submitResult
    expect(conv).toBe(42)
    expect(onConvCreatedCalled).toBe(42)
    const op = useOptimisticOpStore.getState().ops[op_id]
    expect(op).toBeDefined()
    expect(op.status).toBe('server-bound')
    expect(op.conversation_id).toBe(42)
    expect(op.server_user_message_id).toBe(101)
    expect(op.server_assistant_message_id).toBe(102)
    expect(op.job_id).toBe('job-abc')
  })

  it('failure path: pending → submitting → failed', async () => {
    mutateAsyncImpl = async () => {
      const err = new Error('network blew up')
      err.code = 'NETWORK_DOWN'
      throw err
    }

    const submitResult = await runHookOnce(useChatSubmission, async ({ submit }) => {
      const { op_id, conversationIdPromise } = submit({
        message: 'retry me',
        conversationId: 42,
        mode: 'chat',
      })
      const conv = await conversationIdPromise
      return { op_id, conv }
    })

    const { op_id, conv } = submitResult
    expect(conv).toBe(42)
    const op = useOptimisticOpStore.getState().ops[op_id]
    expect(op).toBeDefined()
    expect(op.status).toBe('failed')
    expect(op.error?.code).toBe('NETWORK_DOWN')
    expect(op.error?.message).toBe('network blew up')
  })

  it('uses op_id as the idempotency key on the mutation', async () => {
    let receivedPayload = null
    mutateAsyncImpl = async (payload) => {
      receivedPayload = payload
      return { conversation_id: 99, user_message: null, assistant_message: null, job_id: null }
    }

    const { op_id } = await runHookOnce(useChatSubmission, async ({ submit }) => {
      const { op_id: o, conversationIdPromise } = submit({
        message: 'hi',
        conversationId: null,
      })
      await conversationIdPromise
      return { op_id: o }
    })

    expect(receivedPayload?._idempotencyKey).toBe(op_id)
    expect(receivedPayload?.message).toBe('hi')
  })

  it('does NOT call onConversationCreated on a continuation', async () => {
    mutateAsyncImpl = async () => ({
      conversation_id: 42,
      user_message: { id: 200 },
      assistant_message: { id: 201 },
      job_id: 'job-2',
    })
    let onConvCreatedCalled = null
    await runHookOnce(useChatSubmission, async ({ submit }) => {
      const { conversationIdPromise } = submit({
        message: 'follow-up',
        conversationId: 42, // already on this chat
        onConversationCreated: (cid) => {
          onConvCreatedCalled = cid
        },
      })
      await conversationIdPromise
    })
    expect(onConvCreatedCalled).toBeNull()
  })
})
