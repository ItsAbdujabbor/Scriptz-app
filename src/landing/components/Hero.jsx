import { WaitlistForm } from './WaitlistForm'

export function Hero() {
  return (
    <section className="lin-hero" id="home">
      <div className="lin-aura" />
      <div className="lin-copy">
        <span className="lin-eyebrow">
          <span className="lin-eyebrow-line" />
          Scriptz AI 1.0 — data-backed YouTube growth
        </span>
        <h1 className="lin-h1">
          Make Your Videos
          <br />
          <span className="lin-h1-accent">Impossible to Ignore.</span>
        </h1>
        <p className="lin-sub">
          Scripts, thumbnails, and channel insights built on your real analytics—so you ship videos
          that earn attention, not just uploads.
        </p>
        <p className="lin-waitlist-lead">
          Join the waitlist for early access. We’ll send one email when Scriptz opens—unsubscribe anytime.
        </p>
        <WaitlistForm />
      </div>
    </section>
  )
}
