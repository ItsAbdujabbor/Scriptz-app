const TILES = [
  {
    pos: 'top',
    img: '/aithumbnails.png',
    alt: 'AI generating original thumbnails from a text prompt',
    step: 'Step 01',
    title: 'AI Thumbnail Generator',
    text: 'Describe the idea in plain language, drop in references you own, and get original thumbnail options in seconds.',
  },
  {
    pos: 'bottom',
    img: '/recreatefromreference.png',
    alt: 'Remixing a reference thumbnail into a fresh take',
    step: 'Step 02',
    title: 'Recreate from a Reference',
    text: 'Drop in a thumbnail you have rights to, tell us your topic, and get a fresh take in your own style — no blank‑canvas paralysis.',
  },
  {
    pos: 'top',
    img: '/reusablevisuls.png',
    alt: 'Reusable visual styles applied across thumbnails',
    step: 'Step 03',
    title: 'Reusable Visual Styles',
    text: 'Save signature looks — colour, layout, type, vibe — and apply them to every new thumbnail so the channel stays unmistakably you.',
  },
]

export function Solution() {
  return (
    <section className="sol-section" id="solution" aria-labelledby="sol-heading">
      <div className="sol-inner">
        {/* Section header */}
        <div className="sol-header sol-reveal">
          <div className="sol-badge">
            <span className="sol-badge-dot" />
            What's inside the app
          </div>
          <h2 className="sol-h2" id="sol-heading">
            Built for thumbnails
            <br />
            <span className="sol-h2-accent">that earn the click</span>
          </h2>
          <p className="sol-lead">
            Generate, refine, title, and compare — every part of the click decision in one focused
            workspace.
          </p>
        </div>

        {/* BLOCK 1 — Create on-brand thumbnails */}
        <div className="sol-block">
          <div className="sol-block-label sol-reveal">
            <span className="sol-blk-num">01</span>
            <span className="sol-blk-title">Create on‑brand thumbnails</span>
          </div>

          <div className="sol-tile-grid">
            {TILES.map((t, i) => (
              <article key={i} className={`sol-tile sol-tile--${t.pos} sol-reveal`}>
                <img src={t.img} alt={t.alt} className="sol-tile-img" loading="lazy" />
                <div className={`sol-tile-shade sol-tile-shade--${t.pos}`} />
                <div className={`sol-tile-content sol-tile-content--${t.pos}`}>
                  <span className="sol-tile-step">{t.step}</span>
                  <h3 className="sol-tile-title">{t.title}</h3>
                  <p className="sol-tile-text">{t.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="sol-divider sol-reveal" />

        {/* BLOCK 2 — Refine, title, pick the winner */}
        <div className="sol-block">
          <div className="sol-block-label sol-reveal">
            <span className="sol-blk-num sol-blk-num--green">02</span>
            <span className="sol-blk-title">Refine, title, and pick the winner</span>
          </div>
          <div className="sol-block-head sol-reveal">
            <h3 className="sol-block-h3">
              Iterate in chat until
              <br />
              <span className="sol-h3-accent-green">it's the one to ship</span>
            </h3>
            <p className="sol-block-sub">
              Paint regions to refine, lock in your character, brainstorm strong titles, and score
              options side‑by‑side before you upload.
            </p>
          </div>

          <div className="sol-bento">
            {/* HERO — Region Editor (left, tall) */}
            <article className="sol-bento-card sol-bento-region sol-reveal sol-reveal-left">
              <img
                src="/regioneditor.png"
                alt="Painting a region of a thumbnail to regenerate"
                className="sol-bento-img"
                loading="lazy"
              />
              <span className="sol-bento-paint" aria-hidden="true" />
              <div className="sol-bento-shade sol-bento-shade--bottom" />
              <span className="sol-bento-pin">
                <span className="sol-bento-pin-dot" />
                Most used
              </span>
              <div className="sol-bento-content sol-bento-content--bottom">
                <h3 className="sol-bento-title">Region Editor</h3>
                <p className="sol-bento-text">
                  Paint a region, describe the change, and regenerate just that area — dial in the
                  exact look without re‑running the whole thumbnail.
                </p>
              </div>
            </article>

            {/* Top-right — Character looks */}
            <article className="sol-bento-card sol-bento-character sol-reveal sol-reveal-right">
              <img
                src="/characterlook.png"
                alt="On-brand visual character"
                className="sol-bento-img"
                loading="lazy"
              />
              <div className="sol-bento-shade sol-bento-shade--bottom" />
              <div className="sol-bento-content sol-bento-content--bottom">
                <h3 className="sol-bento-title">Character looks</h3>
                <p className="sol-bento-text">
                  Save a reusable visual character — from your own footage or AI‑generated — and
                  apply it across every thumbnail.
                </p>
              </div>
            </article>

            {/* Mid-right — Title Brainstorm */}
            <article className="sol-bento-card sol-bento-titles sol-reveal sol-reveal-right">
              <img
                src="/tittlebrainstorm.png"
                alt="Brainstorming title options"
                className="sol-bento-img"
                loading="lazy"
              />
              <div className="sol-bento-shade sol-bento-shade--top" />
              <div className="sol-bento-content sol-bento-content--top">
                <h3 className="sol-bento-title">Title Brainstorm</h3>
                <p className="sol-bento-text">
                  Generate 4, 8, or 12 scored title options in one click — pair the strongest title
                  with the strongest thumbnail before you upload.
                </p>
              </div>
            </article>

            {/* Wide banner — Thumbnail Analyzer */}
            <article className="sol-bento-card sol-bento-analyzer sol-reveal sol-reveal-up">
              <img
                src="/thumbnailanalyzer.png"
                alt="Thumbnail analyzer scorecard"
                className="sol-bento-img"
                loading="lazy"
              />
              <div className="sol-bento-shade sol-bento-shade--right" />
              <div className="sol-bento-meter" aria-hidden="true">
                <svg className="sol-bento-meter-ring" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" className="sol-bento-meter-track" />
                  <circle cx="40" cy="40" r="34" className="sol-bento-meter-bar" />
                </svg>
                <span className="sol-bento-meter-num">87</span>
                <span className="sol-bento-meter-label">click score</span>
              </div>
              <div className="sol-bento-content sol-bento-content--left">
                <h3 className="sol-bento-title">Thumbnail Analyzer</h3>
                <p className="sol-bento-text">
                  Score and compare thumbnails side‑by‑side — clarity, emotion, and click potential
                  — so you ship the version viewers will actually click.
                </p>
              </div>
            </article>
          </div>
        </div>

        {/* Divider */}
        <div className="sol-divider sol-reveal" />
      </div>
    </section>
  )
}
