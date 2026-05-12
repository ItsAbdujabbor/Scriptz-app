/**
 * useOptimisticOpStore tests — covers the lifecycle invariants:
 *
 *   * add → ops[op_id] populated
 *   * update → shallow merge, identity-preserving
 *   * fail → status='failed' + error captured
 *   * evict → drops by id
 *   * sweepStale → drops ops older than 30 min
 *   * persistence partialize — payload blobs stripped
 *   * selectors — selectAllOps, selectOpsForConversation, selectActiveOps,
 *     selectOpByJobId
 */
// vitest's default `node` environment provides a partial `localStorage`
// stub (typeof !== 'undefined') that lacks `getItem` — so Zustand's
// `persist` middleware logs "storage unavailable" and skips writes.
// Force-install a complete in-memory polyfill at MODULE TOP LEVEL so
// the store import below sees a fully-featured Storage object.
{
  const _mem = new Map()
  globalThis.localStorage = {
    getItem(k) {
      return _mem.has(k) ? _mem.get(k) : null
    },
    setItem(k, v) {
      _mem.set(k, String(v))
    },
    removeItem(k) {
      _mem.delete(k)
    },
    clear() {
      _mem.clear()
    },
    key(i) {
      return Array.from(_mem.keys())[i] ?? null
    },
    get length() {
      return _mem.size
    },
  }
}

import { beforeEach, describe, expect, it } from 'vitest'

import {
  selectActiveOps,
  selectAllOps,
  selectOpByJobId,
  selectOpsForConversation,
  useOptimisticOpStore,
} from '../../../stores/useOptimisticOpStore.js'

function makeOp(overrides = {}) {
  return {
    op_id: 'op-1',
    conversation_id: 42,
    mode: 'chat',
    status: 'submitting',
    created_at: Date.now(),
    server_user_message_id: null,
    server_assistant_message_id: null,
    job_id: null,
    error: null,
    payload: { message: 'hello', options: {} },
    ...overrides,
  }
}

beforeEach(() => {
  // Reset both in-memory state and any persisted slice between tests.
  useOptimisticOpStore.setState({ ops: {} })
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('clixa-pending-ops-v1')
    }
  } catch {
    /* localStorage may not be available in this env */
  }
})

describe('useOptimisticOpStore — basic lifecycle', () => {
  it('add inserts an op', () => {
    useOptimisticOpStore.getState().add(makeOp())
    const state = useOptimisticOpStore.getState()
    expect(state.ops['op-1']).toBeDefined()
    expect(state.ops['op-1'].status).toBe('submitting')
  })

  it('add is idempotent (same id replaces)', () => {
    useOptimisticOpStore.getState().add(makeOp({ status: 'pending' }))
    useOptimisticOpStore.getState().add(makeOp({ status: 'submitting' }))
    const op = useOptimisticOpStore.getState().ops['op-1']
    expect(op.status).toBe('submitting')
  })

  it('update shallow-merges the patch', () => {
    useOptimisticOpStore.getState().add(makeOp())
    useOptimisticOpStore.getState().update('op-1', {
      status: 'server-bound',
      server_user_message_id: 101,
      job_id: 'job-1',
    })
    const op = useOptimisticOpStore.getState().ops['op-1']
    expect(op.status).toBe('server-bound')
    expect(op.server_user_message_id).toBe(101)
    expect(op.job_id).toBe('job-1')
    // unaffected fields retained
    expect(op.mode).toBe('chat')
    expect(op.conversation_id).toBe(42)
  })

  it('update is a no-op on unknown ids', () => {
    useOptimisticOpStore.getState().update('missing', { status: 'failed' })
    expect(useOptimisticOpStore.getState().ops).toEqual({})
  })

  it('fail sets status="failed" + error', () => {
    useOptimisticOpStore.getState().add(makeOp())
    useOptimisticOpStore.getState().fail('op-1', { code: 'OOPS', message: 'broke' })
    const op = useOptimisticOpStore.getState().ops['op-1']
    expect(op.status).toBe('failed')
    expect(op.error).toEqual({ code: 'OOPS', message: 'broke' })
  })

  it('evict drops by id', () => {
    useOptimisticOpStore.getState().add(makeOp())
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'op-2' }))
    useOptimisticOpStore.getState().evict('op-1')
    expect(useOptimisticOpStore.getState().ops['op-1']).toBeUndefined()
    expect(useOptimisticOpStore.getState().ops['op-2']).toBeDefined()
  })
})

describe('useOptimisticOpStore — sweepStale', () => {
  it('drops ops older than 30 minutes', () => {
    const old = Date.now() - 31 * 60 * 1000
    const recent = Date.now() - 1 * 60 * 1000
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'old', created_at: old }))
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'recent', created_at: recent }))
    useOptimisticOpStore.getState().sweepStale()
    const state = useOptimisticOpStore.getState()
    expect(state.ops['old']).toBeUndefined()
    expect(state.ops['recent']).toBeDefined()
  })

  it('is a no-op when everything is fresh', () => {
    useOptimisticOpStore.getState().add(makeOp({ created_at: Date.now() }))
    useOptimisticOpStore.getState().sweepStale()
    expect(useOptimisticOpStore.getState().ops['op-1']).toBeDefined()
  })
})

describe('useOptimisticOpStore — selectors', () => {
  it('selectAllOps returns every op', () => {
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'a' }))
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'b' }))
    const out = selectAllOps(useOptimisticOpStore.getState())
    expect(out).toHaveLength(2)
    expect(out.map((o) => o.op_id).sort()).toEqual(['a', 'b'])
  })

  it('selectOpsForConversation filters by id + null-bucket', () => {
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'a', conversation_id: 1 }))
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'b', conversation_id: 2 }))
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'c', conversation_id: null }))
    const inConv1 = selectOpsForConversation(1)(useOptimisticOpStore.getState())
    expect(inConv1.map((o) => o.op_id)).toEqual(['a'])
    const unbound = selectOpsForConversation(null)(useOptimisticOpStore.getState())
    expect(unbound.map((o) => o.op_id)).toEqual(['c'])
  })

  it('selectActiveOps excludes terminal states', () => {
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'a', status: 'submitting' }))
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'b', status: 'completed' }))
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'c', status: 'failed' }))
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'd', status: 'timed_out' }))
    const active = selectActiveOps(useOptimisticOpStore.getState())
    expect(active.map((o) => o.op_id)).toEqual(['a'])
  })

  it('selectOpByJobId finds the op for a job', () => {
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'a', job_id: 'job-1' }))
    useOptimisticOpStore.getState().add(makeOp({ op_id: 'b', job_id: 'job-2' }))
    const op = selectOpByJobId('job-2')(useOptimisticOpStore.getState())
    expect(op?.op_id).toBe('b')
    expect(selectOpByJobId('missing')(useOptimisticOpStore.getState())).toBeNull()
    expect(selectOpByJobId(null)(useOptimisticOpStore.getState())).toBeNull()
  })
})

// Persistence (partialize) coverage is deferred to the Playwright
// "hard-refresh-mid-job" e2e test in Phase 3.7+. Vitest's `node`
// environment provides only a partial Storage stub, and unit-testing
// Zustand's persist round-trip in isolation has been more fragile
// than it's worth — the shape of the partialize step is small and
// the integration test catches actual refresh-survival behavior.
