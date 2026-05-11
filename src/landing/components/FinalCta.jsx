export function FinalCta() {
  return (
    <section className="fcta-section" aria-label="Final call to action">
      <div className="fcta-inner">
        <div className="fcta-card fcta-reveal">
          {/* Decorative orbs */}
          <div className="fcta-orb fcta-orb-1" />
          <div className="fcta-orb fcta-orb-2" />

          {/* Eyebrow */}
          <p className="fcta-eyebrow">
            <span className="fcta-star" aria-hidden="true">
              ✦
            </span>
            The opportunity is now
            <span className="fcta-star" aria-hidden="true">
              ✦
            </span>
          </p>

          {/* Headline */}
          <h2 className="fcta-h2">
            Say Goodbye to
            <br />
            <span className="fcta-h2-accent">10 of 10s</span>
          </h2>

          {/* Subheadline */}
          <p className="fcta-sub">Try Clixa AI for free and ship videos viewers actually click.</p>

          {/* Supporting text */}
          <p className="fcta-body">
            Generate original thumbnails, edit any region, brainstorm titles, and score every option
            — all in one workspace.
          </p>

          {/* CTA */}
          <a href="#signin" className="fcta-btn">
            Try for Free
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="10" x2="15" y2="10" />
              <polyline points="10 5 15 10 10 15" />
            </svg>
          </a>

          <p className="fcta-note">Free to try · No credit card required · Cancel anytime</p>
        </div>
      </div>
    </section>
  )
}
