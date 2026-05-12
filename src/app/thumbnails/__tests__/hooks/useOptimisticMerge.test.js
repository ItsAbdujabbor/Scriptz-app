/**
 * useOptimisticMerge tests — pure function, no React, no Zustand.
 *
 * Exercises the contract:
 *   * empty + empty → empty
 *   * server-only → passes through
 *   * op-only-unbound (conversation_id=null) renders on the new-chat view
 *   * op-only-bound → suppresses server twins by id
 *   * server failure paired with op → folds the op into the user slot
 *   * cross-conversation ops are excluded from the view's render list
 *   * dedup precedence: when both an op and its server twin exist, op wins
 */
import { describe, it, expect } from 'vitest'

import { mergeOpsAndMessages } from '../../hooks/useOptimisticMerge.js'

function makeMsg(id, role = 'user', content = '', extras = {}) {
  return { id, role, content, ...extras }
}

function makeOp(op_id, conversation_id, overrides = {}) {
  return {
    op_id,
    conversation_id,
    mode: 'chat',
    status: 'submitting',
    created_at: Date.now(),
    server_user_message_id: null,
    server_assistant_message_id: null,
    job_id: null,
    error: null,
    ...overrides,
  }
}

describe('mergeOpsAndMessages', () => {
  it('empty + empty → empty', () => {
    expect(mergeOpsAndMessages([], [], 42)).toEqual([])
    expect(mergeOpsAndMessages([], [], null)).toEqual([])
  })

  it('server-only passes through in order', () => {
    const msgs = [makeMsg(1, 'user', 'hi'), makeMsg(2, 'assistant', 'hello')]
    const out = mergeOpsAndMessages(msgs, [], 42)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ kind: 'msg', msg: msgs[0] })
    expect(out[1]).toEqual({ kind: 'msg', msg: msgs[1] })
  })

  it('op-only-unbound renders on new-chat view', () => {
    const op = makeOp('op-1', null)
    const out = mergeOpsAndMessages([], [op], null)
    expect(out).toEqual([{ kind: 'op', op }])
  })

  it('unbound op does not render on a numeric-id view', () => {
    const op = makeOp('op-1', null)
    expect(mergeOpsAndMessages([], [op], 42)).toEqual([])
  })

  it('op-only-bound suppresses its server twin and renders the op', () => {
    const op = makeOp('op-1', 42, {
      server_user_message_id: 101,
      server_assistant_message_id: 102,
    })
    const msgs = [
      makeMsg(101, 'user', 'hello'),
      makeMsg(102, 'assistant', 'world'),
      makeMsg(103, 'user', 'next turn'),
    ]
    const out = mergeOpsAndMessages(msgs, [op], 42)
    // 101 + 102 suppressed; 103 still rendered; op appended.
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ kind: 'msg', msg: msgs[2] })
    expect(out[1]).toEqual({ kind: 'op', op })
  })

  it('cross-conversation ops are excluded', () => {
    const opA = makeOp('op-A', 42)
    const opB = makeOp('op-B', 99)
    const out = mergeOpsAndMessages([], [opA, opB], 42)
    expect(out).toEqual([{ kind: 'op', op: opA }])
  })

  it('failure folding pairs op + failure card, drops failure user bubble', () => {
    const op = makeOp('op-1', 42, {
      status: 'failed',
      server_user_message_id: 200,
    })
    const failure = makeMsg(201, 'assistant', 'sorry', {
      _kind: 'failure',
      _userMessageId: 200,
    })
    const msgs = [makeMsg(200, 'user', 'try this'), failure]
    const out = mergeOpsAndMessages(msgs, [op], 42)
    // 200 is suppressed (op covers it); failure remains but with
    // _skipUserBubble=true; op rendered in the user slot.
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ kind: 'op', op })
    expect(out[1].kind).toBe('msg')
    expect(out[1].msg._skipUserBubble).toBe(true)
    expect(out[1].msg.id).toBe(201)
  })

  it('dedup precedence: op wins even if assistant_id matches a server row', () => {
    const op = makeOp('op-1', 42, {
      server_assistant_message_id: 303,
    })
    const msgs = [makeMsg(303, 'assistant', 'should be hidden')]
    const out = mergeOpsAndMessages(msgs, [op], 42)
    // 303 hidden, op appended.
    expect(out).toEqual([{ kind: 'op', op }])
  })

  it('handles malformed input gracefully', () => {
    expect(mergeOpsAndMessages(null, null, 42)).toEqual([])
    expect(mergeOpsAndMessages(undefined, undefined, null)).toEqual([])
    // null entries inside arrays are skipped.
    const out = mergeOpsAndMessages([null, makeMsg(1, 'user', 'hi')], [null], 42)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ kind: 'msg', msg: { id: 1, role: 'user', content: 'hi' } })
  })
})
