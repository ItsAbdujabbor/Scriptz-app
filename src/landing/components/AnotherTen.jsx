const PROBLEMS = [
  {
    n: '01',
    color: 'red',
    flip: false,
    img: '/landing1.png',
    alt: 'YouTube feed showing thumbnails being scrolled past',
    chipVal: '2.1%',
    chipLbl: 'avg. CTR',
    titleA: 'Nobody Notices',
    titleB: 'Your Thumbnail',
    desc: 'Your thumbnail disappears in the feed. Generic stock looks, weak focal points, no consistent on‑brand identity — viewers scroll past eight others before yours gets a chance. Great content dies behind a forgettable cover.',
    factNum: '94%',
    factLabel: 'of video clicks are decided by the thumbnail alone — before a single second plays',
    tags: ['Low CTR', 'Off‑brand looks', 'Missed impressions'],
    aria: 'Problem: Thumbnail invisibility',
  },
  {
    n: '02',
    color: 'amber',
    flip: true,
    img: '/landing2.png',
    alt: 'Empty title field on a YouTube upload screen',
    chipVal: '11/100',
    chipLbl: 'title score',
    titleA: "Titles That Don't",
    titleB: 'Earn the Click',
    desc: 'A strong thumbnail still loses without the right title. Most creators stare at the upload screen, ship something generic, and leave the second half of the click decision on the table.',
    factNum: '2×',
    factLabel: 'CTR uplift when a strong title pairs with a strong thumbnail vs. either alone',
    tags: ['Vague hooks', 'Generic phrasing', 'Lower click‑through'],
    aria: 'Problem: Weak titles',
  },
  {
    n: '03',
    color: 'purple',
    flip: false,
    img: '/landing3.png',
    alt: 'Creator at a cluttered desk late at night with Photoshop and Canva open',
    chipVal: '6h+',
    chipLbl: 'per thumbnail',
    titleA: 'Hours Lost in',
    titleB: 'Photoshop & Canva',
    desc: 'Cutouts, layers, fonts, freelancer feedback rounds — making one thumbnail eats half a day. Tweaking just one corner of a finished thumbnail means re‑opening the whole project, and small fixes pile into long nights.',
    factNum: '6h+',
    factLabel: 'average time creators spend on a single thumbnail using traditional design tools',
    tags: ['Hours wasted', 'Delayed publishing', 'Lost momentum'],
    aria: 'Problem: Slow workflows',
  },
  {
    n: '04',
    color: 'blue',
    flip: true,
    img: '/landing4.png',
    alt: 'Multiple thumbnail draft options laid out for a creator to choose from',
    chipVal: '12%',
    chipLbl: 'use real data',
    titleA: 'Picking Thumbnails',
    titleB: 'on Gut Feeling',
    desc: 'You stare at four drafts and pick the one that "looks nice." No score, no benchmark, no idea which one a viewer is actually going to click. Every upload is a coin flip — and the bad picks rarely come back.',
    factNum: '88%',
    factLabel:
      'of creators rely on gut instinct rather than data when choosing thumbnails and titles',
    tags: ['No data', 'Gut instinct', 'Inconsistent results'],
    aria: 'Problem: Guessing',
  },
]

export function AnotherTen() {
  return (
    <section className="a10-section" id="another-10" aria-labelledby="a10-heading">
      <div className="a10-inner">
        {/* Header */}
        <div className="a10-header">
          <div className="a10-badge a10-reveal">
            <span className="a10-badge-dot" />
            Another 10 of 10
          </div>
          <h2 className="a10-h2 a10-reveal" id="a10-heading">
            Your Videos Don't Get
            <br />
            <span className="a10-h2-accent">the Views They Deserve</span>
          </h2>
          <p className="a10-lead a10-reveal">
            It's not the algorithm. It's not your content.
            <br />
            It's the packaging. If people don't click, they don't watch.
          </p>
        </div>

        {/* Cards (alternating layout) */}
        <div className="a10-cards">
          {PROBLEMS.map((p) => (
            <article
              key={p.n}
              className={`a10-card a10-reveal${p.flip ? ' a10-card--flip' : ''}`}
              aria-label={p.aria}
            >
              <div className="a10-card-visual">
                <img src={p.img} alt={p.alt} className="a10-card-img" loading="lazy" />
                <div className="a10-card-visual-badge">
                  <span className={`a10-vbadge-dot a10-vbadge-${p.color}`} />
                  Problem {p.n}
                </div>
                <div className={`a10-card-stat-chip a10-chip-${p.color}`}>
                  <span className="a10-chip-val">{p.chipVal}</span>
                  <span className="a10-chip-lbl">{p.chipLbl}</span>
                </div>
              </div>
              <div className="a10-card-content">
                <div className={`a10-card-step a10-step-${p.color}`}>{p.n}</div>
                <h3 className="a10-card-title">
                  {p.titleA}
                  <br />
                  {p.titleB}
                </h3>
                <p className="a10-card-desc">{p.desc}</p>
                <div className="a10-card-fact">
                  <span className="a10-fact-num">{p.factNum}</span>
                  <span className="a10-fact-label">{p.factLabel}</span>
                </div>
                <div className="a10-card-tags">
                  {p.tags.map((t) => (
                    <span key={t} className="a10-tag">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
