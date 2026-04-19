import './legal.css'

const BackIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="1.8">
    <path d="M13 4L7 10l6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function Terms({ onBack }) {
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
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-updated">Last updated: April 2026</p>
        </header>

        <div className="legal-content">
          <p>
            Welcome to Scriptz AI (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). By accessing or using our website, applications, and services (collectively, the &quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the Service.
          </p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By creating an account, signing in, or otherwise using Scriptz AI, you confirm that you have read, understood, and agree to these Terms and our Privacy Policy. You must be at least 18 years of age (or the age of majority in your jurisdiction) to use the Service. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            Scriptz AI provides AI-powered tools for YouTube creators, including but not limited to thumbnail generation, title and metadata optimization, and audience-growth insights. We reserve the right to modify, suspend, or discontinue any part of the Service at any time, with or without notice. We will not be liable to you or any third party for any such change.
          </p>

          <h2>3. Account Registration and Security</h2>
          <p>
            You must provide accurate, current, and complete information when registering. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorized use or breach of security.
          </p>

          <h2>4. Acceptable Use</h2>
          <p>
            You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:
          </p>
          <ul>
            <li>Use the Service in any way that violates applicable laws or regulations</li>
            <li>Infringe or misappropriate the intellectual property, publicity, likeness, or other rights of Scriptz AI or any third party</li>
            <li>Transmit malware, spam, or any harmful or illegal content</li>
            <li>Attempt to gain unauthorized access to the Service, other accounts, or our systems</li>
            <li>Use the Service to generate content that is defamatory, harassing, sexually explicit, or otherwise objectionable</li>
            <li>Resell, sublicense, or commercially exploit the Service except as expressly permitted</li>
          </ul>
          <p>
            We may suspend or terminate your account if we reasonably believe you have violated these Terms or applicable law.
          </p>

          <h2>4a. User-Uploaded Content</h2>
          <p>
            You retain ownership of content you upload to the Service (such as reference photos,
            product shots, or brand artwork). By uploading, you represent and warrant that{' '}
            <strong>
              you own the content you upload or have all the rights, licences, consents, and
              permissions necessary
            </strong>{' '}
            to use that content with the Service and to grant us the limited licence described
            in Section 5.
          </p>
          <p>You must not upload content that:</p>
          <ul>
            <li>
              Contains the likeness, face, voice, or other identifying characteristics of any
              real person (other than yourself) without that person&apos;s verifiable consent
            </li>
            <li>Depicts minors in any AI‑generation or likeness flow</li>
            <li>
              Infringes any copyright, trademark, right of publicity, right to privacy, or any
              other right of a third party
            </li>
            <li>
              Is obtained from search engines, social media, news sites, or stock libraries in
              violation of their terms
            </li>
          </ul>
          <p>
            You are solely responsible for the content you upload and the outputs you generate
            from it. Scriptz AI is not a service for impersonation, deepfakes, or creating the
            appearance that a real person said or did something they did not.
          </p>

          <h2>4b. No Impersonation of Real Individuals</h2>
          <p>
            The Service is intended for{' '}
            <strong>original and authorized content creation</strong>. You must not use the
            Service to:
          </p>
          <ul>
            <li>
              Create, generate, or publish imagery that impersonates, misrepresents, or falsely
              depicts any real public figure, celebrity, private individual, politician, or
              creator
            </li>
            <li>
              Produce content intended to deceive viewers into believing a real person endorsed,
              appeared in, or created the content when they did not
            </li>
            <li>
              Generate content that could reasonably be mistaken for an authentic recording,
              statement, or endorsement of a real person
            </li>
          </ul>
          <p>
            Reusable &quot;character looks&quot; saved in the Service must be built from reference
            material you own (for example, photos of yourself) or from AI‑generated originals
            that do not resemble a specific real individual. Violations of this section are
            considered a material breach of these Terms and may result in immediate account
            suspension or termination, and we reserve the right to report clear cases to the
            relevant platform or authority.
          </p>

          <h2>5. Intellectual Property</h2>
          <p>
            The Service, including its design, features, and content (excluding user-generated content), is owned by Scriptz AI or our licensors and is protected by copyright, trademark, and other laws. You retain ownership of content you create using the Service. By using the Service, you grant us a limited, non-exclusive, royalty-free license to use, process, and display your content solely to provide and improve the Service and as described in our Privacy Policy.
          </p>

          <h2>6. Subscription, Fees, and Billing</h2>
          <p>
            Some parts of the Service (subscriptions, credit packs) are subject to fees. By
            subscribing to a paid plan, you agree to pay all applicable fees. Subscription fees
            are billed in advance on a recurring basis (monthly or annually, depending on the
            plan you select) and renew automatically until cancelled. You may cancel at any
            time from your account settings; cancellation takes effect at the end of the
            current billing period.
          </p>
          <p>
            <strong>Merchant of Record.</strong> All payments are processed by{' '}
            <strong>Paddle.com Market Ltd</strong> (
            <a href="https://www.paddle.com/legal/terms" target="_blank" rel="noopener">
              paddle.com/legal/terms
            </a>
            ), which acts as our Merchant of Record. Paddle collects and remits applicable
            taxes (sales tax, VAT, GST, etc.) on our behalf and issues invoices and receipts in
            our name. By completing a purchase you also agree to Paddle&apos;s checkout terms.
            Scriptz AI does not store your full card details; only a customer reference and
            transaction status are shared with us.
          </p>
          <p>
            We may change our pricing with reasonable notice; continued use after a price
            change constitutes acceptance. Refund requests are handled in accordance with our{' '}
            <a href="#refund">Refund Policy</a>, which is incorporated into these Terms by
            reference.
          </p>

          <h2>7. Disclaimers</h2>
          <p>
            <strong>The Service is provided &quot;as is&quot; and &quot;as available&quot;</strong> without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components. AI-generated content may be inaccurate or unsuitable; you are responsible for reviewing and using such content appropriately.
          </p>

          <h2>8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Scriptz AI and its affiliates, officers, and employees shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, data, or goodwill, arising from your use of the Service. Our total liability for any claims related to the Service shall not exceed the amount you paid us in the twelve (12) months preceding the claim, or one hundred US dollars ($100), whichever is greater.
          </p>

          <h2>9. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Scriptz AI and its affiliates from any claims, damages, losses, or expenses (including reasonable attorneys&apos; fees) arising from your use of the Service, your violation of these Terms, or your violation of any third-party rights.
          </p>

          <h2>10. Termination</h2>
          <p>
            You may stop using the Service at any time. We may suspend or terminate your access at any time for any reason, including breach of these Terms. Upon termination, your right to use the Service ceases immediately. Sections that by their nature should survive (including Intellectual Property, Disclaimers, Limitation of Liability, and Indemnification) will survive termination.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you of material changes by posting the updated Terms on this page and updating the &quot;Last updated&quot; date. Your continued use of the Service after such changes constitutes acceptance of the revised Terms. If you do not agree, you must stop using the Service.
          </p>

          <h2>12. General</h2>
          <p>
            These Terms constitute the entire agreement between you and Scriptz AI regarding the Service. If any provision is found unenforceable, the remaining provisions will remain in effect. Our failure to enforce any right does not waive that right. These Terms are governed by the laws of the jurisdiction in which Scriptz AI operates, without regard to conflict of law principles.
          </p>

          <h2>13. Contact</h2>
          <p>
            For questions about these Terms of Service, please contact us at the contact information provided in the footer of our website or in our Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}
