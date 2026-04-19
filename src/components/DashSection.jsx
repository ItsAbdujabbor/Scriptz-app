import {
  Activity,
  BarChart3,
  HeartPulse,
  Lightbulb,
  ListChecks,
  PlaySquare,
  Zap,
} from 'lucide-react'

const ICONS = {
  pulse: PlaySquare,
  quick: Zap,
  ideas: Lightbulb,
  health: HeartPulse,
  reco: ListChecks,
  performance: BarChart3,
  videos: PlaySquare,
}

export function DashSection({ icon, title, id, meta, children, className }) {
  const Icon = ICONS[icon] ?? Activity

  return (
    <section className={`dash-section${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <header className="dash-section-head">
        <h2 id={id} className="dash-section-title">
          <span className={`dash-section-icon dash-section-icon--${icon}`} aria-hidden>
            <Icon size={15} strokeWidth={2} />
          </span>
          {title && <span className="dash-section-title-text">{title}</span>}
        </h2>
        {meta && <div className="dash-section-meta">{meta}</div>}
      </header>
      <div className="dash-section-body">{children}</div>
    </section>
  )
}
