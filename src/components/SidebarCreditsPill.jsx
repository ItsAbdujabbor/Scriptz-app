import { useMemo } from 'react'
import { useCreditsQuery, useSubscriptionQuery } from '../queries/billing/creditsQueries'

/**
 * SidebarCreditsPill — replaces the old text "Free / Pro" plan label with a
 * single creative pill that combines:
 *
 *   • the user's live credit balance (formatted, tabular nums)
 *   • a plan tag (Free / Pro / Trial) with state-specific colour
 *   • on Free: a subtle "Upgrade" affordance routed to #pro
 *   • on Trial: days remaining (when known)
 *
 * Sits in the sidebar account block, below the name + email row. Pure
 * presentational: reads `useCreditsQuery` and `useSubscriptionQuery`
 * directly so it doesn't need prop drilling from Sidebar.jsx.
 */
function formatCreditNumber(n) {
  if (n == null) return '—'
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}M`
  if (num >= 10_000) return `${Math.round(num / 1000)}k`
  return num.toLocaleString()
}

function trialDaysRemaining(subscription) {
  const end = subscription?.trial_end_at || subscription?.trial_ends_at
  if (!end) return null
  const t = Date.parse(end)
  if (!Number.isFinite(t)) return null
  const days = Math.ceil((t - Date.now()) / 86_400_000)
  if (days < 0) return null
  return days
}

export default function SidebarCreditsPill({ onUpgradeClick }) {
  const { data: credits, isLoading: creditsLoading } = useCreditsQuery()
  const { data: subscription } = useSubscriptionQuery()

  const balance = credits?.balance ?? credits?.credits ?? null
  const activeStatuses = ['active', 'trialing', 'past_due']
  const isActive = !!(subscription && activeStatuses.includes(subscription.status))
  const isTrial = !!subscription?.is_trial
  const isPro = isActive && !isTrial
  const isFree = !isActive

  const trialDays = useMemo(
    () => (isTrial ? trialDaysRemaining(subscription) : null),
    [isTrial, subscription]
  )

  const tone = isPro ? 'pro' : isTrial ? 'trial' : 'free'

  const handleUpgrade = (e) => {
    e.stopPropagation()
    if (onUpgradeClick) {
      onUpgradeClick()
      return
    }
    window.location.hash = 'pro'
  }

  return (
    <div
      className={`sidebar-credits-pill sidebar-credits-pill--${tone}`}
      role="status"
      aria-live="polite"
      aria-label={
        balance != null
          ? `${balance} credits, ${isPro ? 'Pro' : isTrial ? 'Trial' : 'Free plan'}`
          : 'Credits loading'
      }
    >
      <span className="sidebar-credits-pill__glow" aria-hidden />
      <span className="sidebar-credits-pill__icon" aria-hidden>
        {/* Sparkle / bolt icon — accents the credits number. Inline SVG so
            it inherits the pill's gradient via currentColor. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
      </span>
      <span className="sidebar-credits-pill__main">
        <span className="sidebar-credits-pill__amount">
          {creditsLoading && balance == null ? '···' : formatCreditNumber(balance)}
        </span>
        <span className="sidebar-credits-pill__unit">credits</span>
      </span>
      <span className="sidebar-credits-pill__sep" aria-hidden />
      {isPro && (
        <span className="sidebar-credits-pill__tag sidebar-credits-pill__tag--pro">
          <span className="sidebar-credits-pill__tag-dot" aria-hidden />
          Pro
        </span>
      )}
      {isTrial && (
        <span className="sidebar-credits-pill__tag sidebar-credits-pill__tag--trial">
          <span className="sidebar-credits-pill__tag-dot" aria-hidden />
          {trialDays != null ? `Trial · ${trialDays}d` : 'Trial'}
        </span>
      )}
      {isFree && (
        <button
          type="button"
          className="sidebar-credits-pill__tag sidebar-credits-pill__tag--free"
          onClick={handleUpgrade}
          aria-label="Upgrade to Pro"
        >
          Free
          <span className="sidebar-credits-pill__upsell" aria-hidden>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
