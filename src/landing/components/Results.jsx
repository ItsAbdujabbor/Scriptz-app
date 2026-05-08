function ArcGraphic() {
  // Rising trajectory arrow with glowing tip — used in poster 1 (amber).
  return (
    <svg
      className="res-poster-graphic res-graphic-arc"
      viewBox="0 0 200 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <circle className="res-graphic-trail" cx="20" cy="86" />
      <circle className="res-graphic-trail" cx="52" cy="76" />
      <circle className="res-graphic-trail" cx="86" cy="58" />
      <circle className="res-graphic-trail" cx="124" cy="36" />
      <path className="res-graphic-arrow" d="M 20 86 C 60 86, 90 30, 168 16" />
      <circle className="res-graphic-tip" cx="168" cy="16" />
    </svg>
  )
}

function BarsGraphic() {
  // Three ascending bars — used in poster 2 (green).
  return (
    <div className="res-poster-graphic res-graphic-bars" aria-hidden="true">
      <span className="res-graphic-bar" style={{ '--h': '38%' }} />
      <span className="res-graphic-bar" style={{ '--h': '68%' }} />
      <span className="res-graphic-bar" style={{ '--h': '100%' }} />
    </div>
  )
}

function StarsGraphic() {
  // 10 stars, 8 lit, 2 dim — used in poster 3 (violet).
  return (
    <div className="res-poster-graphic res-graphic-stars" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className={`res-graphic-star${i < 8 ? ' is-on' : ''}`} />
      ))}
    </div>
  )
}

export function Results() {
  return (
    <section className="res-section" id="results" aria-labelledby="res-heading">
      <div className="res-inner">
        {/* Header */}
        <div className="res-header res-reveal">
          <div className="res-badge">
            <span className="res-badge-dot" />
            Real Results
          </div>
          <h2 className="res-h2" id="res-heading">
            Turn Better Packaging
            <br />
            <span className="res-h2-accent">Into Real Results</span>
          </h2>
          <p className="res-lead">
            More impressions, more clicks, more views,
            <br />
            and more revenue.
          </p>
        </div>

        {/* Poster grid */}
        <div className="res-grid">
          {/* Poster 1 — Amber — +40% CTR lift */}
          <article
            className="res-poster res-poster--amber res-reveal"
            aria-label="Result: Turn Underperformers Into Winners"
          >
            <div className="res-poster-head">
              <img
                src="/40ctr.png"
                alt="Analytics dashboard showing improving CTR"
                className="res-poster-bg"
                loading="lazy"
              />
              <div className="res-poster-shade" />
              <ArcGraphic />
              <div className="res-poster-stat">
                <span className="res-poster-num">+40%</span>
                <span className="res-poster-label">Avg. CTR lift</span>
              </div>
            </div>
            <div className="res-poster-body">
              <h3 className="res-poster-title">Turn Underperformers Into Winners</h3>
              <p className="res-poster-text">
                Never let another video flatline. Iterate on thumbnails and titles in chat until
                viewers actually click — no design tools, no guesswork.
              </p>
              <div className="res-poster-tags">
                <span className="res-tag">Stronger Titles</span>
                <span className="res-tag">CTR Boost</span>
              </div>
            </div>
          </article>

          {/* Poster 2 — Green — 3× more views */}
          <article
            className="res-poster res-poster--green res-reveal"
            aria-label="Result: Clicks Compound Into Revenue"
          >
            <div className="res-poster-head">
              <img
                src="/3x.png"
                alt="Revenue and growth chart"
                className="res-poster-bg"
                loading="lazy"
              />
              <div className="res-poster-shade" />
              <BarsGraphic />
              <div className="res-poster-stat">
                <span className="res-poster-num">
                  3<span className="res-poster-num-suffix">×</span>
                </span>
                <span className="res-poster-label">More views</span>
              </div>
            </div>
            <div className="res-poster-body">
              <h3 className="res-poster-title">Clicks Compound Into Revenue</h3>
              <p className="res-poster-text">
                Better thumbnails and titles drive more clicks. More clicks turn into more views,
                subscribers, and revenue — compounding over time.
              </p>
              <div className="res-poster-tags">
                <span className="res-tag">More Subscribers</span>
                <span className="res-tag">Ad Revenue</span>
                <span className="res-tag">Channel Growth</span>
              </div>
            </div>
          </article>

          {/* Poster 3 — Violet — 8 of 10 videos perform */}
          <article
            className="res-poster res-poster--violet res-reveal"
            aria-label="Result: Winning Becomes the Norm"
          >
            <div className="res-poster-head">
              <img
                src="/8outof10.png"
                alt="Channel team celebrating consistent results"
                className="res-poster-bg"
                loading="lazy"
              />
              <div className="res-poster-shade" />
              <StarsGraphic />
              <div className="res-poster-stat">
                <span className="res-poster-num">
                  8<span className="res-poster-num-divider">/</span>
                  <span className="res-poster-num-denom">10</span>
                </span>
                <span className="res-poster-label">Videos perform</span>
              </div>
            </div>
            <div className="res-poster-body">
              <h3 className="res-poster-title">Winning Becomes the Norm</h3>
              <p className="res-poster-text">
                Top-performing videos stop being rare. With on-brand thumbnails, scored titles, and
                a side-by-side analyzer, hits become the norm — not the exception.
              </p>
              <div className="res-poster-tags">
                <span className="res-tag">Consistent CTR</span>
                <span className="res-tag">Scored Picks</span>
                <span className="res-tag">Predictable Growth</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
