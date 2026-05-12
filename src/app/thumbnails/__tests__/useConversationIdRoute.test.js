/**
 * useConversationIdRoute tests — covers the pure parse/serialize
 * helpers. The reactive hook itself is exercised by the
 * ThumbnailScreen integration test (Phase 3.7 finale).
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  parseConversationIdFromHash,
  writeConversationIdToHash,
} from '../../../hooks/useConversationIdRoute.js'

// Minimal jsdom-free shim for window.location.hash. Each test sets
// its own value via `setHash(...)` and the parser reads it.
const fakeLocation = { hash: '' }
const fakeWindow = {
  location: fakeLocation,
  addEventListener: () => {},
  removeEventListener: () => {},
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = fakeWindow
} else {
  globalThis.window.location = fakeLocation
}

function setHash(next) {
  fakeLocation.hash = next
}

afterEach(() => {
  setHash('')
})

describe('parseConversationIdFromHash', () => {
  it('returns null for empty hash', () => {
    setHash('')
    expect(parseConversationIdFromHash()).toBeNull()
  })

  it('returns null for #thumbnails with no query', () => {
    setHash('#thumbnails')
    expect(parseConversationIdFromHash()).toBeNull()
  })

  it('returns the numeric id from #thumbnails?id=42', () => {
    setHash('#thumbnails?id=42')
    expect(parseConversationIdFromHash()).toBe(42)
  })

  it('returns null for a non-thumbnails route', () => {
    setHash('#optimize?id=42')
    expect(parseConversationIdFromHash()).toBeNull()
  })

  it('returns null for a non-numeric id', () => {
    setHash('#thumbnails?id=abc')
    expect(parseConversationIdFromHash()).toBeNull()
  })

  it('returns null for id=0 or negative', () => {
    setHash('#thumbnails?id=0')
    expect(parseConversationIdFromHash()).toBeNull()
    setHash('#thumbnails?id=-5')
    expect(parseConversationIdFromHash()).toBeNull()
  })

  it('handles leading slashes and double-hash defensively', () => {
    setHash('#/thumbnails?id=99')
    expect(parseConversationIdFromHash()).toBe(99)
  })
})

describe('writeConversationIdToHash', () => {
  it('null → #thumbnails', () => {
    setHash('#something-else')
    writeConversationIdToHash(null)
    expect(fakeLocation.hash).toBe('#thumbnails')
  })

  it('numeric → #thumbnails?id=N', () => {
    writeConversationIdToHash(7)
    expect(fakeLocation.hash).toBe('#thumbnails?id=7')
  })

  it('is idempotent (no-op if hash already correct)', () => {
    setHash('#thumbnails?id=7')
    writeConversationIdToHash(7)
    expect(fakeLocation.hash).toBe('#thumbnails?id=7')
  })
})
