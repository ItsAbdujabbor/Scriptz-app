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
          From ignored to viral with data-backed video strategy.
          <br />
          Scripts, thumbnails, and insights — all powered by AI.
        </p>
        <p className="lin-waitlist-lead">
          Get early access: join the waitlist. We’ll email you when the workspace opens — no spam.
        </p>
        <WaitlistForm />
      </div>
    </section>
  )
}
