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
 *    line-wrapping changes width.
 *
 * Memoised on `text` only — cheap to render inside the chat list.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'

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

  // Measure both the clamped target and the full natural height, then
  // pin max-height to one of them in inline style. useLayoutEffect
  // avoids a one-frame flash of the toggle / wrong-height bubble before
  // the measurement settles on initial mount.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const measure = () => {
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

      // Pin max-height to the appropriate px target so the next
      // transition starts from a real numeric value, not the
      // 'none'/'auto' implicit one (which can't be tweened).
      if (!isOverflowing) {
        el.style.maxHeight = ''
      } else if (expanded) {
        el.style.maxHeight = `${full}px`
      } else {
        el.style.maxHeight = `${clampedPx}px`
      }
    }
    measure()

    // Re-measure when the bubble's width changes (window resize, sidebar
    // collapse, etc.) — wrap count depends on width.
    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    }
    return () => ro?.disconnect()
    // Intentionally NOT depending on `expanded` — the click handler
    // already writes the right max-height. Including it would cause
    // a re-measure that fights the in-flight transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  // Reset to collapsed when the message text itself changes (rare —
  // user messages are immutable after send, but defensive).
  useEffect(() => {
    setExpanded(false)
  }, [text])

  // When the user toggles, write the destination px value inline so
  // the CSS `transition: max-height ...` runs from current → target
  // with a real numeric end-point on both sides.
  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev
      const el = ref.current
      if (el) {
        const target = next ? fullPxRef.current : clampedPxRef.current
        if (target > 0) el.style.maxHeight = `${target}px`
      }
      return next
    })
  }

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
