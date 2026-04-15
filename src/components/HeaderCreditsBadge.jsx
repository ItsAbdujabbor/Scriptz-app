/**
 * HeaderCreditsBadge — inline pill shown next to the channel pill in the
 * Dashboard (and any other screen that has a header pill row).
 *
 * Owns the credits modal state directly — the button and dialog live in the
 * same component, mirroring the proven milestones-dialog pattern in
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

export function HeaderCreditsBadge({ onClick }) {
  const { data: credits, isLoading } = useCreditsQuery()
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

  const planCredits = subscription?.plan_credits || 0
  const usedPct = useMemo(() => {
    if (!planCredits || total == null) return null
    const used = planCredits - total
    if (used <= 0) return 0
    return Math.min(100, Math.round((used / planCredits) * 100))
  }, [planCredits, total])

  // Hide for unsubscribed users — they see nothing credit-related until
  // they start a trial or subscribe. Placed AFTER hooks to satisfy Rules of Hooks.
  if (!isSubscribed) return null

  const isLow = total != null && total > 0 && total < 100
  const isEmpty = total === 0
  const isTrial = subscription?.is_trial

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
          isLoading ? 'header-credits-badge--loading' : '',
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
        aria-label={total == null ? 'Credits loading' : `${total} credits remaining`}
      >
        <span className="header-credits-badge-icon" aria-hidden>
          <IconZap />
        </span>
        <span className="header-credits-badge-count">{formatCount(total)}</span>
        {usedPct != null && usedPct > 0 && (
          <span className="header-credits-badge-bar" aria-hidden>
            <span className="header-credits-badge-bar-fill" style={{ width: `${usedPct}%` }} />
          </span>
        )}
        {isTrial && <span className="header-credits-badge-tag">trial</span>}
      </button>

      <CreditPacksModal open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  )
}
