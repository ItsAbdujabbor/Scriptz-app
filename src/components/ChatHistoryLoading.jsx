/**
 * Centered loading state when opening a thread from history (glass card + orbit animation).
 */
export function ChatHistoryLoading({
  kicker = 'History',
  label = 'Loading conversation…',
  subtitle = 'Pulling messages and context…',
}) {
  return (
    <div
      className="coach-history-loading coach-history-loading--panel"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="coach-history-loading__kicker">{kicker}</span>
      <div className="coach-history-loading__card">
        <div className="coach-history-loading__orbit" aria-hidden="true">
          <span className="coach-history-loading__orbit-ring" />
          <span className="coach-history-loading__orbit-glow" />
          <span className="coach-history-loading__orbit-core" />
        </div>
        <div className="coach-history-loading__copy">
          <p className="coach-history-loading__label">{label}</p>
          {subtitle ? <p className="coach-history-loading__subtitle">{subtitle}</p> : null}
        </div>
        <div className="coach-history-loading__shimmer" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
