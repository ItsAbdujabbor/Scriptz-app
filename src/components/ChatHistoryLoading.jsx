/**
 * Skeleton loading state shown while a chat thread is being pulled from
 * history. Mirrors the final layout — a user bubble, an assistant bubble,
 * and a 2×2 thumbnail grid — so the transition into the real content
 * feels instant rather than a jarring swap.
 *
 * A single diagonal shimmer sweeps across all skeleton surfaces,
 * anchored to the container so the highlight stays aligned even as
 * bubble widths vary. Subtle by default; no flashy spinner.
 *
 * `variant="coach"` drops the thumbnail grid (for non-image chats).
 */
export function ChatHistoryLoading({ label = 'Loading chat', variant = 'thumbnail' }) {
  return (
    <div
      className={`coach-history-loading coach-history-loading--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="coach-history-loading__stack" aria-hidden="true">
        {/* User bubble — right-aligned, short */}
        <div className="coach-history-loading__row coach-history-loading__row--user">
          <span className="coach-history-loading__bubble coach-history-loading__bubble--sm" />
        </div>

        {/* Assistant bubble — left-aligned, a title line + a description line */}
        <div className="coach-history-loading__row coach-history-loading__row--assistant">
          <span className="coach-history-loading__avatar" />
          <div className="coach-history-loading__assistant-col">
            <span className="coach-history-loading__bubble coach-history-loading__bubble--md" />
            {variant === 'thumbnail' ? (
              <div className="coach-history-loading__thumb-grid">
                <span className="coach-history-loading__thumb" />
                <span className="coach-history-loading__thumb" />
                <span className="coach-history-loading__thumb" />
                <span className="coach-history-loading__thumb" />
              </div>
            ) : (
              <>
                <span className="coach-history-loading__bubble coach-history-loading__bubble--lg" />
                <span className="coach-history-loading__bubble coach-history-loading__bubble--md" />
              </>
            )}
          </div>
        </div>

        {/* Diagonal shimmer sweep — absolutely positioned over the stack */}
        <div className="coach-history-loading__sweep" />
      </div>

      {label ? (
        <div className="coach-history-loading__footer">
          <span className="coach-history-loading__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="coach-history-loading__label">{label}</span>
        </div>
      ) : null}
    </div>
  )
}
