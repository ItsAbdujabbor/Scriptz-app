/**
 * ToastStack — global notification renderer fed by the `app:toast` event bus
 * (see `src/lib/toast.js`).
 *
 * Mounted once in `AppShellLayout` next to `<CelebrationOverlay />`. Any page
 * can fire `toast.error(...)` / `toast.success(...)` / etc. and a card will
 * slide in top-right.
 *
 * Each card has a reverse progress bar along the bottom that depletes from
 * 100% -> 0% scaleX over the auto-dismiss duration. We animate `transform`
 * (GPU-cheap) instead of `width` to keep it smooth. Hovering pauses the
 * countdown; mouse-leave resumes from the remaining time.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

import { onToast } from '../lib/toast'
import './ToastStack.css'

// Only one toast on screen at a time — new toasts REPLACE the old one
// rather than piling up as a vertical list. Pages that need to surface
// multiple distinct things over time can chain manually; the common
// "user clicked retry, error came back" case shouldn't paint twice.
const STACK_CAP = 1
// 4 seconds — short enough to feel snappy, long enough to read a
// one-line error. Pages can override per-call via `toast({ duration })`.
const DEFAULT_DURATION = 4000
const EXIT_MS = 240
// How long an identical message+tone is suppressed after firing.
// Prevents the same error from re-toasting on rapid re-renders.
const DEDUPE_WINDOW_MS = 1500

export function ToastStack() {
  const [toasts, setToasts] = useState([])
  // Last-fired signature + timestamp used to dedupe rapid duplicates
  // (same message + tone fired twice within DEDUPE_WINDOW_MS).
  const lastFiredRef = useRef({ key: '', at: 0 })

  useEffect(
    () =>
      onToast((e) => {
        const opts = e?.detail || {}
        if (!opts.message) return
        const tone = opts.tone || 'error'
        const message = String(opts.message)
        const dedupeKey = `${tone}::${message}`
        const now = Date.now()
        if (
          lastFiredRef.current.key === dedupeKey &&
          now - lastFiredRef.current.at < DEDUPE_WINDOW_MS
        ) {
          // Same message fired again moments ago — drop it. Common when
          // a re-render path triggers the same error effect twice.
          return
        }
        lastFiredRef.current = { key: dedupeKey, at: now }

        const id = `${now}-${Math.random().toString(36).slice(2, 8)}`
        const duration = typeof opts.duration === 'number' ? opts.duration : DEFAULT_DURATION
        const next = {
          id,
          tone,
          title: opts.title || '',
          message,
          code: opts.code || '',
          duration,
          action: opts.action || '',
          onAction: typeof opts.onAction === 'function' ? opts.onAction : null,
          createdAt: now,
          closing: false,
        }
        setToasts((prev) => {
          // STACK_CAP === 1 → the new toast REPLACES whatever's on
          // screen instead of piling up. The replaced one mounts/
          // unmounts cleanly because of the keyed list render below.
          const merged = [next, ...prev]
          return merged.slice(0, STACK_CAP)
        })
      }),
    []
  )

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)))
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, EXIT_MS)
  }, [])

  if (typeof document === 'undefined') return null
  if (toasts.length === 0) return null

  return createPortal(
    <div
      className="toast-stack"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body
  )
}

function ToastCard({ toast: t, onDismiss }) {
  const barRef = useRef(null)
  const timerRef = useRef(null)
  const remainingRef = useRef(t.duration)
  const startedAtRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [entered, setEntered] = useState(false)

  // Trigger enter animation on next frame so the initial render has the
  // pre-enter transform, and the next frame transitions to the resting state.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Drive the auto-dismiss timer + progress-bar animation. Setup runs
  // ONLY when not paused — pause is handled separately by the mouseenter
  // handler (which freezes the bar in place + clears the timer).
  // Without that gate, hovering the toast was resetting the bar back to
  // 100% and re-arming a fresh 4-second timer.
  useEffect(() => {
    if (t.duration <= 0) return undefined
    if (paused) return undefined
    const bar = barRef.current
    if (!bar) return undefined

    // Start the bar from its current scale (full on first run, frozen
    // partial on resume) and animate it down to 0 over the remaining time.
    const remaining = remainingRef.current
    if (remaining <= 0) {
      onDismiss()
      return undefined
    }
    // Read the current scale so resume continues from where pause left off.
    const startScale = (() => {
      const live = window.getComputedStyle(bar).transform
      if (!live || live === 'none') return 1
      // matrix(a, b, c, d, tx, ty) — `a` is the X scale.
      const match = live.match(/matrix\(([^)]+)\)/)
      if (match) {
        const a = parseFloat(match[1].split(',')[0])
        if (!Number.isNaN(a)) return a
      }
      return 1
    })()
    bar.style.transition = 'none'
    bar.style.transform = `scaleX(${startScale})`
    void bar.offsetWidth // force reflow so the transition below actually animates.
    bar.style.transition = `transform ${remaining}ms linear`
    bar.style.transform = 'scaleX(0)'
    startedAtRef.current = Date.now()

    timerRef.current = window.setTimeout(() => {
      onDismiss()
    }, remaining)

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    // We intentionally re-run whenever `paused` flips: false→true is a
    // no-op (early return above), true→false resumes from remainingRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  const handleMouseEnter = () => {
    if (t.duration <= 0) return
    if (paused) return
    const bar = barRef.current
    if (!bar) return
    // Freeze the bar at its current visual position by reading the live
    // transform, killing the transition, and pinning it to that scale.
    const computed = window.getComputedStyle(bar).transform
    bar.style.transition = 'none'
    bar.style.transform = computed === 'none' ? 'scaleX(1)' : computed
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const elapsed = Date.now() - startedAtRef.current
    remainingRef.current = Math.max(0, remainingRef.current - elapsed)
    setPaused(true)
  }

  const handleMouseLeave = () => {
    if (t.duration <= 0) return
    if (!paused) return
    setPaused(false)
  }

  const handleAction = () => {
    try {
      t.onAction?.()
    } finally {
      onDismiss()
    }
  }

  // ── Swipe-to-dismiss ─────────────────────────────────────────────
  // Pointer-driven flick gesture. The card follows the finger along
  // both axes; on release we measure the dominant direction:
  //   - released past the up/right threshold (or with enough velocity)
  //     → animate off-screen in that direction and dismiss
  //   - otherwise snap back to centre.
  // Uses native pointer events so mouse, touch, and pen all work with
  // one handler. Action buttons + close stop propagation so they don't
  // hijack the swipe.
  const cardRef = useRef(null)
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTime: 0,
    dx: 0,
    dy: 0,
  })
  const [dragging, setDragging] = useState(false)

  const SWIPE_DISTANCE_PX = 70
  const SWIPE_VELOCITY = 0.6 // px / ms

  const beginSwipeOut = (direction) => {
    const card = cardRef.current
    if (!card) {
      onDismiss()
      return
    }
    // Animate the existing inline transform out to the chosen edge.
    // (Inline styles win over any CSS exit class, so we drive the exit
    // here directly rather than handing off to a class.) The parent's
    // `dismiss()` keeps the row in state for EXIT_MS so this animation
    // has time to play before the component unmounts.
    card.style.transition = 'transform 220ms cubic-bezier(0.4, 0, 1, 1), opacity 180ms ease-in'
    card.style.opacity = '0'
    card.style.transform =
      direction === 'right'
        ? 'translate3d(120%, 0, 0) scale(0.98)'
        : 'translate3d(0, -64px, 0) scale(0.98)'
    setDragging(false)
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    onDismiss()
  }

  const handlePointerDown = (e) => {
    // Ignore non-primary buttons + clicks on action / close buttons.
    if (e.button !== undefined && e.button !== 0) return
    const target = e.target
    if (target?.closest?.('button')) return
    const card = cardRef.current
    if (!card) return
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      dx: 0,
      dy: 0,
    }
    try {
      card.setPointerCapture?.(e.pointerId)
    } catch {
      /* some browsers throw if capture isn't available — ignore */
    }
    setDragging(true)
    // Pause the auto-dismiss timer while dragging.
    if (!paused && t.duration > 0) {
      const bar = barRef.current
      if (bar) {
        const computed = window.getComputedStyle(bar).transform
        bar.style.transition = 'none'
        bar.style.transform = computed === 'none' ? 'scaleX(1)' : computed
      }
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const elapsed = Date.now() - startedAtRef.current
      remainingRef.current = Math.max(0, remainingRef.current - elapsed)
      setPaused(true)
    }
  }

  const handlePointerMove = (e) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== e.pointerId) return
    const card = cardRef.current
    if (!card) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    drag.dx = dx
    drag.dy = dy
    // Allow free drag right (positive X) and up (negative Y); resist the
    // opposite directions so the card doesn't fly into the screen.
    const constrainedX = dx > 0 ? dx : dx * 0.25
    const constrainedY = dy < 0 ? dy : dy * 0.25
    card.style.transition = 'none'
    card.style.transform = `translate3d(${constrainedX}px, ${constrainedY}px, 0)`
    // Fade with distance (max 60% transparency at the threshold).
    const distance = Math.hypot(constrainedX, constrainedY)
    const fade = Math.min(distance / (SWIPE_DISTANCE_PX * 1.4), 0.6)
    card.style.opacity = String(1 - fade)
  }

  const handlePointerUp = (e) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== e.pointerId) return
    drag.active = false
    const card = cardRef.current
    if (!card) return
    try {
      card.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    const elapsed = Math.max(1, Date.now() - drag.startTime)
    const vx = drag.dx / elapsed
    const vy = drag.dy / elapsed
    // Decide: swipe right, swipe up, or snap back.
    const swipeRight = drag.dx > SWIPE_DISTANCE_PX || vx > SWIPE_VELOCITY
    const swipeUp = drag.dy < -SWIPE_DISTANCE_PX || vy < -SWIPE_VELOCITY
    if (swipeRight && drag.dx >= Math.abs(drag.dy)) {
      beginSwipeOut('right')
      return
    }
    if (swipeUp) {
      beginSwipeOut('up')
      return
    }
    // Snap back.
    card.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out'
    card.style.transform = ''
    card.style.opacity = ''
    setDragging(false)
    // Resume the timer.
    setPaused(false)
  }

  const cls = [
    'toast-card',
    `toast-card--${t.tone}`,
    entered && !t.closing ? 'toast-card--in' : '',
    t.closing ? 'toast-card--out' : '',
    dragging ? 'toast-card--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={cardRef}
      className={cls}
      role={t.tone === 'error' || t.tone === 'warning' ? 'alert' : 'status'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="toast-card__body">
        <div className="toast-card__text">
          {t.title ? <div className="toast-card__title">{t.title}</div> : null}
          <div className="toast-card__message">{t.message}</div>
          {t.code ? <div className="toast-card__code">{t.code}</div> : null}
        </div>
        {t.action ? (
          <button type="button" className="toast-card__action" onClick={handleAction}>
            {t.action}
          </button>
        ) : null}
        <button
          type="button"
          className="toast-card__close"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden>
            <path
              d="M2 2 L12 12 M12 2 L2 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>
      {t.duration > 0 ? (
        <div className="toast-card__progress" aria-hidden>
          <div ref={barRef} className="toast-card__progress-bar" />
        </div>
      ) : null}
    </div>
  )
}
