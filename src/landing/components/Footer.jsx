export function Footer() {
  return (
    <footer className="ftr-footer" role="contentinfo">
      <div className="ftr-inner">
        {/* Top: logo + columns */}
        <div className="ftr-top">
          {/* Brand column */}
          <div className="ftr-brand">
            <a href="." className="ftr-logo" aria-label="Clixa AI">
              <img src="/clixalogo.jpg" alt="" className="ftr-logo-mark" />
              <span className="ftr-logo-text">Clixa AI</span>
            </a>
            <p className="ftr-tagline">
              AI thumbnails, edits, and title brainstorms
              <br />
              for YouTube creators.
            </p>
          </div>

          {/* Col 1: Product */}
          <nav className="ftr-col" aria-label="Product">
            <p className="ftr-col-title">Product</p>
            <ul className="ftr-links">
              <li>
                <a href="#solution" className="ftr-link">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="ftr-link">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#faq" className="ftr-link">
                  FAQ
                </a>
              </li>
            </ul>
          </nav>

          {/* Col 2: Account */}
          <nav className="ftr-col" aria-label="Account">
            <p className="ftr-col-title">Account</p>
            <ul className="ftr-links">
              <li>
                <a href="#login" className="ftr-link">
                  Log in
                </a>
              </li>
              <li>
                <a href="#register" className="ftr-link">
                  Start free trial
                </a>
              </li>
            </ul>
          </nav>

          {/* Col 3: Legal */}
          <nav className="ftr-col" aria-label="Legal">
            <p className="ftr-col-title">Legal</p>
            <ul className="ftr-links">
              <li>
                <a href="#terms" className="ftr-link">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#privacy" className="ftr-link">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#refund" className="ftr-link">
                  Refund Policy
                </a>
              </li>
            </ul>
          </nav>

          {/* Col 4: Contact */}
          <nav className="ftr-col" aria-label="Contact">
            <p className="ftr-col-title">Contact</p>
            <ul className="ftr-links">
              <li>
                <a href="mailto:support@clixa.app" className="ftr-link">
                  support@clixa.app
                </a>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="ftr-bottom">
          <p className="ftr-copy">© Clixa AI. All rights reserved.</p>

          <div className="ftr-socials">
            {/* Instagram — @clixa.ai */}
            <a
              href="https://www.instagram.com/clixa.ai/"
              className="ftr-social"
              aria-label="Instagram @clixa.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </a>

            {/* TikTok — @clixa.ai */}
            <a
              href="https://www.tiktok.com/@clixa.ai"
              className="ftr-social"
              aria-label="TikTok @clixa.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19.6 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.93a8.16 8.16 0 0 0 4.77 1.52V7a4.85 4.85 0 0 1-1.83-.31z" />
              </svg>
            </a>

            {/* YouTube — @ClixaAI (hidden until the channel has content) */}
            <a
              href="https://www.youtube.com/@ClixaAI"
              className="ftr-social"
              aria-label="YouTube @ClixaAI"
              target="_blank"
              rel="noopener noreferrer"
              hidden
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z" />
                <polygon
                  points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
