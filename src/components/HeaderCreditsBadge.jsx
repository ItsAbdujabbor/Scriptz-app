/**
 * HeaderCreditsBadge — a single premium pill that combines the live
 * credit balance with the user's plan tier in one cohesive card. Sits
 * in the top-right of the thumbnail screen.
 *
 * Layout: [⚡ icon][2,484][·][STARTER] — all in one rounded container.
 * A faint vertical divider separates the two zones; the plan tag picks
 * up tier-specific colour without breaking the unified shape.
 *
 * Owns the credits modal state directly — the button and dialog live
 * in the same component, mirroring the proven milestones-dialog
 * pattern in Dashboard.jsx. A window-event listener lets other parts
 * of the app (sidebar CreditsBadge, Settings → Buy credits) open the
 * same dialog.
 */
import { useEffect, useMemo, useState } from 'react'

import { useCreditsQuery, useSubscriptionQuery } from '../queries/billing/creditsQueries'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { onOpenCreditsModal } from '../lib/creditsModalBus'
import { CreditPacksModal } from './CreditPacksModal'
import './HeaderCreditsBadge.css'

function IconZap() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

function formatCount(n) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return n.toLocaleString('en-US')
}

// Map the raw plan tier (server-side enum: starter | creator | ultimate)
// to a display label + className token. The label is what the user
// reads; the tier token drives the colour ramp on the right zone.
function planTierAndLabel(subscription, isTrial) {
  if (isTrial) return { tier: 'trial', label: 'Trial' }
  const rawTier = (subscription?.tier || '').toString().trim().toLowerCase()
  const rawName = (subscription?.plan_name || '').toString().trim()
  const fromTier = ['starter', 'creator', 'ultimate'].includes(rawTier) ? rawTier : null
  const tier = fromTier || 'pro'
  const label = rawName
    ? rawName.charAt(0).toUpperCase() + rawName.slice(1)
    : tier.charAt(0).toUpperCase() + tier.slice(1)
  return { tier, label }
}

export function HeaderCreditsBadge({ onClick }) {
  const { data: credits } = useCreditsQuery()
  const { data: subscription } = useSubscriptionQuery()
  const { isSubscribed } = usePlanEntitlements()
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => onOpenCreditsModal(() => setDialogOpen(true)), [])

  const total = useMemo(() => {
    if (!credits) return null
    return Number(credits.subscription_credits || 0) + Number(credits.permanent_credits || 0)
  }, [credits])

  if (!isSubscribed) return null

  const isLow = total != null && total > 0 && total < 100
  const isEmpty = total === 0
  const isTrial = !!subscription?.is_trial
  const planCredits = subscription?.plan_credits || 0
  const { tier, label: planLabel } = planTierAndLabel(subscription, isTrial)

  const handleClick = (e) => {
    if (onClick) return onClick(e)
    setDialogOpen(true)
  }

  return (
    <>
      <button
        type="button"
        className={[
          'header-credits-badge',
          `header-credits-badge--tier-${tier}`,
          isLow ? 'header-credits-badge--low' : '',
          isEmpty ? 'header-credits-badge--empty' : '',
          isTrial ? 'header-credits-badge--trial' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={handleClick}
        title={
          total == null
            ? 'Loading credits…'
            : isTrial
              ? `Trial: ${total} credits remaining — upgrade to get the full plan`
              : `${total.toLocaleString('en-US')} credits remaining${planCredits ? ` / ${planCredits.toLocaleString('en-US')} monthly` : ''}`
        }
        aria-label={
          total == null ? 'Credits loading' : `${total} credits remaining, ${planLabel} plan`
        }
      >
        <span className="header-credits-badge__icon" aria-hidden>
          <IconZap />
        </span>
        <span className="header-credits-badge__count">{formatCount(total)}</span>
        <span className="header-credits-badge__divider" aria-hidden />
        <span className="header-credits-badge__plan">{planLabel}</span>
      </button>

      <CreditPacksModal open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  )
}
