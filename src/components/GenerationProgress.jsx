/**
 * GenerationProgress — premium AI / YouTube-style loading indicator.
 *
 * Single bar + integer percentage. No text labels. No dots. The fill
 * eases in fast, then slows asymptotically through a two-phase curve
 * (fast to ~92 %, slow creep to ~99 %), so the user sees real
 * movement early and the bar never freezes if generation runs long.
 * When the parent unmounts the component (or sets `done`) the bar
 * snaps to 100 % and the wrapper fades out.
 *
 * The animation is **decoupled from the backend** — when there's no
 * live progress signal it falls back to a confidence-building curve
 * tuned by `estimatedDurationMs`. When a backend signal arrives via
 * the optional ``livePct`` prop (0..1), the bar takes the MAX of the
 * curve and the live value — so it can leap forward but never
 * rewind.
 *
 * Per-instance jitter: each mount captures slightly randomised
 * curve constants so two generations never pace identically. The
 * randomness is fixed at mount time, so within one generation the
 * curve is deterministic (no per-frame noise on screen).
 *
 * Implementation notes:
 *   - The fill uses transform: scaleX (compositor-only, 60 fps).
 *   - rAF tween, so the % counter and the bar fill always agree.
 *   - Monotone-rising clamp: every frame writes Math.max(prev,
 *     target), so the bar can never visually rewind.
 *   - prefers-reduced-motion: skip shimmer, switch to a linear (slightly
 *     faster) tween. Bar still fills, just no easing curve.
 */

import { useEffect, useRef, useState } from 'react'

import './GenerationProgress.css'

/** Two-phase asymptotic curve.
 *
 *  Phase 1 (t ≤ 1, normalised against effectiveDuration):
 *    0 → 0.92, sharp asymptote — fast early, naturally slows near 92 %.
 *
 *  Phase 2 (t > 1): 0.92 → 0.99 over the next ``effectiveDuration * 3``
 *    so a 25 s estimate gives 75 s of slow creep past 92 %. This is
 *    the "never freezes" guarantee — even if generation runs 3× longer
 *    than expected, the bar keeps moving at ~1 %/15 s of natural
 *    creep instead of sitting stuck at 92.
 */
function progressCurve(t, k1, k2) {
  if (t <= 1) {
    return ((1 - Math.exp(-k1 * Math.max(0, t))) / (1 - Math.exp(-k1))) * 0.92
  }
  const t2 = Math.min(1, (t - 1) / 3)
  return 0.92 + 0.07 * (1 - Math.exp(-k2 * t2))
}

export default function GenerationProgress({
  estimatedDurationMs = 25000,
  done = false,
  className = '',
  /** Optional live progress signal in [0, 1] from a backend channel.
   *  When set, the bar takes the max of (curve, live) every frame —
   *  so backend reports leap the bar forward but never rewind. */
  livePct = null,
}) {
  const [pct, setPct] = useState(0)
  const [fadingOut, setFadingOut] = useState(false)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const doneRef = useRef(false)
  const maxReachedRef = useRef(0)

  // Honour prefers-reduced-motion. Read once on mount — this should never
  // change mid-loading and we don't want a layout effect on every render.
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Per-instance jitter — captured ONCE at mount via useState's
  // initializer (which React permits to be impure, unlike render-time
  // ref initialization). Two generations never pace identically; the
  // values stay constant for the lifetime of this mount so within
  // one generation the curve is smooth and deterministic.
  const [jitter] = useState(() => {
    const rand = () => Math.random() - 0.5
    return {
      k1: 2.55 * (1 + rand() * 0.2), // phase-1 steepness ±10 %
      k2: 0.45 * (1 + rand() * 0.5), // phase-2 creep speed ±25 %
      fuzz: 1 + rand() * 0.16, // effective-duration ±8 %
    }
  })

  // Read latest livePct via a ref so updates don't reset the rAF
  // loop. The ref is synced via a separate useEffect (not during
  // render — react-hooks/refs forbids that).
  const livePctRef = useRef(livePct)
  useEffect(() => {
    livePctRef.current = livePct
  }, [livePct])

  useEffect(() => {
    doneRef.current = false
    maxReachedRef.current = 0

    setFadingOut(false)
    setPct(0)

    startRef.current = performance.now()

    const { k1, k2, fuzz } = jitter
    const effectiveDuration = Math.max(2000, estimatedDurationMs * fuzz)

    const tick = (now) => {
      if (doneRef.current) return
      const elapsed = now - startRef.current
      const t = elapsed / effectiveDuration

      const curve = reducedMotion.current
        ? // Linear, slightly faster, still capped at 0.92 in phase 1
          // then matches the standard phase-2 creep.
          t <= 1
          ? Math.min(0.92, t * 1.1)
          : progressCurve(t, k1, k2)
        : progressCurve(t, k1, k2)

      const live = livePctRef.current
      const target = live != null ? Math.max(curve, live) : curve

      // Monotone-rising clamp — the bar can only ever advance.
      const next = Math.max(maxReachedRef.current, target)
      maxReachedRef.current = next

      setPct(Math.round(next * 100))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // NOTE: ``livePct`` deliberately NOT in deps; read via ref.
  }, [estimatedDurationMs])

  // Snap to 100 % when the parent signals completion, then fade out.
  useEffect(() => {
    if (!done) return
    doneRef.current = true
    cancelAnimationFrame(rafRef.current)
    // Intentional snap-to-100 on completion signal. Only fires once per
    // generation, so cascading-render concern doesn't apply.

    setPct(100)
    const t = setTimeout(() => setFadingOut(true), 220)
    return () => clearTimeout(t)
  }, [done])

  return (
    <div
      className={`gen-progress ${fadingOut ? 'gen-progress--fade' : ''} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-busy={!done}
    >
      <div className="gen-progress__bar">
        <div className="gen-progress__fill" style={{ transform: `scaleX(${pct / 100})` }}>
          <span className="gen-progress__shimmer" aria-hidden="true" />
        </div>
      </div>
      <span className="gen-progress__pct" aria-hidden="true">
        {pct}
        <span className="gen-progress__pct-sign">%</span>
      </span>
    </div>
  )
}
