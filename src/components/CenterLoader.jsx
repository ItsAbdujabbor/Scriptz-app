import './CenterLoader.css'

/**
 * Full-screen centered loading state — simple circular progress spinner.
 *
 * Used by the OAuth callback gate in App.jsx while we exchange the code
 * with the backend. Optional `label` text fades in below the spinner.
 */
export function CenterLoader({ label }) {
  return (
    <div className="cx-loader" role="status" aria-live="polite">
      <div className="cx-loader-spinner" aria-hidden="true" />
      {label ? <p className="cx-loader-label">{label}</p> : null}
    </div>
  )
}
