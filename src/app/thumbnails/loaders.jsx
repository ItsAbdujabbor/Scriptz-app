import { memo, useState, useRef, useEffect, useLayoutEffect } from 'react'

/**
 * SmoothHint — sibling overlay used as a fading placeholder over the
 * Recreate / Analyze / Edit inputs. Visible while the field is empty;
 * fades to opacity 0 the moment the user types or pastes anything,
 * mirroring the prompt-tab animated hint's behaviour. Set `variant` to
 * `textarea` for top-aligned hints (multi-line composer inputs) or
 * `url` for the centred pill-shaped URL inputs.
 */
export function SmoothHint({ visible, variant = 'textarea', children }) {
  return (
    <span
      className={`smooth-hint smooth-hint--${variant} ${visible ? '' : 'is-hidden'}`}
      aria-hidden
    >
      {children}
    </span>
  )
}

export function SmoothHeight({ children, className = '' }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return undefined
    const apply = () => {
      const h = inner.scrollHeight
      if (outer.style.height !== `${h}px`) outer.style.height = `${h}px`
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(apply)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={outerRef}
      className={`thumb-smooth-height ${className}`}
      style={{ overflow: 'hidden' }}
    >
      <div ref={innerRef}>{children}</div>
    </div>
  )
}

/**
 * Card-filling progress for the pending-thumbnail slot. Whole card grows
 * left → right in a bright purple → pink gradient with a centred
 * percentage overlay. rAF-driven asymptotic ease toward ~92 %, then snaps
 * to 100 % when the parent flips `done`. No real backend signal — this is
 * a confidence-building animation calibrated by `estimatedDurationMs`.
 *
 * Memoised so unrelated parent re-renders during generation don't reset
 * the rAF loop or jump the percentage backward.
 */
export const ThumbnailGenFill = memo(function ThumbnailGenFill({
  estimatedDurationMs = 25000,
  done = false,
}) {
  const [pct, setPct] = useState(0)
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const doneRef = useRef(false)
  // Lock the duration at first mount. If the parent re-renders with a
  // different value (e.g. message object updated while job is in flight),
  // we must NOT restart the animation — that's exactly what causes the
  // percentage to jump back to 0% mid-generation.
  const lockedDurationRef = useRef(estimatedDurationMs)
  // Mirror pct in a ref so the `done` effect can read the *current*
  // pct without depending on it (avoids effect re-runs on every frame).
  const pctRef = useRef(0)
  useEffect(() => {
    pctRef.current = pct
  }, [pct])

  // Monotone-rising clamp. Every frame writes Math.max(prev, target)
  // so the bar can never visually rewind, even when the backend
  // reports a stale lower number or the curve formula transitions
  // between phases.
  const maxReachedRef = useRef(0)

  // Per-instance jitter — every generation feels slightly different
  // (ChatGPT / Claude style). The randomness is captured once at
  // mount and stays constant for the lifetime of the loader. Without
  // this, two batches of the same size paced identically; with it,
  // each generation has its own slight rhythm.
  const [jitter] = useState(() => {
    const rand = () => Math.random() - 0.5 // [-0.5, +0.5]
    return {
      // Phase 1 curve steepness — controls how quickly the bar
      // approaches 0.92. Default 2.55 ± ~10 %.
      k1: 2.55 * (1 + rand() * 0.2),
      // Phase 2 creep speed — slow asymptote 0.92 → 0.99. Lower
      // value = lazier creep. Default 0.45 ± ~25 %.
      k2: 0.45 * (1 + rand() * 0.5),
      // Per-instance duration fuzz — stretches or compresses the
      // estimated runtime by up to ±8 %. Both batches of the same
      // size now reach milestones at slightly different times.
      fuzz: 1 + rand() * 0.16,
    }
  })

  // Pure time-based asymptotic curve — identical motion to the
  // persona/character loader (PersonaGenLoader). We deliberately do
  // NOT merge live backend progress: discrete SSE updates made the
  // bar/percentage snap forward in jumps, which is exactly the
  // "not smooth" feel. The character generator never did this and
  // glides perfectly, so the thumbnail loader now mirrors it.

  useEffect(() => {
    doneRef.current = false
    maxReachedRef.current = 0

    setPct(0)

    startRef.current = performance.now()

    const { k1, k2, fuzz } = jitter
    const effectiveDuration = Math.max(2000, lockedDurationRef.current * fuzz)

    const tick = (now) => {
      if (doneRef.current) return
      const elapsed = now - startRef.current
      const t = elapsed / effectiveDuration

      let curve
      if (t <= 1) {
        // Phase 1: 0 → ~0.92 over [0, effectiveDuration]. Asymptotic
        // ease — fast early, slows naturally as it approaches 92 %.
        curve = ((1 - Math.exp(-k1 * t)) / (1 - Math.exp(-k1))) * 0.92
      } else {
        // Phase 2: 0.92 → 0.99 over the next ``effectiveDuration * 3``
        // (so a 25 s estimate gives ~75 s of slow creep before
        // maxing out near 99 %). This is the "never freezes" fix —
        // even if generation runs 3× longer than expected, the bar
        // keeps moving at ~1 %/15 s of natural creep instead of
        // sitting frozen at 92 %.
        const t2 = Math.min(1, (t - 1) / 3)
        curve = 0.92 + 0.07 * (1 - Math.exp(-k2 * t2))
      }

      // Monotone clamp — the displayed percentage can only ever go
      // UP. Belt-and-suspenders for the phase-1 → phase-2 transition.
      const next = Math.max(maxReachedRef.current, curve)
      maxReachedRef.current = next

      setPct(Math.round(next * 100))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // NOTE: ``livePctValue`` deliberately NOT in deps. See the
    // ``livePctRef`` block above for why.
    // NOTE: deps are intentionally empty — duration is locked via
    // ``lockedDurationRef`` at mount so parent re-renders (e.g. from
    // SSE events updating the message object) never restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On `done` flip, the parent's `finishLoading` now drops
  // `pendingAssistant` immediately (single-frame swap with the result
  // card) so this branch effectively never plays — the article is
  // unmounted on the same commit. Kept for safety: if a future caller
  // sets `done` without unmounting, the bar still tweens to 100 over
  // ~280 ms instead of snapping.
  useEffect(() => {
    if (!done) return
    doneRef.current = true
    cancelAnimationFrame(rafRef.current)

    const startPct = pctRef.current
    if (startPct >= 100) return // already at 100, nothing to animate

    const startTime = performance.now()
    const duration = 280

    const animate = (now) => {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOut cubic — matches PersonaGenLoader
      const next = Math.round(startPct + (100 - startPct) * eased)
      // Set-state-in-effect is intentional — fires only once per
      // generation completion, no cascading-render risk.

      setPct(next)
      if (t < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [done])

  return (
    <div
      className="thumb-gen-fill"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-busy={!done}
    >
      <div className="thumb-gen-fill__bar" style={{ width: `${pct}%` }}>
        <span className="thumb-gen-fill__sheen" aria-hidden="true" />
      </div>
      <div className="thumb-gen-fill__pct">
        {pct}
        <span className="thumb-gen-fill__pct-sign">%</span>
      </div>
    </div>
  )
})

/**
 * Pending-state loader for analyze mode. Cinematic + minimal:
 *
 *   * The user's thumbnail sits behind a soft violet sheen so it
 *     feels "intelligent" without going dark.
 *   * A vertical scan ribbon sweeps top → bottom on a slow loop.
 *   * A small bottom-corner pulse indicator (3 dots cycling) signals
 *     activity. NO rotating phase text, NO percentage, NO "Analyzing
 *     visuals…" copy. The motion alone reads as alive.
 *
 * Sized to the same 16:9 stage as the eventual `<AnalysisBreakdown>`
 * card so the in-place crossfade in `ChatMessageItem` never reflows.
 *
 * (`memo` because the parent re-renders on every keystroke in the
 * composer; the loader has no props that change inside one
 * generation, so memo skips re-renders entirely.)
 */
export const ThumbnailAnalyzeLoader = memo(function ThumbnailAnalyzeLoader({ imageUrl }) {
  return (
    <div className="thumb-analyze-loader" aria-busy="true" aria-label="Analyzing thumbnail">
      <div className="thumb-analyze-loader__stage">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="thumb-analyze-loader__img"
            decoding="async"
            aria-hidden="true"
          />
        ) : null}
        <div className="thumb-analyze-loader__sheen" aria-hidden="true" />
        <div className="thumb-analyze-loader__scan" aria-hidden="true" />
        <div className="thumb-analyze-loader__pulse" aria-hidden="true">
          <span className="thumb-analyze-loader__pulse-dot" />
          <span className="thumb-analyze-loader__pulse-dot" />
          <span className="thumb-analyze-loader__pulse-dot" />
        </div>
      </div>
    </div>
  )
})

/**
 * AnalyzeLoaderCard — cinematic in-place loader for analyze mode.
 *
 * Renders using the SAME outer DOM chain as `ThumbnailBatchCard`
 * (`.thumb-msg-grid-wrap > .thumb-batch-grid > .thumb-batch-card-wrap
 * > .thumb-batch-card > .thumb-batch-card-inner > .thumb-batch-img-wrap`)
 * so the loader sits in the identical position + dimensions as the
 * eventual `ThumbnailImageBlock`. The crossfade in `ChatMessageItem`
 * swaps them inside a single `AnimatePresence` slot — visually the
 * image stays put, the scan overlays fade out, the action toolbar
 * fades in.
 *
 * Scan effects (CSS-driven, no per-frame React work):
 *   • Subtle violet grid that breathes
 *   • Vertical scan beam that sweeps top → bottom on a 2.6s loop
 *   • Four camera-focus corner brackets pulsing in staggered sequence
 *   • Soft radial halo that breathes from the centre
 *   • Three status dots cycling in a glass pill at the bottom centre
 *
 * All overlays sit inside `.thumb-batch-img-wrap`, which has
 * `overflow: hidden`, so animations are clipped to the rounded
 * thumbnail frame.
 */
export const AnalyzeLoaderCard = memo(function AnalyzeLoaderCard({ imageUrl }) {
  return (
    <div className="thumb-msg-grid-wrap coach-stream-block">
      <div className="thumb-batch-grid">
        <div className="thumb-batch-card-wrap" data-thumb-slot={0}>
          <div className="thumb-batch-card">
            <div className="thumb-batch-card-inner">
              <div
                className="thumb-batch-img-wrap thumb-analyze-stage"
                aria-busy="true"
                aria-label="Analyzing thumbnail"
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="thumb-batch-img"
                    decoding="async"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="thumb-analyze-stage__grid" aria-hidden="true" />
                <div className="thumb-analyze-stage__halo" aria-hidden="true" />
                <div className="thumb-analyze-stage__scan-beam" aria-hidden="true" />
                <div className="thumb-analyze-stage__corners" aria-hidden="true">
                  <span className="thumb-analyze-corner thumb-analyze-corner--tl" />
                  <span className="thumb-analyze-corner thumb-analyze-corner--tr" />
                  <span className="thumb-analyze-corner thumb-analyze-corner--bl" />
                  <span className="thumb-analyze-corner thumb-analyze-corner--br" />
                </div>
                <div className="thumb-analyze-stage__status" aria-hidden="true">
                  <span className="thumb-analyze-stage__status-dot" />
                  <span className="thumb-analyze-stage__status-dot" />
                  <span className="thumb-analyze-stage__status-dot" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

/**
 * TitlesLoader — placeholder block for the Titles tab. Renders one
 * skeleton card per requested title (4 / 8 / 12) so the layout
 * matches the eventual `<TitleIdeasBlock>` exactly — no jump when
 * results arrive. Each card stagger-fades in and shimmers a
 * pulsing gradient across the title + reasoning placeholders. No
 * percentage text, no progress bar — the shimmer alone reads as
 * "thinking" and keeps the surface calm.
 */
const GEN_TITLE_WIDTHS = [72, 65, 78, 60, 74, 68, 56, 70, 63, 76, 58, 67]
const GEN_REASON_WIDTHS = [48, 55, 40, 52, 44, 58, 50, 38, 54, 46, 61, 42]

export const TitlesLoader = memo(function TitlesLoader({ count = 4 }) {
  const rows = Math.max(1, Math.min(count, 12))
  return (
    <div className="thumb-titles-loader" aria-busy="true" aria-label="Generating titles">
      <div className="thumb-titles-grid">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="thumb-title-card thumb-title-card--gen"
            style={{
              '--title-w': `${GEN_TITLE_WIDTHS[i % GEN_TITLE_WIDTHS.length]}%`,
              '--reason-w': `${GEN_REASON_WIDTHS[i % GEN_REASON_WIDTHS.length]}%`,
              animationDelay: `${i * 70}ms`,
            }}
            aria-hidden
          >
            <span className="thumb-title-card__index thumb-title-card__index--gen">{i + 1}</span>
            <span className="thumb-title-card__body">
              <span className="thumb-title-card__gen-line thumb-title-card__gen-line--title" />
              <span className="thumb-title-card__gen-line thumb-title-card__gen-line--reason" />
            </span>
            <span className="thumb-title-card__gen-actions">
              <span className="thumb-title-card__gen-btn" />
              <span className="thumb-title-card__gen-btn thumb-title-card__gen-btn--primary" />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})

/**
 * Staged loader hint that fades in inside the in-flight loader. Cycles
 * through honest messages based on elapsed time:
 *
 *   stage 0 (0–1.5× estimated)  : silent — normal generation window
 *   stage 1 (1.5–2.5× estimated): "Taking a moment longer than usual…"
 *                                  (only reaches here on retries / slow provider)
 *   stage 2 (2.5×+ estimated)   : "Still working on it — thanks for your patience."
 *
 * Stage 1 fires at 1.5× the estimated duration so a normal first-attempt
 * generation (which completes at or before 1× the estimate) never triggers
 * the hint. It only appears when the job is genuinely slow — i.e. on a
 * backend retry or a provider backlog that pushes past the expected window.
 */
export function ThumbnailGenSlowHint({ estimatedDurationMs }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const baseline = Math.max(0, estimatedDurationMs || 0)
    if (baseline <= 0) return undefined
    const t1 = setTimeout(() => setStage(1), baseline * 1.5)
    const t2 = setTimeout(() => setStage(2), baseline * 2.5)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [estimatedDurationMs])

  if (stage === 0) return null
  const message =
    stage === 1
      ? 'Taking a moment longer than usual — almost there.'
      : 'Still working on it — thanks for your patience.'
  return (
    <div className="thumb-gen-loader__slow-hint" role="status" aria-live="polite">
      {message}
    </div>
  )
}
