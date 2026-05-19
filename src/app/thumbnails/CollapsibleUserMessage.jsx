/**
 * User-message bubble content with a 10-line clamp + Show more/less.
 *
 * Behaviour:
 *  • Measures the natural rendered height of the user's text. If it
 *    fits in ≤ 10 lines → renders as a plain <p>, no toggle, no clamp.
 *  • Long messages → clamp to 10 lines, fade the bottom to transparent
 *    via a CSS mask (so it blends regardless of the bubble's purple
 *    gradient), show a small "Show more" pill underneath.
 *  • Toggle expands/collapses with a smooth max-height transition.
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

  // Detect whether the natural text exceeds the 10-line clamp.
  // useLayoutEffect avoids a one-frame flash of "show more" before
  // remeasure on initial mount.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const measure = () => {
      const cs = window.getComputedStyle(el)
      const lh = parseFloat(cs.lineHeight)
      if (!Number.isFinite(lh) || lh <= 0) return
      const collapsedMaxPx = lh * COLLAPSED_LINES
      // Temporarily lift any clamp so scrollHeight reflects full content.
      const prev = el.style.maxHeight
      el.style.maxHeight = 'none'
      const full = el.scrollHeight
      el.style.maxHeight = prev
      setOverflowing(full > collapsedMaxPx + 1)
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
  }, [text])

  // Reset to collapsed when the message text itself changes (rare —
  // user messages are immutable after send, but defensive).
  useEffect(() => {
    setExpanded(false)
  }, [text])

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
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
})
