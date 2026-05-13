/**
 * Billing — flat two-section layout.
 *
 *   ┌─ Subscription Details ──────────────────────────┐
 *   │  Plan                       [ Manage Plan ]      │
 *   │  Creator monthly                                 │
 *   │  ── divider ──                                   │
 *   │  Next billing amount                             │
 *   │  $39.99                                          │
 *   │  Active until                       Apr 20, 2026 │
 *   │  Billing period   Apr 13, 2026 – Apr 20, 2026    │
 *   │  ─ Total ────────────────────────────  $39.99 ─  │
 *   │  ── divider ──                                   │
 *   │  Payment & Billing Info     [ Update Infos ]     │
 *   │  ┌── Payment ──┐ ┌── Billing address ─┐          │
 *   │  Cancel subscription / footer note               │
 *   └──────────────────────────────────────────────────┘
 *
 *   ┌─ Recent Invoices ───────────────────────────────┐
 *   │  list of invoices  /  empty state                │
 *   └──────────────────────────────────────────────────┘
 *
 * One outer card per section. Inside, rows are placed directly on
 * the card surface — no nested "frame" wrapper. The two payment-info
 * tiles are simple sub-cards on that same surface.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuthStore } from '../stores/authStore'
import {
  useCreditsQuery,
  useSubscriptionQuery,
  useSkipTrialMutation,
  refreshBillingState,
} from '../queries/billing/creditsQueries'
import { cancelSubscription, getLedger } from '../api/billing'
import { queryKeys } from '../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { resultOrNullOnAuthFailure } from '../lib/query/safeApi'
import { friendlyMessage } from '../lib/aiErrors'
import { InlineSpinner, Skeleton, SkeletonGroup } from './ui'
import './BillingSettingsPanel.css'

/* ───────────────────── formatting helpers ──────────────────────── */

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function fmtDateRange(startIso, endIso) {
  if (!startIso || !endIso) return '—'
  try {
    const start = new Date(startIso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    const end = new Date(endIso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    return `${start} – ${end}`
  } catch {
    return '—'
  }
}

/* Plan-name → monthly USD price (mirrors ProPricingContent values).
 * Yearly plans bill once with the discounted-monthly × 12. */
const PRICE_MONTHLY = { starter: 19.99, creator: 39.99, ultimate: 79.99 }
const PRICE_YEARLY_MONTHLY = { starter: 13.99, creator: 27.99, ultimate: 55.99 }

function nextBillingAmountUSD(subscription) {
  if (!subscription) return null
  // Backend may already supply the amount.
  const direct =
    subscription.next_amount_usd ?? subscription.plan_amount_usd ?? subscription.amount_usd ?? null
  if (direct != null) return Number(direct)
  const slug = String(subscription.plan_name || '')
    .toLowerCase()
    .trim()
  if (!slug) return null
  if (subscription.billing_period === 'year') {
    const m = PRICE_YEARLY_MONTHLY[slug]
    return m == null ? null : +(m * 12).toFixed(2)
  }
  const m = PRICE_MONTHLY[slug]
  return m == null ? null : m
}

/* ───────────────────── invoice synthesis ───────────────────────── */
/* Until the backend exposes a real invoice feed, we derive money-flow
 * rows from the credit ledger's purchase / grant / refund kinds.
 * Per-feature usage debits are intentionally excluded — they aren't
 * invoices. */
const INVOICE_KINDS = new Set(['subscription_grant', 'pack_purchase', 'refund'])
const INVOICE_LABELS = {
  subscription_grant: 'Subscription renewal',
  pack_purchase: 'Credit pack',
  refund: 'Refund',
}

/* ───────────────────── ledger query ────────────────────────────── */

function useLedgerQuery(active) {
  return useQuery({
    queryKey: queryKeys.billing.ledger,
    enabled: !!active,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(getLedger(token, { limit: 25 }))
    },
    staleTime: 30_000,
  })
}

/* ───────────────────── icon ─────────────────────────────────────── */

const CardChipIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 15h2" />
  </svg>
)

/* ───────────────────── confirm sheet ───────────────────────────── */

function CancelConfirm({
  open,
  busy,
  error,
  periodEnd,
  recentlyPaid = false,
  subscriptionCredits,
  onCancel,
  onConfirm,
}) {
  if (!open) return null
  // Loss-aversion copy: show the exact credit count the user is about
  // to forfeit, plus a stronger warning when the period started within
  // the last 24 hours (refund within that window auto-revokes credits
  // server-side via the fraud guard in handle_adjustment_event).
  // `recentlyPaid` is computed at click-time by the parent so we don't
  // call Date.now() during render here (react-hooks/purity rule).
  const remaining = Number(subscriptionCredits) || 0
  return (
    <div className="bp-confirm" role="alertdialog" aria-labelledby="bp-confirm-title">
      <div className="bp-confirm-card">
        <h4 id="bp-confirm-title" className="bp-confirm-title">
          Cancel subscription?
        </h4>
        <p className="bp-confirm-body">
          Your plan stays active until <strong>{fmtDate(periodEnd)}</strong>. After that, paid
          features lock and{' '}
          {remaining > 0 ? (
            <>
              your <strong>{remaining.toLocaleString('en-US')} remaining credits</strong> reset to
              zero.
            </>
          ) : (
            'credits reset to zero.'
          )}
        </p>
        {recentlyPaid ? (
          <p className="bp-confirm-body" style={{ marginTop: 8 }}>
            <strong>Heads up:</strong> you started this plan less than 24 hours ago. If you also
            request a refund, your remaining credits will be revoked immediately rather than at
            period end.
          </p>
        ) : null}
        {error ? <p className="bp-confirm-error">{error}</p> : null}
        <div className="bp-confirm-actions">
          <button type="button" className="bp-btn bp-btn--ghost" onClick={onCancel} disabled={busy}>
            Keep subscription
          </button>
          <button
            type="button"
            className="bp-btn bp-btn--danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (
              <span className="bp-btn-pending">
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
  )
}

/* ───────────────────── main component ──────────────────────────── */

export function BillingSettingsPanel({ active, onClose }) {
  const goToPlans = () => {
    onClose?.()
    if (typeof window !== 'undefined') window.location.hash = 'pro'
  }
  const queryClient = useQueryClient()
  const { getValidAccessToken } = useAuthStore()
  const { data: subscription } = useSubscriptionQuery()
  const { data: credits } = useCreditsQuery({ refetchInterval: active ? 30_000 : false })
  const { data: ledger } = useLedgerQuery(active)

  const [confirmOpen, setConfirmOpen] = useState(false)
  // Captured at the moment the dialog is opened so the CancelConfirm
  // component doesn't need to call Date.now() during render (which
  // react-hooks/purity forbids). Re-derived on every open click — if
  // the user closes and re-opens later, the freshness is recomputed.
  const [confirmRecentlyPaid, setConfirmRecentlyPaid] = useState(false)
  const [cancelError, setCancelError] = useState(null)
  const [skipTrialError, setSkipTrialError] = useState(null)

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const token = await getValidAccessToken()
      if (!token) throw new Error('Not authenticated')
      return cancelSubscription(token)
    },
    onSuccess: () => {
      setConfirmOpen(false)
      // Cancellation flips cancel_at_period_end + (eventually) status —
      // refresh every billing surface so sidebar tier badge, billing
      // panel, paywall callouts, and recent-invoices list converge.
      refreshBillingState(queryClient)
    },
    onError: (err) => setCancelError(friendlyMessage(err) || 'Could not cancel. Try again.'),
  })

  // Centralised mutation — owns the activation-store burst poll +
  // billing-state refresh fan-out. See useSkipTrialMutation in
  // queries/billing/creditsQueries.js for the full semantics.
  const skipTrialMutation = useSkipTrialMutation({
    onSuccess: () => setSkipTrialError(null),
    onError: (err) => {
      // Any non-retryable Paddle rejection (no payment method,
      // subscription disabled, wrong plan id, state mismatch, ...)
      // → route to /pro where the user can re-subscribe via Paddle
      // checkout. Strictly better than a dead-end error toast.
      const paddleExtra = err?.body?.error?.extra || err?.extra || {}
      const isPaddleBlocker =
        err?.code === 'PAYMENT_METHOD_REQUIRED' ||
        (err?.code === 'PADDLE_API_ERROR' && paddleExtra?.retryable === false)
      if (isPaddleBlocker) {
        if (typeof window !== 'undefined') window.location.hash = 'pro'
        setSkipTrialError(null)
        return
      }
      // NOT_TRIALING → already active (concurrent call / webhook
      // already landed). Refresh silently — billing state queries
      // re-fetch and the panel re-renders on the new shape.
      if (err?.code === 'NOT_TRIALING') {
        setSkipTrialError(null)
        return
      }
      setSkipTrialError(friendlyMessage(err) || 'Could not end trial. Try again.')
    },
  })

  const isSubscribed =
    !!subscription && ['active', 'trialing', 'past_due'].includes(subscription.status)

  const nextAmount = useMemo(() => nextBillingAmountUSD(subscription), [subscription])

  const invoices = useMemo(() => {
    if (!ledger?.entries) return []
    return ledger.entries
      .filter((e) => INVOICE_KINDS.has(e.kind))
      .slice(0, 12)
      .map((e) => {
        let amount = e.amount_usd != null ? Number(e.amount_usd) : null
        if (amount == null && e.kind === 'subscription_grant' && nextAmount != null) {
          amount = nextAmount
        }
        return {
          id: e.id,
          label: INVOICE_LABELS[e.kind] || 'Invoice',
          date: e.created_at,
          amount,
          status: e.kind === 'refund' ? 'refunded' : 'paid',
        }
      })
  }, [ledger, nextAmount])

  /* ── Loading skeleton ─────────────────────────────────────── */
  if (active && subscription === undefined && credits === undefined) {
    return (
      <SkeletonGroup className="bp-loading" label="Loading billing">
        <div className="bp-card">
          <Skeleton height={20} width="40%" radius={999} />
          <Skeleton height={56} width="55%" radius={8} style={{ marginTop: 22 }} />
          <Skeleton height={14} width="100%" radius={999} style={{ marginTop: 16 }} />
          <Skeleton height={14} width="80%" radius={999} style={{ marginTop: 8 }} />
        </div>
        <div className="bp-card">
          <Skeleton height={18} width="35%" radius={999} />
          <Skeleton height={56} width="100%" radius={10} style={{ marginTop: 14 }} />
        </div>
      </SkeletonGroup>
    )
  }

  /* ── Free / unsubscribed view ─────────────────────────────── */
  if (!isSubscribed) {
    return (
      <div className="bp-root">
        <section className="bp-card">
          <div className="bp-card-header">
            <h2 className="bp-section-title">Subscription Details</h2>
          </div>
          <div className="bp-row bp-row--top">
            <div className="bp-stack">
              <span className="bp-label">Plan</span>
              <div className="bp-plan">
                <strong>Free</strong>
                <span className="bp-plan-period">no plan active</span>
              </div>
            </div>
            <button type="button" className="bp-btn bp-btn--outline" onClick={goToPlans}>
              See plans
            </button>
          </div>
        </section>

        <section className="bp-card">
          <div className="bp-card-header">
            <h2 className="bp-section-title">Recent Invoices</h2>
          </div>
          <div className="bp-empty">
            <p className="bp-empty-title">No invoices available yet.</p>
            <p className="bp-empty-sub">Your invoice history will appear here.</p>
          </div>
        </section>
      </div>
    )
  }

  /* ── Subscribed view ──────────────────────────────────────── */
  const planName = subscription.plan_name
    ? subscription.plan_name[0].toUpperCase() + subscription.plan_name.slice(1)
    : '—'
  const periodLabel =
    subscription.billing_period === 'year'
      ? 'yearly'
      : subscription.billing_period === 'month'
        ? 'monthly'
        : ''
  const cancelScheduled = subscription.cancel_at_period_end

  // Backend-supplied payment method + billing address (graceful fallback).
  const pm = subscription.payment_method || {}
  const pmBrand = pm.brand || pm.card_brand || null
  const pmLast4 = pm.last4 || pm.card_last4 || null
  const pmExp = pm.expires || pm.card_expires || null
  const ba = subscription.billing_address || {}
  const baLines = [ba.line1, ba.line2, ba.city, ba.state, ba.country].filter(Boolean)

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription })
    queryClient.invalidateQueries({ queryKey: queryKeys.billing.credits })
  }

  // Optimistic dismiss: hide the banner the moment the skip-trial
  // mutation resolves successfully, without waiting for the React
  // Query refetch + 2s polling cycle to surface `is_trial=false`.
  // If the mutation later errors out, `isSuccess` is false and we
  // re-show the banner. This trades a few ms of UI inconsistency
  // (banner gone, query data still says trial) for instant feedback —
  // the next refetch reconciles within 1-2s.
  const isTrial = !!subscription.is_trial && !skipTrialMutation.isSuccess

  return (
    <div className="bp-root">
      {/* ─────────── Trial banner (only while trialing) ─────────── */}
      {isTrial ? (
        <section className="bp-card bp-card--trial">
          <div className="bp-trial-row">
            <div className="bp-trial-text">
              <strong>You're on a free trial of {planName}</strong>
              <span>
                Skip the trial to unlock the full plan now — your card is charged today and all your
                monthly credits are added to your balance instantly.
              </span>
            </div>
            <button
              type="button"
              className="bp-btn bp-btn--primary"
              onClick={() => skipTrialMutation.mutate()}
              disabled={skipTrialMutation.isPending}
            >
              {skipTrialMutation.isPending ? (
                <>
                  <InlineSpinner /> Processing…
                </>
              ) : (
                'Skip trial — pay now'
              )}
            </button>
          </div>
          {skipTrialError ? (
            <p className="bp-trial-error" role="alert">
              {skipTrialError}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ─────────── Subscription Details ─────────── */}
      <section className="bp-card">
        <div className="bp-card-header bp-card-header--with-action">
          <h2 className="bp-section-title">Subscription Details</h2>
          <button
            type="button"
            className="bp-refresh-btn"
            onClick={handleRefresh}
            title="Refresh from server"
            aria-label="Refresh subscription"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        {/* Plan + Manage button */}
        <div className="bp-row bp-row--top">
          <div className="bp-stack">
            <span className="bp-label">Plan</span>
            <div className="bp-plan">
              <strong>{planName}</strong>
              {periodLabel ? <span className="bp-plan-period">{periodLabel}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="bp-btn bp-btn--outline"
            onClick={() => {
              window.location.hash = 'pro'
            }}
          >
            Manage Plan
          </button>
        </div>

        <div className="bp-divider" />

        {/* Next billing amount hero */}
        <div className="bp-stack bp-stack--hero">
          <span className="bp-label">Next billing amount</span>
          <div className="bp-amount">{fmtUSD(nextAmount)}</div>
        </div>

        {/* Detail rows */}
        <dl className="bp-keyvals">
          <div className="bp-keyval">
            <dt>{cancelScheduled ? 'Active until' : 'Renews on'}</dt>
            <dd>{fmtDate(subscription.current_period_end)}</dd>
          </div>
          <div className="bp-keyval">
            <dt>Billing period</dt>
            <dd>
              {fmtDateRange(subscription.current_period_start, subscription.current_period_end)}
            </dd>
          </div>
          <div className="bp-keyval bp-keyval--total">
            <dt>Total</dt>
            <dd>{fmtUSD(nextAmount)}</dd>
          </div>
        </dl>

        <div className="bp-divider" />

        {/* Payment & billing info row + button */}
        <div className="bp-row">
          <span className="bp-label">Payment &amp; Billing Info</span>
          <button
            type="button"
            className="bp-btn bp-btn--outline"
            onClick={() => {
              window.location.hash = 'pro'
            }}
          >
            Update Infos
          </button>
        </div>

        <div className="bp-grid-2">
          <div className="bp-tile">
            <span className="bp-tile-label">Payment method</span>
            <div className="bp-tile-body">
              <span className="bp-tile-icon" aria-hidden>
                {CardChipIcon}
              </span>
              <div className="bp-tile-text">
                <span className="bp-tile-value">
                  {pmBrand && pmLast4 ? `${pmBrand} ending ${pmLast4}` : 'Not on file'}
                </span>
                {pmExp ? <span className="bp-tile-sub">Expires {pmExp}</span> : null}
              </div>
            </div>
          </div>
          <div className="bp-tile">
            <span className="bp-tile-label">Billing address</span>
            <div className="bp-tile-text bp-tile-text--solo">
              {baLines.length === 0 ? (
                <span className="bp-tile-value bp-tile-value--muted">—</span>
              ) : (
                baLines.map((line, i) => (
                  <span key={i} className={i === 0 ? 'bp-tile-value' : 'bp-tile-sub'}>
                    {line}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Cancel control — hidden for admin-granted subs because
            POST /api/billing/cancel returns 409 ADMIN_GRANTED_NO_CANCEL
            for them (their plan isn't on Paddle, so there's nothing to
            cancel via the user flow — admin has to revoke it). */}
        {subscription.is_admin_granted ? (
          <p className="bp-footnote">
            This plan was assigned by an admin. Contact support to have it changed or removed.
          </p>
        ) : !cancelScheduled ? (
          <button
            type="button"
            className="bp-cancel-link"
            onClick={() => {
              const startedAt = subscription.current_period_start
                ? new Date(subscription.current_period_start)
                : null
              const hoursSinceStart =
                startedAt && !Number.isNaN(startedAt.getTime())
                  ? (Date.now() - startedAt.getTime()) / 3_600_000
                  : null
              setConfirmRecentlyPaid(hoursSinceStart != null && hoursSinceStart <= 24)
              setConfirmOpen(true)
            }}
            disabled={cancelMutation.isPending}
          >
            Cancel subscription
          </button>
        ) : (
          <p className="bp-footnote">
            Your plan stays active until <strong>{fmtDate(subscription.current_period_end)}</strong>
            . After that paid features downgrade and credits reset to zero.
          </p>
        )}
      </section>

      {/* ─────────── Recent Invoices ─────────── */}
      <section className="bp-card">
        <div className="bp-card-header">
          <h2 className="bp-section-title">Recent Invoices</h2>
        </div>

        {invoices.length === 0 ? (
          <div className="bp-empty">
            <p className="bp-empty-title">No invoices available yet.</p>
            <p className="bp-empty-sub">Your invoice history will appear here.</p>
          </div>
        ) : (
          <div className="bp-invoices" role="table" aria-label="Recent invoices">
            <div className="bp-invoice-row bp-invoice-row--head" role="row">
              <span role="columnheader">Description</span>
              <span role="columnheader">Date</span>
              <span role="columnheader">Status</span>
              <span role="columnheader" className="bp-amount-col">
                Amount
              </span>
            </div>
            {invoices.map((inv) => (
              <div key={inv.id} className="bp-invoice-row" role="row">
                <span role="cell" className="bp-invoice-label">
                  {inv.label}
                </span>
                <span role="cell" className="bp-invoice-date">
                  {fmtDate(inv.date)}
                </span>
                <span role="cell">
                  <span className={`bp-status bp-status--${inv.status}`}>
                    {inv.status[0].toUpperCase() + inv.status.slice(1)}
                  </span>
                </span>
                <span role="cell" className="bp-invoice-amount">
                  {inv.amount != null ? fmtUSD(inv.amount) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <CancelConfirm
        open={confirmOpen}
        busy={cancelMutation.isPending}
        error={cancelError}
        periodEnd={subscription.current_period_end}
        recentlyPaid={confirmRecentlyPaid}
        subscriptionCredits={credits?.subscription_credits}
        onCancel={() => {
          setConfirmOpen(false)
          setCancelError(null)
        }}
        onConfirm={() => cancelMutation.mutate()}
      />
    </div>
  )
}
