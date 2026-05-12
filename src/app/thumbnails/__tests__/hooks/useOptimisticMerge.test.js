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
  // Server messages carry ISO ``created_at``; derive a deterministic
  // one from the id so tests can reason about ordering without
  // wallclock dependencies.
  return {
    id,
    role,
    content,
    created_at: new Date(1_700_000_000_000 + id * 1000).toISOString(),
    ...extras,
  }
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
    expect(out[0].kind).toBe('msg')
    expect(out[0].msg.id).toBe(1)
  })
})

describe('mergeOpsAndMessages — ORDERING regression (anchor-based)', () => {
  // The bug the user reported: a failure card landing at the TOP of
  // the message list instead of the bottom. Root cause was wall-clock
  // ordering under client/server clock skew — a local entry stamped
  // with ``Date.now()`` on a client whose clock ran behind the server
  // had an "older" timestamp than every prior server failure (whose
  // ``createdAt`` came from server time) and slotted at index 0.
  //
  // The fix uses ``anchorAfterServerId`` — the highest server-message
  // id known when the op was pushed. Server ids are monotone
  // increasing per conversation, so ordering by anchor never drifts.

  it('op with anchor=5 slots immediately after server id=5', () => {
    const msgs = [makeMsg(1), makeMsg(3), makeMsg(5), makeMsg(10)]
    const op = makeOp('opA', 42, { anchorAfterServerId: 5 })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    expect(out).toHaveLength(5)
    expect(out[0].msg.id).toBe(1)
    expect(out[1].msg.id).toBe(3)
    expect(out[2].msg.id).toBe(5)
    expect(out[3]).toEqual({ kind: 'op', op })
    expect(out[4].msg.id).toBe(10)
  })

  it('op with anchor higher than every server id tail-appends', () => {
    const msgs = [makeMsg(1), makeMsg(2)]
    const op = makeOp('opTail', 42, { anchorAfterServerId: 999 })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    // Anchor not present → fallback tail-append.
    expect(out).toHaveLength(3)
    expect(out[2]).toEqual({ kind: 'op', op })
  })

  it('orphan op (no anchor) tail-appends, never slots at top', () => {
    const msgs = [makeMsg(1), makeMsg(2), makeMsg(3)]
    const op = makeOp('orphan', 42) // no anchorAfterServerId
    const out = mergeOpsAndMessages(msgs, [op], 42)
    // No anchor → tail-append. Never index 0.
    expect(out).toHaveLength(4)
    expect(out[3].op.op_id).toBe('orphan')
  })

  it('multiple ops sharing one anchor stack in push order', () => {
    // Typical chat-error scenario: user_local pushed first, then
    // failure local pushed. Both anchored after the same server id.
    const msgs = [makeMsg(1), makeMsg(5), makeMsg(10)]
    const userLocal = makeOp('user_local', 42, { anchorAfterServerId: 10 })
    const failureLocal = makeOp('failure_local', 42, { anchorAfterServerId: 10 })
    const out = mergeOpsAndMessages(msgs, [userLocal, failureLocal], 42)
    expect(out.map((e) => (e.kind === 'msg' ? `m${e.msg.id}` : e.op.op_id))).toEqual([
      'm1',
      'm5',
      'm10',
      'user_local',
      'failure_local',
    ])
  })

  it('multiple ops with different anchors slot independently', () => {
    const msgs = [makeMsg(1), makeMsg(5), makeMsg(10)]
    const opA = makeOp('opA', 42, { anchorAfterServerId: 1 })
    const opB = makeOp('opB', 42, { anchorAfterServerId: 5 })
    const out = mergeOpsAndMessages(msgs, [opA, opB], 42)
    expect(out.map((e) => (e.kind === 'msg' ? `m${e.msg.id}` : e.op.op_id))).toEqual([
      'm1',
      'opA',
      'm5',
      'opB',
      'm10',
    ])
  })

  it('clock-skew immune: anchor wins even if op timestamp would slot it wrong', () => {
    // Worst-case scenario: client clock is 1 hour BEHIND server clock.
    // The op's ``created_at`` is hours older than every server entry.
    // Timestamp-based slotting WOULD put the op at index 0; anchor
    // slotting puts it where it belongs.
    const msgs = [makeMsg(100), makeMsg(200), makeMsg(300)]
    const op = makeOp('skewed', 42, {
      anchorAfterServerId: 300,
      created_at: 1_000_000_000_000, // 2001 — wildly behind server clock
    })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    expect(out).toHaveLength(4)
    expect(out[3]).toEqual({ kind: 'op', op })
  })

  it('snake_case _anchorAfterServerId (legacy ThumbnailGenerator field) accepted', () => {
    // The live ThumbnailGenerator's local entries use
    // ``_anchorAfterServerId`` (underscore prefix). The merge function
    // accepts both shapes so a future migration doesn't regress.
    const msgs = [makeMsg(1), makeMsg(5)]
    const op = makeOp('legacy-shape', 42, { _anchorAfterServerId: 1 })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    expect(out.map((e) => (e.kind === 'msg' ? `m${e.msg.id}` : e.op.op_id))).toEqual([
      'm1',
      'legacy-shape',
      'm5',
    ])
  })

  it('failure folding wins over anchor slotting', () => {
    // When a server failure row matches an op's user_message_id,
    // failure folding takes precedence: the op renders at the
    // failure's id-based position, NOT at the anchor's position.
    // Guards against the new code accidentally double-rendering an
    // op that's both anchored AND server-bound.
    const op = makeOp('folded-op', 42, {
      status: 'failed',
      server_user_message_id: 100,
      anchorAfterServerId: 999, // would slot at end if anchor took over
    })
    const failure = makeMsg(101, 'assistant', 'sorry', {
      _kind: 'failure',
      _userMessageId: 100,
    })
    const msgs = [makeMsg(100, 'user', 'try this'), failure, makeMsg(200, 'user', 'next')]
    const out = mergeOpsAndMessages(msgs, [op], 42)
    // 100 suppressed (op covers it); op rendered at failure's id=101
    // slot; failure with _skipUserBubble follows; id=200 last.
    // Op rendered EXACTLY ONCE.
    expect(out).toHaveLength(3)
    expect(out[0].kind).toBe('op')
    expect(out[0].op.op_id).toBe('folded-op')
    expect(out[1].kind).toBe('msg')
    expect(out[1].msg._skipUserBubble).toBe(true)
    expect(out[2].msg.id).toBe(200)
  })
})
