/**
 * CreditsBadge — compact pill showing the user's total credit balance.
 *
 * Placement: Sidebar, just above the "Go Pro" CTA.
 * Collapsed: a single zap + number; expanded: "X credits" label.
 * Click: navigates to #pro (pricing / top-up).
 * Polls the balance via `useCreditsQuery` (30s interval), and any AI mutation
 * that calls `useInvalidateCredits()` will drop it to stale → instant refetch.
 */
import { useMemo } from 'react'

import { useCreditsQuery } from '../queries/billing/creditsQueries'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { openCreditsModal } from '../lib/creditsModalBus'
import { Skeleton } from './ui'
import './CreditsBadge.css'

function formatCount(n) {
  if (n == null) return '—'
  if (n >= 10_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return n.toLocaleString('en-US')
}

function IconZap(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

export function CreditsBadge({ collapsed = false, onClick }) {
  const { data, isLoading, isError } = useCreditsQuery()
  const { isSubscribed } = usePlanEntitlements()

  const total = useMemo(() => {
    if (!data) return null
    return Number(data.subscription_credits || 0) + Number(data.permanent_credits || 0)
  }, [data])

  if (!isSubscribed) return null

  const isLow = total !== null && total > 0 && total < 50
  const isEmpty = total === 0

  const handleClick = (e) => {
    if (onClick) onClick(e)
    else openCreditsModal()
  }

  return (
    <button
      type="button"
      className={[
        'credits-badge',
        collapsed ? 'credits-badge--collapsed' : '',
        isLow ? 'credits-badge--low' : '',
        isEmpty ? 'credits-badge--empty' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      title={
        isError
          ? 'Could not load credits'
          : total == null
            ? 'Loading credits…'
            : `${total.toLocaleString('en-US')} credits remaining — click to buy more`
      }
      aria-label={total == null ? 'Credits loading' : `${total} credits remaining`}
    >
      <span className="credits-badge-icon" aria-hidden>
        <IconZap />
      </span>
      {!collapsed && (
        <span className="credits-badge-body">
          {isLoading && total == null ? (
            <Skeleton width={40} height={12} radius={6} />
          ) : (
            <>
              <span className="credits-badge-count">{formatCount(total)}</span>
              <span className="credits-badge-label">credits</span>
            </>
          )}
        </span>
      )}
    </button>
  )
}
