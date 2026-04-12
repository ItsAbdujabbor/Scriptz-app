import './IOSLoading.css'

/**
 * iOS-native loading indicator — matches Apple's aesthetic exactly.
 *
 * Uses 8-segment opacity animation (like UIActivityIndicatorView),
 * smooth fade-in entry, and proper accessibility.
 *
 * @param {string}  [message]   - Optional text below spinner
 * @param {'sm'|'md'|'lg'}  [size='md'] - Spinner size
 * @param {'inline'|'center'|'page'} [layout='inline'] - Positioning
 * @param {'default'|'light'} [style='default'] - Color scheme
 * @param {string}  [className] - Extra CSS class
 */
export function IOSLoading({
  message,
  size = 'md',
  layout = 'inline',
  style = 'default',
  className = '',
}) {
  return (
    <div
      className={`ios-loading ios-loading--${size} ios-loading--${layout} ios-loading--${style} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="ios-loading__spinner" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="ios-loading__blade" style={{ '--blade-index': i }} />
        ))}
      </div>
      {message && <span className="ios-loading__msg">{message}</span>}
    </div>
  )
}
