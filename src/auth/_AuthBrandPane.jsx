import { SparkleIcon } from './_icons'

/**
 * Branded image panel rendered on the left side of every auth dialog.
 * Pure decoration — `aria-hidden` so screen readers skip it. Hidden on
 * narrow viewports via CSS (.auth-split-image media query). The actual
 * auth flow lives in the right pane (.auth-content).
 *
 * Layout: brand mark top-left, tagline block bottom-left, photo +
 * violet gradient + bottom vignette behind everything.
 */
export function AuthBrandPane() {
  return (
    <aside className="auth-split-image" aria-hidden="true">
      <div className="auth-split-image-glow" />

      <div className="auth-split-brand">
        <span className="auth-split-brand-avatar">
          <img src="/clixalogo.jpg" alt="" />
        </span>
        <span>Clixa AI</span>
      </div>

      <div className="auth-split-tagline">
        <span className="auth-split-tagline-eyebrow">
          <SparkleIcon />
          Welcome
        </span>
        <h2 className="auth-split-tagline-title">
          Thumbnails<br />
          <em>that earn the click.</em>
        </h2>
      </div>
    </aside>
  )
}
