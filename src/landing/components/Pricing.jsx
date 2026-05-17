/**
 * Pricing — landing-page section that mounts the in-app Pro pricing UI
 * directly. Single source of truth: the same `<ProPricingContent>`
 * the authenticated `#pro` screen renders, wrapped in
 * `.pro-pricing-host` so the new ProScreen design tokens (CSS vars
 * for the violet palette + text shades) resolve in this context.
 *
 * The host wrapper carries an `id="pricing"` anchor so the landing
 * header nav-link still scrolls here.
 */
import { ProPricingContent } from '../../app/ProPricingContent'
import '../../app/ProScreen.css'

export function Pricing({ billingPeriod, onBillingPeriodChange }) {
  return (
    <section id="pricing" className="pro-pricing-host landing-pricing-wrap" aria-label="Pricing">
      <div className="pro-screen-inner">
        <ProPricingContent
          billingPeriod={billingPeriod}
          onBillingPeriodChange={onBillingPeriodChange}
          onStartTrial={() => {
            if (typeof window !== 'undefined') window.location.hash = 'register'
          }}
        />
      </div>
    </section>
  )
}
