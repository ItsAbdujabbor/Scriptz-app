import './Loading.css'

/**
 * Reusable loading indicator — use everywhere instead of inline spinners.
 * @param {string} [message] - Optional text (e.g. "Loading videos…")
 * @param {'sm'|'md'|'lg'} [size] - Spinner size
 * @param {string} [className] - Extra class for the wrapper
 */
export function Loading({ message, size = 'md', className = '' }) {
  return (
    <div className={`loading-wrap loading-wrap--${size} ${className}`.trim()} role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden />
      {message && <span className="loading-message">{message}</span>}
    </div>
  )
}
