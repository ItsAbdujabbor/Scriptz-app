/**
 * Skeleton loading state shown while a chat thread is being pulled from
 * history. Mirrors the final layout — a user bubble, an assistant bubble,
 * and a 2×2 thumbnail grid — so the transition into the real content
 * feels instant rather than a jarring swap.
 *
 * Rebuilt on top of the shared `Skeleton` primitives in `ui/Skeleton.jsx`
 * so the violet diagonal sweep matches every other loading state in the
 * app. External API unchanged — {label, variant}.
 *
 * `variant="coach"` drops the thumbnail grid (for non-image chats).
 */
import { Skeleton, SkeletonCircle, SkeletonGroup, SkeletonThumbGrid, InlineSpinner } from './ui'

export function ChatHistoryLoading({ label = 'Loading chat', variant = 'thumbnail' }) {
  return (
    <div className={`coach-history-loading coach-history-loading--${variant}`}>
      <SkeletonGroup className="coach-history-loading__stack" label={label || 'Loading chat'}>
        {/* User bubble — right-aligned, short */}
        <div className="coach-history-loading__row coach-history-loading__row--user">
          <Skeleton
            className="coach-history-loading__bubble coach-history-loading__bubble--sm"
            width="42%"
            height={28}
            radius={14}
          />
        </div>

        {/* Assistant bubble — left-aligned, a title line + thumb grid or text */}
        <div className="coach-history-loading__row coach-history-loading__row--assistant">
          <SkeletonCircle size={26} />
          <div className="coach-history-loading__assistant-col">
            <Skeleton height={14} width="68%" radius={999} />
            {variant === 'thumbnail' ? (
              <SkeletonThumbGrid cols={2} count={4} />
            ) : (
              <>
                <Skeleton height={14} width="88%" radius={999} />
                <Skeleton height={14} width="62%" radius={999} />
              </>
            )}
          </div>
        </div>
      </SkeletonGroup>

      {label ? (
        <div className="coach-history-loading__footer">
          <InlineSpinner size={12} />
          <span className="coach-history-loading__label">{label}</span>
        </div>
      ) : null}
    </div>
  )
}
