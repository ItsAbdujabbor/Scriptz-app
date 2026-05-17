/**
 * CelebrationOverlay — centered "congrats" card + DIY confetti, triggered by
 * the `app:celebrate` window event (see `src/lib/celebrate.js`).
 *
 * Why DIY confetti (not canvas-confetti):
 *   • Zero new dependency; 20 lines of CSS-animated divs.
 *   • Only renders when celebrating; cleans up after `duration` ms.
 *   • Respects `prefers-reduced-motion`.
 *
 * The overlay is non-blocking — clicks pass through the confetti layer to
 * whatever is underneath. Only the card catches a click (to dismiss early).
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { onCelebrate } from '../lib/celebrate'
import './CelebrationOverlay.css'

/**
 * Tracks the user's `prefers-reduced-motion` setting and stays in sync
 * if they change it at runtime. When reduced motion is requested we skip
 * the confetti entirely (it's pure decoration) and still show the card.
 */
function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e) => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return prefersReduced
}

// A few pastel / premium accent colors for the confetti.
const COLORS = [
  '#a78bfa',
  '#7c3aed',
  '#c4b5fd',
  '#fbbf24',
  '#f59e0b',
  '#f472b6',
  '#34d399',
  '#60a5fa',
]

function makeConfettiPieces(count = 70) {
  const pieces = []
  for (let i = 0; i < count; i++) {
    pieces.push({
      id: i,
      left: Math.random() * 100, // vw %
      delay: Math.random() * 0.35, // s
      duration: 2.4 + Math.random() * 1.6, // s
      drift: (Math.random() - 0.5) * 40, // vw shift
      rotate: Math.random() * 720 - 360, // deg
      color: COLORS[i % COLORS.length],
      shape: Math.random() > 0.65 ? 'circle' : 'square',
      size: 6 + Math.random() * 8, // px
    })
  }
  return pieces
}

export function CelebrationOverlay() {
  const [current, setCurrent] = useState(null) // { title, subtitle, emoji, variant, duration, confetti }
  const [closing, setClosing] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(
    () =>
      onCelebrate((e) => {
        const opts = e?.detail || {}
        setClosing(false)
        setCurrent({
          title: opts.title || 'Success!',
          subtitle: opts.subtitle || '',
          emoji: opts.emoji || '🎉',
          variant: opts.variant || 'celebrate',
          duration: typeof opts.duration === 'number' ? opts.duration : 4200,
          confetti: opts.confetti !== false,
        })
      }),
    []
  )

  useEffect(() => {
    if (!current) return
    const close = setTimeout(() => setClosing(true), current.duration)
    const unmount = setTimeout(() => setCurrent(null), current.duration + 320)
    return () => {
      clearTimeout(close)
      clearTimeout(unmount)
    }
  }, [current])

  // Confetti is decorative only — suppress it when the user asked for
  // reduced motion. The congrats card itself still renders.
  const showConfetti = !!current?.confetti && !prefersReducedMotion

  const pieces = useMemo(() => (showConfetti ? makeConfettiPieces() : []), [showConfetti])

  if (!current || typeof document === 'undefined') return null

  const dismiss = () => setClosing(true)

  return createPortal(
    <div
      className={`celebrate-overlay celebrate-overlay--${current.variant} ${closing ? 'celebrate-overlay--closing' : ''}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {showConfetti && (
        <div className="celebrate-confetti" aria-hidden>
          {pieces.map((p) => (
            <span
              key={p.id}
              className={`celebrate-piece celebrate-piece--${p.shape}`}
              style={{
                left: `${p.left}%`,
                width: p.size,
                height: p.size,
                background: p.color,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                '--drift': `${p.drift}vw`,
                '--rotate': `${p.rotate}deg`,
              }}
            />
          ))}
        </div>
      )}

      <button type="button" className="celebrate-card" onClick={dismiss} aria-label="Dismiss">
        <div className="celebrate-emoji" aria-hidden>
          {current.emoji}
        </div>
        <div className="celebrate-title">{current.title}</div>
        {current.subtitle && <div className="celebrate-subtitle">{current.subtitle}</div>}
        <div className="celebrate-dismiss-hint">tap to dismiss</div>
      </button>
    </div>,
    document.body
  )
}
