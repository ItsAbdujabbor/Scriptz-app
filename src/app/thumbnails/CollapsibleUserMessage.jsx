/**
 * User-message bubble content with a 10-line clamp + Show more/less.
 *
 * Behaviour:
 *  • Measures the natural rendered height of the user's text. If it
 *    fits in ≤ 10 lines → renders as a plain <p>, no toggle, no clamp.
 *  • Long messages → clamp to 10 lines, fade the bottom to transparent
 *    via a CSS mask (so it blends regardless of the bubble's purple
 *    gradient), show a plain "Show more" text link underneath.
 *  • Expand/collapse animates max-height between MEASURED px values
 *    (clamped target ↔ scrollHeight) so the cubic-bezier ease runs
 *    evenly across the whole tween. The old setup used a 4000px
 *    ceiling vs the clamped target — the browser interpolated against
 *    the ceiling, so collapse "sprinted then crawled" and expand felt
 *    laggy. Px-on-both-ends fixes that.
 *  • Re-measures on viewport resize so the clamp stays accurate when
 *    line-wrapping changes width. Width-only — height changes during
 *    the transition do NOT trigger a re-measure (that would yank the
 *    transition shut every frame).
 *
 * Memoised on `text` only — cheap to render inside the chat list.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const COLLAPSED_LINES = 10

export const CollapsibleUserMessage = memo(function CollapsibleUserMessage({ text }) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const ref = useRef(null)
  // Cached measurements written by the layout-effect below. Refs not
  // state because we don't want a re-render on every measure; the
  // values are read at click time + applied straight to inline style.
  const clampedPxRef = useRef(0)
  const fullPxRef = useRef(0)
  // Mirror `expanded` in a ref so `measure()` (called from a
  // ResizeObserver closure that captures the initial render's expanded
  // value) can read the CURRENT state when applying max-height. Without
  // this, every RO fire during an in-flight expand transition reset
  // max-height back to the clamped value — the bug that made Show more
  // appear to do nothing.
  const expandedRef = useRef(false)
  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])
  // Track the last observed bubble width. RO fires on every box change
  // (width AND height). During the height transition triggered by
  // expand/collapse, height fires every frame — we must NOT treat those
  // as a re-measure signal. Only width changes matter (they affect
  // line-wrap count, which is what we actually care about).
  const lastWidthRef = useRef(0)

  // Single source of truth for re-measuring. Called from layout effect
  // (initial + on text change) and from the width-only ResizeObserver
  // branch. Reads `expanded` from the ref so an in-flight transition
  // is never reset.
  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const cs = window.getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight)
    if (!Number.isFinite(lh) || lh <= 0) return
    const clampedPx = lh * COLLAPSED_LINES
    // Temporarily lift the clamp so scrollHeight reflects full content.
    const prev = el.style.maxHeight
    el.style.maxHeight = 'none'
    const full = el.scrollHeight
    el.style.maxHeight = prev

    clampedPxRef.current = clampedPx
    fullPxRef.current = full
    const isOverflowing = full > clampedPx + 1
    setOverflowing(isOverflowing)

    if (!isOverflowing) {
      el.style.maxHeight = ''
    } else if (expandedRef.current) {
      el.style.maxHeight = `${full}px`
    } else {
      el.style.maxHeight = `${clampedPx}px`
    }
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    measure()
    lastWidthRef.current = el.clientWidth

    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        // Width-only gate: a height change during the expand/collapse
        // tween must not trigger a remeasure (it would write
        // max-height back to the static target every frame and the
        // transition would never play).
        const entry = entries[0]
        const width = entry?.contentRect?.width ?? el.clientWidth
        if (Math.abs(width - lastWidthRef.current) < 1) return
        lastWidthRef.current = width
        measure()
      })
      ro.observe(el)
    }
    return () => ro?.disconnect()
  }, [text, measure])

  // Reset to collapsed when the message text itself changes (rare —
  // user messages are immutable after send, but defensive).
  useEffect(() => {
    setExpanded(false)
  }, [text])

  // Write the destination max-height inline BEFORE flipping state so
  // the CSS transition runs cleanly from current → target. Doing the
  // DOM mutation inside `setState`'s updater would be fragile (React
  // may call updaters more than once) — handler scope is the right
  // place.
  const toggle = useCallback(() => {
    const el = ref.current
    const next = !expandedRef.current
    if (el) {
      const target = next ? fullPxRef.current : clampedPxRef.current
      if (target > 0) el.style.maxHeight = `${target}px`
    }
    setExpanded(next)
  }, [])

  if (!text) return null

  const clamped = overflowing && !expanded

  return (
    <>
      <p ref={ref} className={`thumb-user-msg${clamped ? ' thumb-user-msg--clamped' : ''}`}>
        {text}
      </p>
      {overflowing && (
        <button
          type="button"
          className="thumb-user-msg-toggle"
          onClick={toggle}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
})
