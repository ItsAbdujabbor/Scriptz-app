const STAR_PATH =
  'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z'

function Star() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d={STAR_PATH} />
    </svg>
  )
}

function FiveStars({ ariaLabel }) {
  return (
    <div className="sp-stars" {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} />
      ))}
    </div>
  )
}

const REVIEWS = [
  {
    title: '"Truly shocked by the quality"',
    text: "The first AI tool that actually creates thumbnails worthy of YouTube. The quality difference is night and day compared to anything else I've tried.",
    name: 'Youssef Ayman',
    country: '🇦🇪 UAE',
    avatarName: 'Youssef+Ayman',
    avatarBg: '6366f1',
  },
  {
    title: '"One of the most effective thumbnail generators"',
    text: 'I tested several other AI tools. This tool is surprisingly accurate and produces results that actually look like professional YouTube thumbnails.',
    name: 'Rex Freiberger',
    country: '🇺🇸 US',
    avatarName: 'Rex+Freiberger',
    avatarBg: '10b981',
  },
  {
    title: '"A huge time saver for creators"',
    text: 'It saves hours of design work and helps visualize ideas instantly. I now spend my time on content instead of fighting with design tools.',
    name: 'neoxvisions',
    country: '🇩🇪 Germany',
    avatarName: 'Neo+X',
    avatarBg: '38bdf8',
  },
]

function Review({ review, decorative }) {
  return (
    <article className="sp-review" {...(decorative ? { 'aria-hidden': 'true' } : {})}>
      <FiveStars ariaLabel={decorative ? undefined : '5 out of 5 stars'} />
      <h3 className="sp-review-title">{review.title}</h3>
      <p className="sp-review-text">{review.text}</p>
      <div className="sp-review-footer">
        <img
          src={`https://ui-avatars.com/api/?name=${review.avatarName}&background=${review.avatarBg}&color=fff&size=96&bold=true`}
          alt={decorative ? '' : `${review.name} avatar`}
          className="sp-avatar"
          loading="lazy"
        />
        <div className="sp-author">
          <span className="sp-author-name">{review.name}</span>
          <span className="sp-author-country">{review.country}</span>
        </div>
      </div>
    </article>
  )
}

export function SocialProof() {
  return (
    <section className="sp-section" id="social-proof" aria-labelledby="sp-heading">
      <div className="sp-inner">
        {/* Header */}
        <div className="sp-header sp-reveal">
          <div className="sp-badge">
            <span className="sp-badge-dot" />
            Social Proof
          </div>
          <h2 className="sp-h2" id="sp-heading">
            Don't Just Take
            <br />
            <span className="sp-h2-accent">Our Word For It</span>
          </h2>
          <p className="sp-lead">See what creators say about Clixa AI.</p>
        </div>

        {/* Testimonials — infinite marquee carousel */}
        <div
          className="sp-marquee sp-reveal"
          role="region"
          aria-label="Customer reviews"
          aria-roledescription="carousel"
        >
          <div className="sp-marquee-track">
            {REVIEWS.map((r, i) => (
              <Review key={`r-${i}`} review={r} />
            ))}
            {REVIEWS.map((r, i) => (
              <Review key={`d-${i}`} review={r} decorative />
            ))}
          </div>
        </div>

        {/* Divider — hidden until the blocks below come back */}
        <div className="sp-divider sp-reveal" hidden />

        {/* Video mentions — hidden until real creator mentions are available */}
        <div className="sp-mentions-wrap sp-reveal" hidden>
          <p className="sp-mentions-label">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
              className="sp-yt-icon"
            >
              <path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z" />
              <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
            </svg>
            Mentioned by creators on YouTube
          </p>
          <div className="sp-video-grid">
            {[
              {
                src: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=560&q=80',
                alt: 'YouTube tutorial thumbnail',
                views: '20K+ views',
                title: '"How To Make A YouTube Thumbnail in 3 Minutes"',
                creator: 'Marcus Jones',
              },
              {
                src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=560&q=80',
                alt: 'Creator working on thumbnails',
                views: '50K+ views',
                title: '"AI Thumbnail Maker Generates Better Thumbnails"',
                creator: 'Dan Kieft',
              },
              {
                src: 'https://images.unsplash.com/photo-1560472355-536de3962603?auto=format&fit=crop&w=560&q=80',
                alt: 'YouTube channel growth',
                views: 'Trending',
                title: '"AI Thumbnail Maker Changed YouTube Forever"',
                creator: 'Youri van Hofwegen',
              },
            ].map((v, i) => (
              <article key={i} className="sp-video-card sp-reveal">
                <div className="sp-video-thumb">
                  <img src={v.src} alt={v.alt} className="sp-video-img" loading="lazy" />
                  <div className="sp-video-overlay" />
                  <div className="sp-play-btn" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                  <div className="sp-video-views">{v.views}</div>
                </div>
                <div className="sp-video-body">
                  <p className="sp-video-title">{v.title}</p>
                  <span className="sp-video-creator">{v.creator}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Trustpilot — hidden until real verified review count exists */}
        <div className="sp-trust sp-reveal" hidden>
          <div className="sp-trust-inner">
            <div className="sp-trust-logo" aria-label="Trustpilot">
              <svg className="sp-tp-star" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
              </svg>
              <span className="sp-tp-name">Trustpilot</span>
            </div>
            <div className="sp-trust-stars" aria-label="4.9 out of 5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} />
              ))}
              <span className="sp-trust-score">4.9</span>
            </div>
            <p className="sp-trust-text">
              <strong>1,500+</strong> creator reviews on Trustpilot
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
