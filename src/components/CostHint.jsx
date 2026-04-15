/**
 * CostHint — compact credit badge rendered next to AI action buttons.
 *
 * Usage stays the same:
 *   <CostHint featureKey="thumbnail_generate" count={numThumbnails} />
 *
 * New visual: a single pill/chip with a lightning icon and the credit number.
 * No "credits" text — the icon carries the meaning. Title attribute still gives
 * full context on hover. Goes into a subtle "insufficient" state when the
 * user's balance < total cost.
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

  // Hide entirely for unsubscribed users — they see no credit-related UI until
  // they start a trial or subscribe.
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
      className={['cost-chip', insufficient ? 'cost-chip--insufficient' : '', className]
        .filter(Boolean)
        .join(' ')}
      title={titleText}
      aria-label={titleText}
    >
      <span className="cost-chip-icon" aria-hidden>
        <IconZap />
      </span>
      <span className="cost-chip-value">{total}</span>
    </span>
  )
}
