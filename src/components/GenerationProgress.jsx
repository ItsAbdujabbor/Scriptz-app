/**
 * GenerationProgress — premium AI / YouTube-style loading indicator.
 *
 * Single bar + integer percentage. No text labels. No dots. The fill
 * eases in fast, then slows asymptotically toward ~92 % so the user
 * sees real movement early but the bar never hits 100 % before the
 * parent clears it. When the parent unmounts the component (or sets
 * `done`) the bar snaps to 100 % and the wrapper fades out.
 *
 * The animation is **decoupled from the backend** — we have no real
 * progress signal. This is a confidence-building animation, tuned per
 * estimated path duration via `estimatedDurationMs`.
 *
 * Defaults:
 *   - 25 000 ms for a single thumbnail
 *   - 35 000 ms for a batch (caller should pass it explicitly)
 *
 * Implementation notes:
 *   - The fill uses transform: scaleX (compositor-only, 60 fps).
 *   - rAF tween, so the % counter and the bar fill always agree.
 *   - prefers-reduced-motion: skip shimmer, switch to a linear (slightly
 *     faster) tween. Bar still fills, just no easing curve.
 */

import { useEffect, useRef, useState } from 'react'

import './GenerationProgress.css'

/** Asymptotic ease toward ~92 %, then snap-finish on done.
 *  t in [0, 1] → progress in [0, ~0.92]. The constant 2.4 controls how
 *  hard it brakes — bigger = faster early, slower late. */
function asymptoticEase(t) {
  // 1 - e^(-k*t) reaches ~0.92 at t=1 when k=2.55.
  const k = 2.55
  const v = 1 - Math.exp(-k * Math.max(0, Math.min(1, t)))
  // Clamp the ceiling to 0.92 so we never accidentally race past 92.
  return Math.min(0.92, (v / (1 - Math.exp(-k))) * 0.92)
}

export default function GenerationProgress({
  estimatedDurationMs = 25000,
  done = false,
  className = '',
}) {
  const [pct, setPct] = useState(0)
  const [fadingOut, setFadingOut] = useState(false)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const doneRef = useRef(false)

  // Honour prefers-reduced-motion. Read once on mount — this should never
  // change mid-loading and we don't want a layout effect on every render.
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    doneRef.current = false
    // Reset visual state when the component remounts or the duration
    // changes — these setStates only fire once per generation session,
    // not in a loop, so the cascading-render concern doesn't apply.
    /* eslint-disable react-hooks/set-state-in-effect */
    setFadingOut(false)
    setPct(0)
    /* eslint-enable react-hooks/set-state-in-effect */
    startRef.current = performance.now()

    const tick = (now) => {
      if (doneRef.current) return
      const elapsed = now - startRef.current
      const t = Math.max(0, Math.min(1, elapsed / estimatedDurationMs))
      const v = reducedMotion.current
        ? // Linear, slightly faster, still capped at 0.92.
          Math.min(0.92, t * 1.1)
        : asymptoticEase(t)
      setPct(Math.round(v * 100))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [estimatedDurationMs])

  // Snap to 100 % when the parent signals completion, then fade out.
  useEffect(() => {
    if (!done) return
    doneRef.current = true
    cancelAnimationFrame(rafRef.current)
    // Intentional snap-to-100 on completion signal. Only fires once per
    // generation, so cascading-render concern doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
