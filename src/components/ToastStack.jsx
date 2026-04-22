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

const STACK_CAP = 4
const DEFAULT_DURATION = 6000
const EXIT_MS = 200

export function ToastStack() {
  const [toasts, setToasts] = useState([])

  useEffect(
    () =>
      onToast((e) => {
        const opts = e?.detail || {}
        if (!opts.message) return
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const duration = typeof opts.duration === 'number' ? opts.duration : DEFAULT_DURATION
        const next = {
          id,
          tone: opts.tone || 'error',
          title: opts.title || '',
          message: String(opts.message),
          code: opts.code || '',
          duration,
          action: opts.action || '',
          onAction: typeof opts.onAction === 'function' ? opts.onAction : null,
          createdAt: Date.now(),
          closing: false,
        }
        setToasts((prev) => {
          // Newest on top; cap the stack — drop the oldest (last in array).
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

  // Drive the auto-dismiss timer + progress-bar animation.
  useEffect(() => {
    if (t.duration <= 0) return undefined
    const bar = barRef.current
    if (!bar) return undefined

    // Start: bar at full width, then transition to 0 over the remaining time.
    bar.style.transition = 'none'
    bar.style.transform = 'scaleX(1)'
    // Force reflow so the next style change actually animates from scaleX(1).
    void bar.offsetWidth
    bar.style.transition = `transform ${remainingRef.current}ms linear`
    bar.style.transform = 'scaleX(0)'
    startedAtRef.current = Date.now()

    timerRef.current = window.setTimeout(() => {
      onDismiss()
    }, remainingRef.current)

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    // We intentionally re-run whenever `paused` flips: the pause branch below
    // freezes the bar; the resume branch (this branch) re-arms the timer with
    // the recomputed remainingRef.
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

  const cls = [
    'toast-card',
    `toast-card--${t.tone}`,
    entered && !t.closing ? 'toast-card--in' : '',
    t.closing ? 'toast-card--out' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      role={t.tone === 'error' || t.tone === 'warning' ? 'alert' : 'status'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
