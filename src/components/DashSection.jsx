import { Activity, BarChart3, HeartPulse, Lightbulb, ListChecks, Zap } from 'lucide-react'

const ICONS = {
  pulse: Activity,
  quick: Zap,
  ideas: Lightbulb,
  health: HeartPulse,
  reco: ListChecks,
  performance: BarChart3,
}

/**
 * Unified dashboard section container.
 *
 * @param {string}  icon       - Icon key (pulse, quick, ideas, health, reco, performance)
 * @param {string}  title      - Section heading text
 * @param {string}  [id]       - Optional heading id for aria-labelledby
 * @param {React.ReactNode} [meta] - Right-side header content (badges, buttons)
 * @param {React.ReactNode} children - Section body
 * @param {string}  [className] - Extra class on the outer <section>
 */
export function DashSection({ icon, title, id, meta, children, className }) {
  const Icon = ICONS[icon] ?? Activity

  return (
    <section className={`dash-section${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <header className="dash-section-head">
        <h2 id={id} className="dash-section-title">
          <span className={`dash-section-icon dash-section-icon--${icon}`} aria-hidden>
            <Icon size={20} strokeWidth={2} />
          </span>
          {title}
        </h2>
        {meta && <div className="dash-section-meta">{meta}</div>}
      </header>
      <div className="dash-section-body">{children}</div>
    </section>
  )
}
