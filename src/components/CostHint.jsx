/**
 * CostHint — ultra-compact credit badge.
 *
 * Renders as a tiny icon + number chip, always visible. Meant to sit
 * inline next to (or inside) an AI action button.
 *
 *   • No "credits" text — just a zap + number.
 *   • 18px tall, same scale as a small status dot.
 *   • Full-text explanation in the hover tooltip (title / aria-label).
 *   • Unsubscribed users see nothing.
 */
import { useCostOf, useCreditsQuery } from '../queries/billing/creditsQueries'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import './CostHint.css'

function IconZap() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
    </svg>
  )
}

export function CostHint({ featureKey, count = 1, showZero = false, className = '' }) {
  const { total, unit } = useCostOf(featureKey, count)
  const { data: bal } = useCreditsQuery()
  const { isSubscribed } = usePlanEntitlements()
  const remaining = bal
    ? Number(bal.subscription_credits || 0) + Number(bal.permanent_credits || 0)
    : null

  if (!isSubscribed) return null
  if (!total && !showZero) return null

  const insufficient = remaining !== null && remaining < total
  const pretty = featureKey.replace(/_/g, ' ')
  const titleText = insufficient
    ? `You need ${total} credits but only have ${remaining}. (${unit} per ${pretty})`
    : count > 1
      ? `${total} credits total — ${unit} per ${pretty} × ${count}`
      : `${unit} credits per ${pretty}`

  return (
    <span
      className={['cost-hint', insufficient ? 'cost-hint--insufficient' : '', className]
        .filter(Boolean)
        .join(' ')}
      title={titleText}
      aria-label={titleText}
      role="note"
    >
      <span className="cost-hint-icon" aria-hidden>
        <IconZap />
      </span>
      <span className="cost-hint-num">{total}</span>
    </span>
  )
}
