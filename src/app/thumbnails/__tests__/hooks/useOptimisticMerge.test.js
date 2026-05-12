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

describe('mergeOpsAndMessages — ORDERING regression (failure card position)', () => {
  // The bug the user reported: failure card appearing at the end of
  // the message list / above unrelated messages while appendEvent
  // was in flight (or had failed permanently). The fix slots local
  // entries into their chronological position by created_at, never
  // appended at the end.

  it('op older than every server message slots at index 0', () => {
    // Server messages with timestamps from id=1..3 (~1.7T epoch+1s).
    const msgs = [
      makeMsg(1, 'user', 'one'),
      makeMsg(2, 'assistant', 'two'),
      makeMsg(3, 'user', 'three'),
    ]
    // Op timestamped BEFORE id=1 (1.7T epoch - 60s).
    const op = makeOp('older-op', 42, { created_at: 1_700_000_000_000 - 60_000 })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    expect(out).toHaveLength(4)
    expect(out[0]).toEqual({ kind: 'op', op })
    expect(out[1].msg.id).toBe(1)
    expect(out[2].msg.id).toBe(2)
    expect(out[3].msg.id).toBe(3)
  })

  it('op timestamped between two server messages slots between them', () => {
    const msgs = [makeMsg(1), makeMsg(2), makeMsg(3)]
    // Op timestamped at id=2's time + 100ms (between id=2 and id=3,
    // which are 1s apart by construction).
    const opT = 1_700_000_000_000 + 2 * 1000 + 100
    const op = makeOp('middle-op', 42, { created_at: opT })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    expect(out).toHaveLength(4)
    expect(out[0].msg.id).toBe(1)
    expect(out[1].msg.id).toBe(2)
    expect(out[2]).toEqual({ kind: 'op', op }) // ← slots between, NOT at end
    expect(out[3].msg.id).toBe(3)
  })

  it('op newer than every server message slots at the end', () => {
    const msgs = [makeMsg(1), makeMsg(2)]
    const op = makeOp('newer-op', 42, { created_at: 1_700_000_000_000 + 1_000_000 })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    expect(out).toHaveLength(3)
    expect(out[2]).toEqual({ kind: 'op', op })
  })

  it('multiple ops slot into separate chronological positions', () => {
    const msgs = [makeMsg(1), makeMsg(5), makeMsg(10)]
    // Op A slots between id=1 and id=5, op B between id=5 and id=10.
    const opA = makeOp('opA', 42, { created_at: 1_700_000_000_000 + 2_500 })
    const opB = makeOp('opB', 42, { created_at: 1_700_000_000_000 + 7_500 })
    const out = mergeOpsAndMessages(msgs, [opA, opB], 42)
    expect(out).toHaveLength(5)
    expect(out.map((e) => (e.kind === 'msg' ? `m${e.msg.id}` : e.op.op_id))).toEqual([
      'm1',
      'opA',
      'm5',
      'opB',
      'm10',
    ])
  })

  it('legacy createdAt (epoch ms number) is honoured for ordering', () => {
    // The live ThumbnailGenerator's local entries use `createdAt`
    // (camelCase) instead of `created_at`. The merge function must
    // accept both so a future migration of ops to the legacy shape
    // doesn't silently regress ordering.
    const msgs = [makeMsg(1), makeMsg(10)]
    const opT = 1_700_000_000_000 + 5_000
    const op = makeOp('legacy-stamp', 42, { created_at: undefined, createdAt: opT })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    expect(out).toHaveLength(3)
    expect(out[0].msg.id).toBe(1)
    expect(out[1].op.op_id).toBe('legacy-stamp')
    expect(out[2].msg.id).toBe(10)
  })

  it('op with missing timestamp falls through to tail-append (defensive)', () => {
    const msgs = [makeMsg(1), makeMsg(2)]
    const op = makeOp('no-stamp', 42, { created_at: undefined })
    const out = mergeOpsAndMessages(msgs, [op], 42)
    // Op has no chronological marker → append at end, matching
    // legacy behaviour. Real ops always have a created_at.
    expect(out).toHaveLength(3)
    expect(out[2].op.op_id).toBe('no-stamp')
  })

  it('failure folding still wins over timestamp slotting', () => {
    // When a server failure row matches an op's user_message_id,
    // failure folding takes precedence: the op renders at the
    // failure's id-based position, NOT at the op's timestamp slot.
    // This guards against an unintended regression where the new
    // timestamp slotting overrides the failure-folding match.
    const op = makeOp('folded-op', 42, {
      status: 'failed',
      server_user_message_id: 100,
      created_at: 1_700_000_000_000 - 999_000, // way older than every msg
    })
    const failure = makeMsg(101, 'assistant', 'sorry', {
      _kind: 'failure',
      _userMessageId: 100,
    })
    const msgs = [makeMsg(100, 'user', 'try this'), failure, makeMsg(200, 'user', 'next')]
    const out = mergeOpsAndMessages(msgs, [op], 42)
    // 100 suppressed (op covers it); op rendered at failure's
    // position (id=101); failure with _skipUserBubble follows; id=200 last.
    // Critically: op is NOT slotted at index 0 by its older timestamp.
    expect(out).toHaveLength(3)
    expect(out[0].kind).toBe('op')
    expect(out[0].op.op_id).toBe('folded-op')
    expect(out[1].kind).toBe('msg')
    expect(out[1].msg._skipUserBubble).toBe(true)
    expect(out[2].msg.id).toBe(200)
  })
})
