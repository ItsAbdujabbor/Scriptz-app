/**
 * useJobStore tests — verifies the per-job status keyed map.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  selectInFlightCount,
  selectIsTerminal,
  selectJobStatus,
  useJobStore,
} from '../../../stores/useJobStore.js'

beforeEach(() => {
  useJobStore.setState({ statuses: {} })
})

describe('useJobStore', () => {
  it('setStatus inserts by job_id', () => {
    useJobStore.getState().setStatus('job-1', { job_id: 'job-1', status: 'running', progress: 10 })
    expect(useJobStore.getState().statuses['job-1']).toEqual({
      job_id: 'job-1',
      status: 'running',
      progress: 10,
    })
  })

  it('setStatus is idempotent (replaces by id)', () => {
    useJobStore.getState().setStatus('job-1', { job_id: 'job-1', status: 'running', progress: 25 })
    useJobStore.getState().setStatus('job-1', { job_id: 'job-1', status: 'running', progress: 75 })
    expect(useJobStore.getState().statuses['job-1'].progress).toBe(75)
  })

  it('setStatus ignores empty jobId', () => {
    useJobStore.getState().setStatus('', { status: 'running' })
    useJobStore.getState().setStatus(null, { status: 'running' })
    expect(useJobStore.getState().statuses).toEqual({})
  })

  it('clear drops by id', () => {
    useJobStore.getState().setStatus('job-1', { status: 'running' })
    useJobStore.getState().setStatus('job-2', { status: 'running' })
    useJobStore.getState().clear('job-1')
    expect(useJobStore.getState().statuses['job-1']).toBeUndefined()
    expect(useJobStore.getState().statuses['job-2']).toBeDefined()
  })

  it('clearAll wipes everything', () => {
    useJobStore.getState().setStatus('job-1', { status: 'running' })
    useJobStore.getState().setStatus('job-2', { status: 'done' })
    useJobStore.getState().clearAll()
    expect(useJobStore.getState().statuses).toEqual({})
  })
})

describe('useJobStore — selectors', () => {
  it('selectJobStatus returns the entry or null', () => {
    useJobStore.getState().setStatus('job-1', { status: 'running' })
    expect(selectJobStatus('job-1')(useJobStore.getState())).toEqual({ status: 'running' })
    expect(selectJobStatus('missing')(useJobStore.getState())).toBeNull()
    expect(selectJobStatus(null)(useJobStore.getState())).toBeNull()
  })

  it('selectIsTerminal flips on done/failed', () => {
    useJobStore.getState().setStatus('a', { status: 'running' })
    useJobStore.getState().setStatus('b', { status: 'done' })
    useJobStore.getState().setStatus('c', { status: 'failed' })
    useJobStore.getState().setStatus('d', { status: 'retry_pending' })
    expect(selectIsTerminal('a')(useJobStore.getState())).toBe(false)
    expect(selectIsTerminal('b')(useJobStore.getState())).toBe(true)
    expect(selectIsTerminal('c')(useJobStore.getState())).toBe(true)
    expect(selectIsTerminal('d')(useJobStore.getState())).toBe(false)
    expect(selectIsTerminal('missing')(useJobStore.getState())).toBe(false)
  })

  it('selectInFlightCount counts non-terminal jobs', () => {
    useJobStore.getState().setStatus('a', { status: 'running' })
    useJobStore.getState().setStatus('b', { status: 'queued' })
    useJobStore.getState().setStatus('c', { status: 'done' })
    useJobStore.getState().setStatus('d', { status: 'failed' })
    useJobStore.getState().setStatus('e', { status: 'retry_pending' })
    expect(selectInFlightCount(useJobStore.getState())).toBe(3) // a, b, e
  })
})
