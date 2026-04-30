/**
 * ScorePill — compact glass badge that displays the AI quality score
 * (or its loading / error state) on top of a thumbnail card.
 *
 * Three visual states, all keyed off the same tier-colour CSS variable
 * (`--score-tier-color`) so the pill stays a single uniform shape and
 * only the accent flips:
 *
 *   loading  → faint violet pulse + "Scoring…" label
 *   ready    → coloured status dot + the score number
 *   error    → red outline + circular retry button
 *
 * The component is presentational only — score / loading / error are
 * passed in as props by whichever caller owns the rating query (right
 * now that's `ThumbnailBatchCard`'s `useThumbnailRatingQuery`).
 */

import { memo, useCallback } from 'react'
import { RefreshCw as LucideRefreshCw } from 'lucide-react'

import './ScorePill.css'

/**
 * Map a raw 0-100 score into one of three tiers. Thresholds mirror the
 * backend's letter-grade buckets so the pill colour matches the tier
 * shown elsewhere in the app (analyze panel, rating tooltips).
 */
export function getScoreTier(score) {
  if (score == null) return null
  const n = Number(score)
  if (Number.isNaN(n)) return null
  if (n >= 85) return 'high'
  if (n >= 60) return 'medium'
  return 'low'
}

const TIER_LABEL = {
  high: 'Strong score',
  medium: 'Solid score',
  low: 'Needs work',
}

function ScorePillBase({ score, loading = false, error = null, onRetry }) {
  const handleStop = useCallback((e) => {
    e.stopPropagation()
  }, [])

  // Error state — clickable retry, replaces the score number.
  if (error) {
    const handleRetry = (e) => {
      e.stopPropagation()
      onRetry?.()
    }
    return (
      <div
        className="score-pill score-pill--error"
        title={error}
        role="button"
        tabIndex={0}
        onClick={handleRetry}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleRetry(e)
          }
        }}
        aria-label="Score failed — retry"
      >
        <LucideRefreshCw className="score-pill__retry-icon" strokeWidth={2.4} aria-hidden="true" />
        <span className="score-pill__label">Retry</span>
      </div>
    )
  }

  // Loading — subtle pulse + label, no number yet.
  if (loading) {
    return (
      <div
        className="score-pill score-pill--loading"
        aria-busy="true"
        aria-label="Scoring thumbnail"
        onClick={handleStop}
        onKeyDown={handleStop}
      >
        <span className="score-pill__dot score-pill__dot--pulse" aria-hidden="true" />
        <span className="score-pill__label">Scoring</span>
      </div>
    )
  }

  // Score ready — tier-coloured dot + the rounded number.
  if (score == null) return null
  const tier = getScoreTier(score)
  if (!tier) return null
  return (
    <div
      className={`score-pill score-pill--${tier}`}
      title={TIER_LABEL[tier]}
      onClick={handleStop}
      onKeyDown={handleStop}
    >
      <span className="score-pill__dot" aria-hidden="true" />
      <span className="score-pill__num">{Math.round(Number(score))}</span>
    </div>
  )
}

export const ScorePill = memo(ScorePillBase)
