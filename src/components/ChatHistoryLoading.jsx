/**
 * Centered loading state when opening a thread from history (matches coach UI: kicker + orb/shimmer).
 */
export function ChatHistoryLoading({ kicker = 'History', label = 'Loading conversation…' }) {
  return (
    <div className="coach-history-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="coach-history-loading__kicker">{kicker}</span>
      <div className="coach-history-loading__card">
        <div className="coach-assistant-loader coach-history-loading__loader" aria-hidden="true">
          <span className="coach-assistant-loader-orb" />
          <span className="coach-assistant-loader-lines">
            <span className="coach-assistant-loader-line coach-assistant-loader-line--lg" />
            <span className="coach-assistant-loader-line coach-assistant-loader-line--md" />
            <span className="coach-assistant-loader-line coach-assistant-loader-line--sm" />
          </span>
        </div>
        <p className="coach-history-loading__label">{label}</p>
      </div>
    </div>
  )
}
