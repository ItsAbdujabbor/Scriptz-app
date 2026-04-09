import './Loading.css'

/**
 * Reusable loading widget — use everywhere for consistent, fast loading states.
 *
 * @param {string}  [message]   - Optional text below the spinner
 * @param {'sm'|'md'|'lg'}  [size='md'] - Controls spinner dimensions
 * @param {'inline'|'center'|'page'} [layout='inline'] - How it positions itself
 *   - inline: sits in flow (row, gap)
 *   - center: flex-centers itself in parent (column)
 *   - page: full-area centered with padding (for route/page-level loading)
 * @param {string}  [className] - Extra class on the wrapper
 */
export function Loading({ message, size = 'md', layout = 'inline', className = '' }) {
  return (
    <div
      className={`scriptz-loader scriptz-loader--${size} scriptz-loader--${layout} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <span className="scriptz-loader__spinner" aria-hidden />
      {message && <span className="scriptz-loader__msg">{message}</span>}
    </div>
  )
}
