import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, Clock, Users } from 'lucide-react'
import './FailedGenerationCard.css'

/**
 * Inline error rendered in the thumbnail chat thread when a generation
 * request fails. Same 16:9 stage shape as the success thumbnail and the
 * loader, so the loader → failure transition is layout-stable.
 *
 * Variant is derived from the error code:
 *   • 'rate-limited' — PROVIDER_BUSY / PROVIDER_RATE_LIMITED. Clock icon,
 *                      live countdown, "taking longer than usual" copy.
 *   • 'queued'       — HIGH_DEMAND / QUEUE_FULL. Users icon, queue copy.
 *   • 'error'        — anything else. Alert icon, generic failure copy.
 */
const RATE_LIMITED_CODES = new Set(['PROVIDER_BUSY', 'PROVIDER_RATE_LIMITED'])
const QUEUED_CODES = new Set(['HIGH_DEMAND', 'QUEUE_FULL', 'queue_full'])

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
  if (variant === 'rate-limited') return 'Generation taking longer than usual'
  if (variant === 'queued') return 'High demand — generation delayed'
  return 'Generation failed'
}

/**
 * Live countdown that ticks once per second from `seconds` to 0.
 * Renders nothing when seconds <= 0 or undefined.
 */
function Countdown({ seconds }) {
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

export default function FailedGenerationCard({ entry, onRetry }) {
  const variant = variantOf(entry?.errorCode)
  const retryable = !!entry?.retryable
  const mode = entry?.mode || 'prompt'
  const compact = mode === 'titles'
  // Analyze/recreate/edit always have a source image the user uploaded
  // or pointed at. Preserving it on the failure card matters for two
  // reasons:
  //   1. The image used to "vanish" — failing analyze removed the
  //      thumbnail from the chat entirely, which felt like data loss.
  //   2. Retrying without the image visible is disorienting — the user
  //      isn't sure which thumbnail they're retrying against.
  // Backend wires `user_image_url` onto the failure message (preserved
  // even when the analyze service raised before persisting the rating)
  // and the parent maps it to `entry.userImageUrl`.
  const userImageUrl = entry?.userImageUrl || null

  return (
    <div
      className={`thumb-failed-card thumb-failed-card--${variant}${compact ? ' thumb-failed-card--compact' : ''}${
        userImageUrl ? ' thumb-failed-card--with-image' : ''
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className="thumb-failed-card__stage">
        {userImageUrl ? (
          <img
            src={userImageUrl}
            alt=""
            className="thumb-failed-card__user-image"
            decoding="async"
            aria-hidden="true"
          />
        ) : null}
        <div className="thumb-failed-card__stage-glow" aria-hidden="true" />
        <div className="thumb-failed-card__stage-content">
          <div className="thumb-failed-card__icon" aria-hidden="true">
            <VariantIcon variant={variant} />
          </div>
          <div className="thumb-failed-card__title">{variantTitle(variant)}</div>
          <div className="thumb-failed-card__msg">{entry?.errorMessage}</div>
          <Countdown seconds={entry?.retryAfterSeconds} />
        </div>
        {retryable ? (
          <div className="thumb-failed-card__actions">
            <button
              type="button"
              className="thumb-failed-card__btn thumb-failed-card__btn--primary"
              onClick={() => onRetry?.(entry)}
            >
              <RefreshCw size={14} aria-hidden="true" />
              <span>Try again</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
