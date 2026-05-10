import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, X, Clock, Users } from 'lucide-react'
import './FailedGenerationCard.css'

/**
 * Inline error rendered in the thumbnail chat thread when a generation
 * request fails. Same 16:9 stage shape as the success thumbnail and the
 * loader, so the loader → failure transition is layout-stable.
 *
 * Variant is derived from the error code:
 *   • 'rate-limited'  — PROVIDER_BUSY (RPM bucket empty). Amber-blue
 *                       gradient, clock icon, live countdown.
 *   • 'queued'        — HIGH_DEMAND (queue full). Amber gradient, queue
 *                       icon, "we're slammed, try again in N seconds".
 *   • 'error'         — anything else. Soft red, alert icon.
 *
 * `entry.attempt` / `entry.maxAttempts` are surfaced in a small subtitle
 * line so users can tell when a transient retry burst was actually
 * attempted ("we tried 4 times over 16s") vs an immediate hard failure.
 */
const RATE_LIMITED_CODES = new Set(['PROVIDER_BUSY', 'PROVIDER_RATE_LIMITED'])
const QUEUED_CODES = new Set(['HIGH_DEMAND'])

function variantOf(code) {
  if (RATE_LIMITED_CODES.has(code)) return 'rate-limited'
  if (QUEUED_CODES.has(code)) return 'queued'
  return 'error'
}

function VariantIcon({ variant }) {
  if (variant === 'rate-limited') return <Clock size={28} strokeWidth={2.2} />
  if (variant === 'queued') return <Users size={28} strokeWidth={2.2} />
  return <AlertTriangle size={28} strokeWidth={2.2} />
}

function variantTitle(variant) {
  if (variant === 'rate-limited') return "We're a bit busy right now"
  if (variant === 'queued') return 'High demand right now'
  return "We couldn't generate this one"
}

/**
 * Live countdown that ticks once per second from `seconds` to 0.
 * Renders nothing when seconds <= 0 or undefined.
 */
function Countdown({ seconds }) {
  // Per failed-attempt entry the `seconds` prop never changes after the
  // initial failure event is created, so a single useState init is
  // enough — no need for a re-sync effect when the prop "changes".
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor(seconds || 0)))
  useEffect(() => {
    if (remaining <= 0) return undefined
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [remaining])
  if (!remaining || remaining <= 0) return null
  return (
    <span className="thumb-failed-card__countdown" aria-live="polite">
      Retry available in {remaining}s
    </span>
  )
}

export default function FailedGenerationCard({ entry, onRetry, onDismiss }) {
  const variant = variantOf(entry?.errorCode)
  const retryable = !!entry?.retryable
  const attempt = entry?.attempt
  const maxAttempts = entry?.maxAttempts
  const showAttemptInfo = !!(attempt && maxAttempts && maxAttempts > 1 && attempt >= 2)

  return (
    <div
      className={`thumb-failed-card thumb-failed-card--${variant}`}
      role="alert"
      aria-live="polite"
    >
      {/* Single visual card — message + actions both live INSIDE the
       * gradient-bordered stage so the failure reads as one cohesive
       * surface (was previously: stage held the message, actions sat
       * as a separate sibling outside the gradient frame). */}
      <div className="thumb-failed-card__stage">
        <div className="thumb-failed-card__stage-glow" aria-hidden="true" />
        <div className="thumb-failed-card__stage-content">
          <div className="thumb-failed-card__icon" aria-hidden="true">
            <VariantIcon variant={variant} />
          </div>
          <div className="thumb-failed-card__title">{variantTitle(variant)}</div>
          <div className="thumb-failed-card__msg">{entry?.errorMessage}</div>
          {showAttemptInfo ? (
            <div className="thumb-failed-card__attempt">
              We tried {attempt} time{attempt === 1 ? '' : 's'} before giving up.
            </div>
          ) : null}
          <Countdown seconds={entry?.retryAfterSeconds} />
        </div>
        <div className="thumb-failed-card__actions">
          {retryable ? (
            <button
              type="button"
              className="thumb-failed-card__btn thumb-failed-card__btn--primary"
              onClick={() => onRetry?.(entry)}
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Try again</span>
            </button>
          ) : null}
          <button
            type="button"
            className="thumb-failed-card__btn thumb-failed-card__btn--ghost"
            onClick={() => onDismiss?.(entry?.id)}
          >
            <X size={14} aria-hidden="true" />
            <span>Dismiss</span>
          </button>
        </div>
      </div>
    </div>
  )
}
