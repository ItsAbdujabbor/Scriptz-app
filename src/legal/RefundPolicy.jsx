import './legal.css'

const BackIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    width="14"
    height="14"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M13 4L7 10l6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function RefundPolicy({ onBack }) {
  const handleBack = (e) => {
    e.preventDefault()
    if (onBack) onBack()
    else window.history.back()
  }

  return (
    <div className="legal-screen">
      <div className="legal-aura" aria-hidden="true" />
      <div className="legal-inner">
        <a href="#" className="legal-back" onClick={handleBack} aria-label="Back">
          <BackIcon />
          Back
        </a>

        <header className="legal-header">
          <h1 className="legal-title">Refund Policy</h1>
          <p className="legal-updated">Last updated: April 2026</p>
        </header>

        <div className="legal-content">
          <p>
            This Refund Policy explains when and how you can request a refund for purchases made on
            Scriptz AI (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). By subscribing to a
            paid plan or purchasing credits you agree to the terms below. This policy should be read
            together with our <a href="#terms">Terms of Service</a> and{' '}
            <a href="#privacy">Privacy Policy</a>.
          </p>
          <p>
            <strong>Merchant of Record.</strong> All Scriptz AI payments are processed by{' '}
            <strong>Paddle.com Market Ltd</strong>, which acts as our Merchant of Record. Paddle
            handles the transaction, collects applicable taxes, and is the party named on your card
            or bank statement. Approved refunds are issued by Paddle back to your original payment
            method.
          </p>

          <h2>1. General Policy</h2>
          <p>
            Scriptz AI provides digital, AI-powered services that incur immediate compute costs the
            moment they are used. For this reason, fees paid for subscriptions and credit packs are
            generally <strong>non-refundable</strong> once the billing period has started or credits
            have been consumed, except as expressly stated in this policy or required by applicable
            law.
          </p>

          <h2>2. Subscription Plans</h2>
          <p>
            Subscription fees are billed in advance on a recurring basis (monthly or annually,
            depending on the plan you selected).
          </p>
          <ul>
            <li>
              <strong>14-day satisfaction window (new subscribers).</strong> If you subscribe to a
              paid plan for the first time and are unsatisfied, you may request a full refund within
              14 days of the original charge, provided you have consumed less than 20% of the credit
              allowance for that period.
            </li>
            <li>
              <strong>Annual plans — prorated refunds.</strong> Cancellations of annual plans after
              the 14-day window receive a prorated refund for the unused, unbilled months minus any
              credits already consumed beyond the monthly allowance.
            </li>
            <li>
              <strong>Monthly plans — no mid-cycle refunds.</strong> Cancelled monthly subscriptions
              remain active until the end of the current billing period. No prorated refund is
              issued for partial months.
            </li>
            <li>
              <strong>Renewals.</strong> Recurring renewal charges are not refundable after the
              14-day window has passed for that renewal period. Please cancel before the renewal
              date to avoid being billed.
            </li>
          </ul>

          <h2>3. Credit Packs</h2>
          <p>
            One-time credit pack purchases are <strong>non-refundable</strong> once any credits from
            the pack have been consumed. Unused credit packs may be refunded in full within 7 days
            of purchase by contacting support.
          </p>

          <h2>4. Free Trial</h2>
          <p>
            If you started with a free trial, you will not be charged during the trial period. You
            can cancel at any time before the trial ends to avoid being billed. Once the trial
            converts into a paid subscription, the 14-day satisfaction window in Section 2 applies.
          </p>

          <h2>5. AI-Generated Content</h2>
          <p>
            Credits spent on AI generation (thumbnails, titles, scripts, SEO optimisations, A/B
            tests, etc.) are{' '}
            <strong>not refundable once the generation has completed successfully</strong>,
            regardless of whether you choose to use the result. If a generation fails due to a
            verified error on our side (e.g. provider outage, server error), credits are
            automatically refunded to your balance; if they are not, contact support within 7 days
            and we will restore them.
          </p>

          <h2>6. Exceptions — Technical Issues & Duplicate Charges</h2>
          <p>
            We will issue a full refund in the following cases, regardless of the 14-day window:
          </p>
          <ul>
            <li>Duplicate charges for the same subscription period or credit pack.</li>
            <li>
              A verified platform outage that prevented you from using substantially all paid
              features for more than 24 consecutive hours during the billing period.
            </li>
            <li>
              Unauthorised charges due to fraud, provided you notify us promptly and cooperate with
              our investigation.
            </li>
          </ul>

          <h2>7. How to Request a Refund</h2>
          <p>
            Send your refund request from the email address associated with your Scriptz AI account.
            Include:
          </p>
          <ul>
            <li>The email on your account.</li>
            <li>The date and amount of the charge.</li>
            <li>A brief reason for the request.</li>
          </ul>
          <p>
            Contact us at the email listed in the footer of our website, or through the Help section
            of our <a href="#privacy">Privacy Policy</a>. We aim to respond within 3 business days.
            Once a refund is approved, Paddle (our Merchant of Record) processes the refund back to
            your original payment method, typically within 5–10 business days — timing depends on
            your bank or card issuer.
          </p>

          <h2>8. Chargebacks</h2>
          <p>
            If you believe you were charged in error, please contact us first — we will work with
            you quickly to resolve the issue. Initiating a chargeback without first contacting
            support may result in suspension or termination of your account while the dispute is
            investigated, in accordance with our <a href="#terms">Terms of Service</a>.
          </p>

          <h2>9. Taxes</h2>
          <p>
            Where applicable, refunds will include any sales tax, VAT, or GST that was charged on
            the original invoice. Currency conversion fees applied by your bank or card issuer are
            not refundable by Scriptz AI.
          </p>

          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Refund Policy from time to time. Material changes will be posted on
            this page with an updated &quot;Last updated&quot; date. Your continued use of the
            Service after such changes constitutes acceptance of the revised policy. For the
            avoidance of doubt, refund eligibility for existing purchases is governed by the policy
            that was in effect at the time of purchase.
          </p>

          <h2>11. Contact</h2>
          <p>
            For refund requests or questions about this Refund Policy, please contact us using the
            contact information provided in the footer of our website or in our{' '}
            <a href="#privacy">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
