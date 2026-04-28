/**
 * BillingSettingsPanel — shown inside SettingsModal's "Billing" tab.
 *
 * Free users see a compact upsell.
 * Subscribed users see:
 *   • Current plan + status badge (trial / active / past_due / canceled)
 *   • Renewal or expiry date
 *   • Credit balance + this-period usage
 *   • "Change plan" (jump to /#pro) + "Cancel subscription" (confirm → Paddle)
 *   • Recent ledger rows (last 8) for transparency
 */
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useAuthStore } from '../stores/authStore'
import {
  useCreditsQuery,
  useSubscriptionQuery,
  invalidateCredits,
} from '../queries/billing/creditsQueries'
import { cancelSubscription, getLedger } from '../api/billing'
import { queryKeys } from '../lib/query/queryKeys'
import { useQuery } from '@tanstack/react-query'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { resultOrNullOnAuthFailure } from '../lib/query/safeApi'
import { openCreditsModal } from '../lib/creditsModalBus'
import { friendlyMessage } from '../lib/aiErrors'
import { InlineSpinner, SkeletonCard, SkeletonGroup, SkeletonList, Skeleton } from './ui'
import './BillingSettingsPanel.css'

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function useLedgerQuery(active) {
  return useQuery({
    queryKey: ['billing', 'ledger', 'recent'],
    enabled: !!active,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(getLedger(token, { limit: 8 }))
    },
    staleTime: 30_000,
  })
}

function StatusBadge({ status, isTrial }) {
  if (isTrial) return <span className="bsp-badge bsp-badge--trial">Free trial</span>
  switch (status) {
    case 'active':
      return <span className="bsp-badge bsp-badge--active">Active</span>
    case 'past_due':
      return <span className="bsp-badge bsp-badge--warn">Past due</span>
    case 'canceled':
      return <span className="bsp-badge bsp-badge--cancel">Canceled</span>
    case 'paused':
      return <span className="bsp-badge bsp-badge--warn">Paused</span>
    default:
      return <span className="bsp-badge">{status || '—'}</span>
  }
}

export function BillingSettingsPanel({ active }) {
  const queryClient = useQueryClient()
  const { getValidAccessToken } = useAuthStore()
  const { data: subscription } = useSubscriptionQuery()
  const { data: credits } = useCreditsQuery({ refetchInterval: active ? 30_000 : false })
  const { data: ledger } = useLedgerQuery(active)

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelError, setCancelError] = useState(null)

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return cancelSubscription(token)
    },
    onSuccess: () => {
      setConfirmCancel(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription })
      invalidateCredits(queryClient)
    },
    onError: (err) => {
      setCancelError(friendlyMessage(err) || 'Could not cancel. Try again.')
    },
  })

  const isSubscribed =
    !!subscription && ['active', 'trialing', 'past_due'].includes(subscription.status)
  const total = useMemo(() => {
    if (!credits) return null
    return Number(credits.subscription_credits || 0) + Number(credits.permanent_credits || 0)
  }, [credits])
  const used = useMemo(() => {
    if (!subscription?.plan_credits || total == null) return null
    return Math.max(0, subscription.plan_credits - total)
  }, [subscription, total])
  const usedPct = subscription?.plan_credits
    ? Math.round(((used ?? 0) / subscription.plan_credits) * 100)
    : null

  // ── First mount: while subscription + credits are both still loading ──
  if (active && subscription === undefined && credits === undefined) {
    return (
      <>
        <h3 className="settings-panel-heading">Billing</h3>
        <p className="settings-panel-desc">Plan and payment.</p>
        <SkeletonGroup label="Loading billing">
          <SkeletonCard ratio="5 / 2" lines={2} />
          <Skeleton height={18} width="40%" radius={999} style={{ marginTop: 12 }} />
          <SkeletonList count={3} rowHeight={48} gap={8} />
        </SkeletonGroup>
      </>
    )
  }

  // ── Free / unsubscribed view ──────────────────────────────────────────
  if (!isSubscribed) {
    return (
      <>
        <h3 className="settings-panel-heading">Billing</h3>
        <p className="settings-panel-desc">Plan and payment.</p>
        <div className="bsp-empty">
          <div className="bsp-empty-icon" aria-hidden>
            ✨
          </div>
          <h4 className="bsp-empty-title">You're on the Free plan</h4>
          <p className="bsp-empty-sub">
            Upgrade to unlock Character looks, Styles, Edit &amp; Character swap, and recurring
            monthly credits. Free trial = 100 credits to try it out.
          </p>
          <div className="bsp-empty-actions">
            <button
              type="button"
              className="bsp-upgrade-btn"
              onClick={() => {
                window.location.hash = 'pro'
              }}
            >
              See plans
            </button>
            <button type="button" className="bsp-btn" onClick={openCreditsModal}>
              Or buy credits
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── Subscribed view ──────────────────────────────────────────────────
  const planName = subscription.plan_name
    ? `${subscription.plan_name}${subscription.billing_period === 'year' ? ' · Annual' : subscription.billing_period === 'month' ? ' · Monthly' : ''}`
    : '—'
  const cancelScheduled = subscription.cancel_at_period_end

  return (
    <>
      <h3 className="settings-panel-heading">Billing</h3>
      <p className="settings-panel-desc">Manage your plan, credits, and payments.</p>

      {/* Plan summary card */}
      <div className="bsp-card">
        <div className="bsp-card-head">
          <div>
            <div className="bsp-plan-name">{planName}</div>
            <div className="bsp-plan-meta">
              <StatusBadge status={subscription.status} isTrial={subscription.is_trial} />
              {cancelScheduled && (
                <span className="bsp-badge bsp-badge--warn">
                  Cancels on {fmtDate(subscription.current_period_end)}
                </span>
              )}
            </div>
          </div>
          <div className="bsp-plan-price">
            {subscription.plan_credits ? (
              <>
                <strong>{fmt(subscription.plan_credits)}</strong>
                <span className="bsp-plan-price-sub">
                  credits / {subscription.billing_period === 'year' ? 'year' : 'month'}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* Credit usage */}
        <div className="bsp-usage">
          <div className="bsp-usage-row">
            <span>Credits remaining</span>
            <strong>{fmt(total)}</strong>
          </div>
          {usedPct != null && (
            <>
              <div className="bsp-usage-bar" aria-hidden>
                <span className="bsp-usage-bar-fill" style={{ width: `${usedPct}%` }} />
              </div>
              <div className="bsp-usage-legend">
                {fmt(used)} used · {fmt(total)} left
                {subscription.is_trial
                  ? ' · Upgrade to unlock the full plan'
                  : subscription.current_period_end
                    ? ` · resets ${fmtDate(subscription.current_period_end)}`
                    : ''}
              </div>
            </>
          )}
        </div>

        <div className="bsp-actions">
          <button
            type="button"
            className="bsp-btn bsp-btn--primary"
            onClick={() => {
              window.location.hash = 'pro'
            }}
          >
            Change plan
          </button>
          <button type="button" className="bsp-btn" onClick={openCreditsModal}>
            Buy credits
          </button>
          {!cancelScheduled && (
            <button
              type="button"
              className="bsp-btn bsp-btn--ghost"
              onClick={() => setConfirmCancel(true)}
              disabled={cancelMutation.isPending}
            >
              Cancel subscription
            </button>
          )}
          {cancelScheduled && (
            <div className="bsp-cancel-note">
              Your plan will stay active until{' '}
              <strong>{fmtDate(subscription.current_period_end)}</strong>. After that, credits reset
              to zero and feature access downgrades to Free.
            </div>
          )}
        </div>
      </div>

      {/* Recent ledger */}
      {ledger?.entries?.length > 0 && (
        <div className="bsp-card">
          <div className="bsp-ledger-head">
            <h4 className="bsp-card-title">Recent activity</h4>
            <span className="bsp-ledger-hint">Last {ledger.entries.length} events</span>
          </div>
          <ul className="bsp-ledger">
            {ledger.entries.map((e) => (
              <li key={e.id} className="bsp-ledger-row">
                <span className="bsp-ledger-date">{fmtDate(e.created_at)}</span>
                <span className="bsp-ledger-label">
                  {e.kind === 'usage'
                    ? `Used · ${e.feature_key || 'feature'}`
                    : e.kind === 'subscription_grant'
                      ? 'Plan credits granted'
                      : e.kind === 'trial_grant'
                        ? 'Free trial credits'
                        : e.kind === 'pack_purchase'
                          ? 'Top-up pack'
                          : e.kind === 'expiry'
                            ? 'Credits expired'
                            : e.kind === 'refund'
                              ? 'Refund'
                              : e.kind === 'admin_adjustment'
                                ? 'Manual adjustment'
                                : e.kind}
                </span>
                <span
                  className={`bsp-ledger-delta ${e.delta > 0 ? 'bsp-ledger-delta--pos' : 'bsp-ledger-delta--neg'}`}
                >
                  {e.delta > 0 ? '+' : ''}
                  {fmt(e.delta)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cancel confirm */}
      {confirmCancel && (
        <div className="bsp-confirm" role="alertdialog" aria-labelledby="bsp-confirm-title">
          <div className="bsp-confirm-card">
            <h4 id="bsp-confirm-title" className="bsp-confirm-title">
              Cancel subscription?
            </h4>
            <p className="bsp-confirm-text">
              Your plan stays active until{' '}
              <strong>{fmtDate(subscription.current_period_end)}</strong>. After that your credits
              drop to 0 and Creator/Ultimate features lock. You can resubscribe anytime.
            </p>
            {cancelError && <p className="bsp-confirm-error">{cancelError}</p>}
            <div className="bsp-confirm-actions">
              <button
                type="button"
                className="bsp-btn bsp-btn--ghost"
                onClick={() => {
                  setConfirmCancel(false)
                  setCancelError(null)
                }}
                disabled={cancelMutation.isPending}
              >
                Keep subscription
              </button>
              <button
                type="button"
                className="bsp-btn bsp-btn--danger"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <span className="sk-btn-pending">
                    <InlineSpinner size={12} />
                    Cancelling…
                  </span>
                ) : (
                  'Yes, cancel'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
