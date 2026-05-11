/**
 * HeaderCreditsBadge — credits + plan badge stacked into a single ticket-
 * shaped chip in the top-right of the thumbnail screen.
 *
 * Top section: rounded pill, bolt icon + live credit balance.
 * Bottom section: short banner with a notched bottom edge — clip-path
 * carves the chevron into the rounded rectangle so it reads as a single
 * connected "tier ribbon", not two stacked pills. Tier-specific colour
 * ramps (Starter / Creator / Ultimate / Trial) overlay the banner.
 *
 * Owns the credits modal state directly — the button and dialog live in
 * the same component, mirroring the proven milestones-dialog pattern in
 * Dashboard.jsx. A window-event listener lets other parts of the app
 * (sidebar CreditsBadge, Settings → Buy credits) open the same dialog.
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
// to a display label + className token. The label is what the user reads;
// the tier token drives the gradient ramp on the bottom banner.
function planTierAndLabel(subscription, isTrial) {
  if (isTrial) return { tier: 'trial', label: 'Trial' }
  const rawTier = (subscription?.tier || '').toString().trim().toLowerCase()
  const rawName = (subscription?.plan_name || '').toString().trim()
  const fromTier = ['starter', 'creator', 'ultimate'].includes(rawTier) ? rawTier : null
  const tier = fromTier || 'pro'
  // Prefer the human plan_name from the server; fall back to title-cased
  // tier so legacy rows without plan_name still surface something sane.
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

  // Listen for open events from anywhere else in the app (sidebar
  // CreditsBadge, BillingSettingsPanel "Buy credits", empty-balance prompts).
  useEffect(() => onOpenCreditsModal(() => setDialogOpen(true)), [])

  const total = useMemo(() => {
    if (!credits) return null
    return Number(credits.subscription_credits || 0) + Number(credits.permanent_credits || 0)
  }, [credits])

  // Hide for unsubscribed users — they see nothing credit-related until
  // they start a trial or subscribe. Placed AFTER hooks to satisfy Rules of Hooks.
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
        {/* Top section — rounded pill with bolt + count. */}
        <span className="header-credits-badge__core">
          <span className="header-credits-badge-icon" aria-hidden>
            <IconZap />
          </span>
          <span className="header-credits-badge-count">{formatCount(total)}</span>
        </span>

        {/* Bottom section — tier-tinted banner with a notched bottom
            edge (carved by clip-path on the .__banner element). */}
        <span className={`header-credits-badge__banner header-credits-badge__banner--${tier}`}>
          <span className="header-credits-badge__banner-shine" aria-hidden />
          <span className="header-credits-badge__banner-text">{planLabel}</span>
        </span>
      </button>

      <CreditPacksModal open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  )
}
