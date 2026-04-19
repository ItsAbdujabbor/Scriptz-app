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

export function PrivacyPolicy({ onBack }) {
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
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-updated">Last updated: April 2026</p>
        </header>

        <div className="legal-content">
          <p>
            Scriptz AI (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to
            protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and
            safeguard your information when you use our website, applications, and services (the
            &quot;Service&quot;). By using the Service, you consent to the practices described in
            this policy.
          </p>

          <h2>1. Information We Collect</h2>
          <p>
            We collect information that you provide directly to us, that we obtain automatically
            when you use the Service, and that we receive from third parties where applicable.
          </p>
          <h3>Information you provide</h3>
          <ul>
            <li>
              <strong>Account data:</strong> email address, password (stored in hashed form), and
              optionally username when you register or sign in.
            </li>
            <li>
              <strong>Profile and usage data:</strong> content you create (e.g. thumbnails, prompts,
              saved visual characters), settings, and how you use the Service.
            </li>
            <li>
              <strong>Billing data:</strong> when you subscribe or purchase credits, our payment
              processor (see §3) collects your name, billing address, tax/VAT ID where applicable,
              and payment instrument details. Scriptz AI receives only a customer reference,
              transaction status, and non-sensitive summary data — we{' '}
              <strong>never store full card numbers, CVV, or bank details</strong>.
            </li>
            <li>
              <strong>Uploaded content:</strong> images you upload as reference material for
              thumbnail generation. You confirm at upload time that you own these materials or have
              the rights to use them.
            </li>
            <li>
              <strong>Communications:</strong> messages you send to us (e.g. support requests or
              feedback).
            </li>
          </ul>
          <h3>Information collected automatically</h3>
          <ul>
            <li>
              <strong>Device and log data:</strong> IP address, browser type, operating system,
              device identifiers, and access times.
            </li>
            <li>
              <strong>Cookies and similar technologies:</strong> we use cookies and similar
              technologies to maintain sessions, remember preferences, and analyze usage. You can
              manage cookie settings in your browser.
            </li>
          </ul>
          <h3>Third-party data</h3>
          <p>
            If you connect a YouTube or other third-party account, we may receive information that
            you authorize (e.g. channel ID, basic profile) to provide features like analytics or
            content suggestions.
          </p>

          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, operate, maintain, and improve the Service</li>
            <li>Authenticate your identity and manage your account</li>
            <li>
              Process your requests and deliver AI-generated content (e.g. scripts, thumbnails)
            </li>
            <li>Send you service-related notices, updates, and support messages</li>
            <li>Analyze usage and trends to improve our product and user experience</li>
            <li>Detect, prevent, and address fraud, abuse, or security issues</li>
            <li>Comply with legal obligations and enforce our Terms of Service</li>
            <li>With your consent, send marketing communications (you may opt out at any time)</li>
          </ul>

          <h2>3. How We Share Your Information</h2>
          <p>
            We do not sell your personal information. We may share your information in the following
            circumstances:
          </p>
          <ul>
            <li>
              <strong>Service providers (subprocessors):</strong> with vendors who help us operate
              the Service, under contracts that limit their use of your data. Current core
              subprocessors include:
              <ul>
                <li>
                  <strong>Paddle.com Market Ltd</strong> — Merchant of Record for all paid
                  subscriptions and credit packs. Paddle collects your billing information directly,
                  processes your payment, handles sales tax / VAT collection and remittance where
                  required, and transmits a transaction reference back to Scriptz AI. Paddle's
                  privacy notice is available at{' '}
                  <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener">
                    paddle.com/legal/privacy
                  </a>
                  .
                </li>
                <li>
                  <strong>Supabase</strong> — authentication and account database.
                </li>
                <li>
                  <strong>OpenAI</strong> — AI image generation on your prompts. Prompts and
                  reference images you submit are transmitted to OpenAI per their API policy; we do
                  not allow training on your data.
                </li>
                <li>
                  <strong>Google (YouTube Data API)</strong> — when you connect your channel, with
                  scopes you explicitly authorise.
                </li>
                <li>
                  <strong>AWS</strong> — cloud hosting (compute, storage, CDN) located in the
                  regions noted in our hosting documentation.
                </li>
              </ul>
            </li>
            <li>
              <strong>Legal and safety:</strong> when required by law, court order, or government
              request, or to protect the rights, property, or safety of Scriptz AI, our users, or
              the public.
            </li>
            <li>
              <strong>Business transfers:</strong> in connection with a merger, acquisition, or sale
              of assets, subject to the same privacy commitments.
            </li>
            <li>
              <strong>With your consent:</strong> when you have given us explicit permission to
              share your information.
            </li>
          </ul>

          <h2>3a. Payment Processing (Paddle — Merchant of Record)</h2>
          <p>
            Scriptz AI uses <strong>Paddle.com Market Ltd</strong> as its Merchant of Record for all
            paid subscriptions, recurring renewals, and one‑time credit pack purchases. That means:
          </p>
          <ul>
            <li>
              When you complete a purchase, your payment details (card number, billing address, tax
              details) are entered into Paddle's hosted checkout and are collected, stored, and
              processed by Paddle — not by Scriptz AI.
            </li>
            <li>
              Paddle handles sales tax, VAT, GST, and equivalent transaction taxes on our behalf and
              remits them to the relevant authorities.
            </li>
            <li>Your invoice, receipts, and renewal emails are issued by Paddle under our name.</li>
            <li>
              Scriptz AI receives a customer ID, subscription status, and transaction metadata back
              from Paddle so we can grant and manage your account entitlements.
            </li>
          </ul>
          <p>
            Paddle is an independent data controller for the payment data it processes. Its privacy
            practices are governed by{' '}
            <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener">
              Paddle's Privacy Notice
            </a>
            . For refund requests, invoice corrections, or billing disputes, please contact us first
            (see §10) — we coordinate with Paddle on your behalf.
          </p>

          <h2>4. Data Retention</h2>
          <p>
            We retain your account data and content for as long as your account is active. After you
            delete your account, we may retain certain information as needed for legal, security, or
            operational purposes (e.g. fraud prevention, dispute resolution) for a limited period,
            after which it is deleted or anonymized. Log and analytics data may be retained in
            aggregated or anonymized form.
          </p>

          <h2>5. Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal
            information against unauthorized access, alteration, disclosure, or destruction. This
            includes encryption in transit and at rest where applicable, access controls, and
            regular security assessments. No method of transmission or storage is 100% secure; we
            cannot guarantee absolute security.
          </p>

          <h2>6. Your Rights and Choices</h2>
          <p>Depending on your location, you may have the right to:</p>
          <ul>
            <li>
              <strong>Access and portability:</strong> request a copy of the personal data we hold
              about you.
            </li>
            <li>
              <strong>Correction:</strong> request correction of inaccurate or incomplete data.
            </li>
            <li>
              <strong>Deletion:</strong> request deletion of your personal data, subject to legal
              exceptions.
            </li>
            <li>
              <strong>Restriction or objection:</strong> object to or request restriction of certain
              processing.
            </li>
            <li>
              <strong>Withdraw consent:</strong> where we rely on consent, you may withdraw it at
              any time.
            </li>
            <li>
              <strong>Opt out of marketing:</strong> unsubscribe from promotional emails via the
              link in each email or in your account settings.
            </li>
          </ul>
          <p>
            To exercise these rights, contact us using the details below. If you are in the European
            Economic Area or the UK, you also have the right to lodge a complaint with a supervisory
            authority.
          </p>

          <h2>7. International Transfers</h2>
          <p>
            Your information may be processed in countries other than your country of residence. We
            ensure appropriate safeguards (e.g. standard contractual clauses) are in place where
            required by applicable law for such transfers.
          </p>

          <h2>8. Children</h2>
          <p>
            The Service is not intended for users under 18 (or the age of majority in your
            jurisdiction). We do not knowingly collect personal information from children. If you
            believe we have collected such information, please contact us and we will delete it
            promptly.
          </p>

          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will post the revised policy on
            this page and update the &quot;Last updated&quot; date. For material changes, we may
            provide additional notice (e.g. by email or in-product notice). Your continued use of
            the Service after the effective date constitutes acceptance of the updated policy.
          </p>

          <h2>10. Contact Us</h2>
          <p>
            For questions about this Privacy Policy or our privacy practices, or to exercise your
            rights, please contact us at the contact information provided in the footer of our
            website (e.g. support@scriptz.ai or the contact form linked from our site).
          </p>
        </div>
      </div>
    </div>
  )
}
