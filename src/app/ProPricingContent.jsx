import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getPlans, startCheckout, changePlan } from '../api/billing'
import { preloadPaddle } from '../lib/paddle'
import { useSubscriptionQuery, refreshBillingState } from '../queries/billing/creditsQueries'
import { celebrate } from '../lib/celebrate'
import { friendlyMessage } from '../lib/aiErrors'
import { ThumbPillTabs } from '../components/ThumbPillTabs'
import { useSubscriptionActivationStore } from '../stores/subscriptionActivationStore'
import { Faq } from '../landing/components/Faq'

/* ─── Static plan metadata ───────────────────────────────────────────
 * Prices are hardcoded to match Paddle production prices exactly.
 * Checkout prices are always sourced from Paddle directly (not us).
 * annual price_usd is the full-year charge; /mo display divides by 12. */
const PLAN_META = {
  starter: {
    tier: 'starter',
    name: 'Starter',
    thumbsMonthly: 50,
    thumbsAnnual: 600,
    tagline: 'For solo creators getting started.',
    priceMonthly: 19.99,
    priceAnnual: 167.88,
  },
  creator: {
    tier: 'creator',
    name: 'Creator',
    thumbsMonthly: 150,
    thumbsAnnual: 1800,
    tagline: 'For active creators shipping weekly.',
    priceMonthly: 39.99,
    priceAnnual: 335.88,
  },
  ultimate: {
    tier: 'ultimate',
    name: 'Ultimate',
    thumbsMonthly: 450,
    thumbsAnnual: 5400,
    tagline: 'For studios and high-volume creators.',
    priceMonthly: 79.99,
    priceAnnual: 671.88,
  },
}

const TIER_ORDER = ['starter', 'creator', 'ultimate']

/** Price shown on the plan card — hardcoded to match Paddle production prices. */
function getPriceDisplay(meta, annual) {
  const usd = annual ? meta.priceAnnual / 12 : meta.priceMonthly
  return `$${usd % 1 === 0 ? usd.toFixed(0) : usd.toFixed(2)}`
}

function getCreditsFromCatalog(catalog, tier, annual) {
  if (!catalog?.plans?.length) return null
  const slug = `${tier}_${annual ? 'annual' : 'monthly'}`
  const plan = catalog.plans.find((p) => p.slug === slug && p.is_active)
  return plan ? Number(plan.monthly_credits) : null
}

/** Savings % when paying annually — derived from hardcoded prices. */
function computeAnnualSavingsPct() {
  const ratios = TIER_ORDER.map((tier) => {
    const m = PLAN_META[tier]
    if (!m) return null
    const monthly = m.priceMonthly
    const annualPerMonth = m.priceAnnual / 12
    if (!monthly || annualPerMonth >= monthly) return null
    return (monthly - annualPerMonth) / monthly
  }).filter((r) => r != null && r > 0)
  if (!ratios.length) return 30
  return Math.round(Math.min(...ratios) * 100)
}

function fmtCredits(n) {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K'
  return String(n)
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('en-US')
}

/* Feature catalog — every plan card renders all of these rows. The
 * `tiers` array marks which plans unlock each feature; rows for tiers
 * a plan doesn't have render with a cross instead of a check. Keeping
 * one shared list (rather than per-tier arrays) means the visual order
 * matches across cards, so users can scan top-to-bottom to compare. */
const FEATURE_CATALOG = [
  { text: 'Prompt-to-Thumbnail', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'Recreate', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'Edit', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'Titles', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'Clixa Score™', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'One-Click Fix™', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'Works in Any Language', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'All Generations Remain Private', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'Personas', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'Styles', tiers: ['starter', 'creator', 'ultimate'] },
  { text: 'Priority Support', tiers: ['creator', 'ultimate'], strong: true },
  { text: 'Early Access to New Features', tiers: ['ultimate'], strong: true },
]

function buildFeatures(plan, annual) {
  const credits = annual
    ? `${fmtCredits(plan.annualCredits)} credits per year`
    : `${fmtCredits(plan.monthlyCredits)} credits per month`
  return [
    { text: credits, strong: true, included: true },
    { text: 'Both AI models — Pro & Max', included: true },
    ...FEATURE_CATALOG.map((f) => ({
      text: f.text,
      strong: f.strong,
      included: f.tiers.includes(plan.tier),
    })),
  ]
}

/* ── Icons ────────────────────────────────────────────────────────── */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l8 4v6c0 4.5-3.5 7.5-8 8-4.5-.5-8-3.5-8-8V7l8-4z" />
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
    </svg>
  )
}

function CycleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0115-6.7L21 8M21 12a9 9 0 01-15 6.7L3 16" />
      <path d="M21 3v5h-5M3 21v-5h5" />
    </svg>
  )
}

function GiftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M3 12h18M12 8v13M8 8a2.5 2.5 0 010-5c2 0 4 5 4 5M16 8a2.5 2.5 0 000-5c-2 0-4 5-4 5" />
    </svg>
  )
}

const PERKS = [
  {
    icon: <CycleIcon />,
    title: 'Cancel anytime',
    text: 'No contracts, no lock-ins. Switch plans or cancel from settings in one click.',
  },
  {
    icon: <BoltIcon />,
    title: 'Pro + Max models',
    text: 'Every paid plan unlocks both AI models — pick speed or maximum quality per render.',
  },
  {
    icon: <ShieldIcon />,
    title: 'Secure billing',
    text: 'All payments processed by Paddle, an EU-licensed merchant of record. PCI-compliant.',
  },
  {
    icon: <GiftIcon />,
    title: '15% bonus yearly',
    text: 'Pay annually and get 15% extra credits on top — same price-per-month, more renders.',
  },
]

export function ProPricingContent({ onStartTrial }) {
  const [annual, setAnnual] = useState(false)
  const [plans, setPlans] = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(null)
  const [checkoutError, setCheckoutError] = useState(null)
  const annualSavingsPct = useMemo(() => computeAnnualSavingsPct(), [])
  const queryClient = useQueryClient()
  const { user, getValidAccessToken } = useAuthStore()
  const { data: subscription } = useSubscriptionQuery()
  const activeTier = subscription?.tier
  const isAnnualActive = subscription?.billing_period === 'year'

  useEffect(() => {
    let alive = true
    getPlans()
      .then((data) => {
        if (alive) setPlans(data)
      })
      .catch(() => {
        if (alive) setPlans(null)
      })
    // Warm Paddle.js while the user is reading the pricing page so the
    // checkout iframe paints almost instantly when they click a plan.
    preloadPaddle()
    return () => {
      alive = false
    }
  }, [])

  // Post-Paddle-checkout return → kick the activation watcher and clean
  // the URL. The actual "You're Pro!" celebration fires from
  // `<ActivationListener>` once the subscription truly flips to active —
  // that way the celebration is honest (it lands when Pro actually unlocks,
  // not before the webhook has even reached the backend).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash || ''
    if (!hash.includes('checkout=success')) return
    refreshBillingState(queryClient)
    // Call store.start() directly instead of dispatching the window
    // event — React effect order fires children before parents, so
    // dispatching here would lose the race against AppShellLayout's
    // ActivationListener subscribe-effect. start() goes straight to
    // the Zustand store, which is order-independent. We still
    // dispatch the event so any other in-tree listener still fires.
    useSubscriptionActivationStore.getState().start()
    window.dispatchEvent(new CustomEvent('app:checkout-completed'))
    const cleanHash = hash.replace(/[?&]checkout=success/g, '')
    const newHash = cleanHash.endsWith('?') ? cleanHash.slice(0, -1) : cleanHash
    if (newHash !== hash) {
      window.history.replaceState(null, '', newHash || '#pro')
    }
  }, [queryClient])

  const findPriceId = (slug) => {
    if (!plans?.plans) return null
    const row = plans.plans.find((p) => p.slug === slug && p.is_active)
    return row?.paddle_price_id || null
  }

  const hasActiveSub =
    !!subscription && ['active', 'trialing', 'past_due'].includes(subscription.status)

  const isCurrentTier = (tier) =>
    activeTier === tier && ((annual && isAnnualActive) || (!annual && !isAnnualActive))

  const ctaLabelFor = (meta) => {
    if (checkoutLoading === meta.tier) return 'Loading…'
    if (isCurrentTier(meta.tier)) return 'Current plan'

    // Show "Scheduled" if this exact slug is the pending next-period change.
    const slug = `${meta.tier}_${annual ? 'annual' : 'monthly'}`
    if (subscription?.scheduled_plan_slug === slug) return 'Scheduled ✓'

    if (!user) return `Subscribe to ${meta.name}`

    const onPaddleSub = hasActiveSub && !subscription?.is_admin_granted
    if (onPaddleSub) {
      const rank = { starter: 0, creator: 1, ultimate: 2 }
      const targetRank = rank[meta.tier] ?? 0
      const currentRank = rank[activeTier] ?? 0

      // Same tier — only the billing period differs.
      if (meta.tier === activeTier) {
        return annual ? 'Switch to Annual' : 'Switch to Monthly'
      }
      return targetRank > currentRank ? `Upgrade to ${meta.name}` : `Downgrade to ${meta.name}`
    }
    return `Subscribe to ${meta.name}`
  }

  const handleCta = async (meta) => {
    setCheckoutError(null)
    if (!user) {
      onStartTrial?.()
      return
    }
    if (isCurrentTier(meta.tier)) return

    const slug = `${meta.tier}_${annual ? 'annual' : 'monthly'}`
    const priceId = findPriceId(slug)
    if (!priceId || priceId.startsWith('pri_placeholder_')) {
      setCheckoutError('Billing is not yet enabled. Please contact support.')
      return
    }

    setCheckoutLoading(meta.tier)
    try {
      const token = await getValidAccessToken()
      const onPaddleSub = hasActiveSub && !subscription?.is_admin_granted
      if (onPaddleSub) {
        const rank = { starter: 0, creator: 1, ultimate: 2 }
        const targetRank = rank[meta.tier] ?? 0
        const currentRank = rank[activeTier] ?? 0
        // Same tier: going annual is an upgrade (more value), going monthly is a downgrade.
        // Higher tier: always immediate. Lower tier: schedule for next period.
        const isUpgrade =
          targetRank > currentRank || (meta.tier === activeTier && annual && !isAnnualActive)
        const timing = isUpgrade ? 'immediate' : 'next_period'
        await changePlan(token, { planSlug: slug, timing })
        refreshBillingState(queryClient)
        if (timing === 'immediate') {
          // Kick burst polling so the sidebar credit count updates the moment
          // the Paddle webhook confirms credits have been refreshed.
          useSubscriptionActivationStore.getState().start()
        }
        celebrate(
          isUpgrade
            ? {
                emoji: meta.tier === 'ultimate' ? '👑' : '🚀',
                title:
                  meta.tier === activeTier ? `Switched to Annual!` : `Welcome to ${meta.name}!`,
                subtitle: 'Your plan is active. Credits will refresh in a moment.',
                variant: 'celebrate',
              }
            : {
                emoji: '✅',
                title: `Scheduled: ${meta.name}`,
                subtitle: 'Your plan switches at the end of the current billing period.',
                variant: 'success',
                confetti: false,
              }
        )
        return
      }
      const resp = await startCheckout(token, {
        priceId,
        successUrl: window.location.origin + '/#pro?checkout=success',
        cancelUrl: window.location.origin + '/#pro?checkout=canceled',
      })
      // Compute the actual charge Paddle will show at checkout.
      // Annual plans: price_usd in DB is the full-year amount; monthly display
      // is price_usd/12. We pass the full annual total to the order summary.
      const priceDisplay = getPriceDisplay(meta, annual)
      const annualTotal = annual ? meta.priceAnnual : null
      const totalDueAmount = annual ? annualTotal : meta.priceMonthly
      const totalDueDisplay =
        totalDueAmount != null && Number.isFinite(totalDueAmount)
          ? `$${totalDueAmount.toFixed(2)}`
          : (priceDisplay ?? '—')
      const expectedCredits = getCreditsFromCatalog(plans, meta.tier, annual) ?? 0
      sessionStorage.setItem(
        'clixa_checkout_session',
        JSON.stringify({
          type: 'subscription',
          transactionId: resp?.transaction_id,
          clientToken: resp?.client_token,
          checkoutUrl: resp?.checkout_url,
          planName: meta.name,
          planSlug: slug,
          tier: meta.tier,
          expectedCredits,
          priceDisplay,
          totalDueDisplay,
          cycle: annual ? 'annual' : 'monthly',
          cycleLabel: annual ? 'per month, billed annually' : 'per month',
        })
      )
      window.location.hash = 'checkout'
    } catch (e) {
      setCheckoutError(friendlyMessage(e) || 'Could not complete the request. Please try again.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="pro-hero">
        <span className="pro-eyebrow">Pricing</span>
        <h1 className="pro-hero-title">Choose your perfect plan</h1>
        <p className="pro-hero-sub">
          Credit-based pricing for every AI feature. Upgrade, downgrade, or cancel whenever — it's
          that simple.
        </p>

        <ActivatingProStrip hasActiveSub={hasActiveSub} />

        {checkoutError ? (
          <p role="alert" className="pro-checkout-error">
            {checkoutError}
          </p>
        ) : null}

        <div className="pro-billing">
          <ThumbPillTabs
            ariaLabel="Billing cycle"
            value={annual ? 'annual' : 'monthly'}
            onChange={(v) => setAnnual(v === 'annual')}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'annual', label: 'Annually' },
            ]}
          />
        </div>
        <p className="pro-billing-save" aria-hidden="true">
          <span className="pro-billing-save-pct">Save {annualSavingsPct}%</span>
          <span>when billed annually</span>
        </p>
        <p className="pro-no-card">No credit card required to sign up</p>
      </section>

      {/* Cards */}
      <section className="pro-cards" aria-label="Pricing plans">
        {TIER_ORDER.map((tier) => {
          const meta = PLAN_META[tier]
          const featured = tier === 'creator'
          const price = getPriceDisplay(meta, annual)
          const thumbs = annual ? meta.thumbsAnnual : meta.thumbsMonthly
          const credits = getCreditsFromCatalog(plans, tier, annual)
          const current = isCurrentTier(tier)
          const loading = checkoutLoading === tier
          // Build features using live credit counts when available
          const planForFeats = {
            ...meta,
            monthlyCredits:
              credits ?? (tier === 'starter' ? 1000 : tier === 'creator' ? 3000 : 9000),
            annualCredits:
              credits ?? (tier === 'starter' ? 13800 : tier === 'creator' ? 41400 : 124200),
          }
          const feats = buildFeatures(planForFeats, annual)

          const slug = `${meta.tier}_${annual ? 'annual' : 'monthly'}`
          const isScheduled = subscription?.scheduled_plan_slug === slug

          return (
            <div key={tier} className={`pro-card${featured ? ' pro-card--featured' : ''}`}>
              {featured ? <span className="pro-card-badge">Most popular</span> : null}

              <p className="pro-card-name">{meta.name}</p>

              <div className="pro-card-price">
                <span className="pro-card-amount">{price}</span>
                <span className="pro-card-period">/mo</span>
              </div>
              <p className="pro-card-billed">{annual ? 'Billed annually' : 'Billed monthly'}</p>

              <p className="pro-card-tagline">
                {meta.tagline} Up to <strong>{fmtNum(thumbs)} thumbnails</strong>{' '}
                {annual ? 'per year' : 'per month'}.
              </p>

              <button
                type="button"
                className={`pro-card-cta${current || isScheduled ? ' pro-card-cta--current' : ''}`}
                onClick={() => handleCta(meta)}
                disabled={current || isScheduled || loading || checkoutLoading !== null}
                aria-disabled={current || isScheduled || loading || checkoutLoading !== null}
              >
                {loading ? <span className="pro-card-cta-spinner" /> : null}
                {ctaLabelFor(meta)}
              </button>

              <ul className="pro-card-feats">
                {feats.map((f, i) => {
                  const isOff = f.included === false
                  return (
                    <li key={i} className={`pro-card-feat${isOff ? ' pro-card-feat--off' : ''}`}>
                      <span className="pro-card-feat-check" aria-hidden="true">
                        {isOff ? <CrossIcon /> : <CheckIcon />}
                      </span>
                      <span className="pro-card-feat-text">
                        {f.strong ? <strong>{f.text}</strong> : f.text}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </section>

      {/* Perks row */}
      <section className="pro-perks" aria-label="Plan benefits">
        {PERKS.map((p, i) => (
          <div key={i} className="pro-perk">
            <span className="pro-perk-icon" aria-hidden="true">
              {p.icon}
            </span>
            <div className="pro-perk-body">
              <span className="pro-perk-title">{p.title}</span>
              <span className="pro-perk-text">{p.text}</span>
            </div>
          </div>
        ))}
      </section>

      {/* Inline FAQ — same component the landing page uses, so the
          billing / credits / refund / trial answers stay in one place
          and never drift out of sync. The wrapper class lets the Pro
          screen tighten the section's vertical padding (the landing
          version reserves 7rem top/bottom which is too much inside
          a checkout-style screen). */}
      <div className="pro-faq-wrap">
        <Faq />
      </div>

      {/* Footer hint */}
      <p className="pro-footer">
        Have a question we didn't cover? <a href="mailto:support@clixa.app">support@clixa.app</a>
      </p>
    </>
  )
}

/**
 * Inline strip shown only while we're waiting for Paddle's webhook to land
 * after a successful checkout. Hides itself the moment the subscription
 * actually goes active (driven by `<ActivationListener>` flipping the
 * activation store off, plus the live subscription query). Sets honest
 * expectations during the seconds-long gap between Paddle confirm and the
 * backend grant — instead of showing an "everything's done!" toast next
 * to a UI that still says Free.
 */
function ActivatingProStrip({ hasActiveSub }) {
  const isActivating = useSubscriptionActivationStore((s) => s.isPending)
  if (!isActivating || hasActiveSub) return null
  return (
    <div className="pro-activating" role="status" aria-live="polite">
      <span className="pro-activating-spinner" aria-hidden="true" />
      <span>Finalizing your payment — Pro will unlock in a few seconds…</span>
    </div>
  )
}
