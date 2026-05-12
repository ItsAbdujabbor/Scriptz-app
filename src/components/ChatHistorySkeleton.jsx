/**
 * Chat-thread loading state.
 *
 * A believable placeholder for the conversation that's about to appear:
 * three skeleton messages laid out in the same shape as the real
 * thread (assistant text rows on the left, a violet user bubble on the
 * right, then an assistant message with a thumbnail-card grid). A
 * single shimmer sweep crosses every skeleton element in unison so it
 * reads as "the chat is materializing" rather than "a spinner is
 * stalling you".
 *
 * No "Loading conversation" label in the center — the skeleton IS the
 * loading signal. Screen-reader users still get the message via the
 * outer `role=status` + `aria-label` on the container.
 *
 * Component name kept as ChatHistorySkeleton so the import sites in
 * ThumbnailGenerator don't change. Styling lives in
 * ./ChatHistorySkeleton.css.
 */

import './ChatHistorySkeleton.css'

export function ChatHistorySkeleton({ leaving = false, label = 'Loading conversation' }) {
  return (
    <div
      className={`chat-loader ${leaving ? 'chat-loader--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="chat-loader__thread" aria-hidden="true">
        <AssistantSkeleton widths={[88, 72, 54]} />
        <UserSkeleton widths={[78, 56]} />
        <AssistantSkeleton widths={[84]} withThumbs />
      </div>
    </div>
  )
}

function AssistantSkeleton({ widths = [80, 60], withThumbs = false }) {
  return (
    <div className="chat-loader__msg chat-loader__msg--assistant">
      <div className="chat-loader__body">
        {widths.map((w, i) => (
          <div key={`r${i}`} className="chat-loader__row" style={{ width: `${w}%` }} />
        ))}
        {withThumbs && (
          <div className="chat-loader__thumb-grid">
            <div className="chat-loader__thumb-card" />
            <div className="chat-loader__thumb-card" />
          </div>
        )}
      </div>
    </div>
  )
}

function UserSkeleton({ widths = [70, 50] }) {
  return (
    <div className="chat-loader__msg chat-loader__msg--user">
      <div className="chat-loader__bubble">
        {widths.map((w, i) => (
          <div
            key={`r${i}`}
            className="chat-loader__row chat-loader__row--on-violet"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export default ChatHistorySkeleton
