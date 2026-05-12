/**
 * Chat-thread loading state.
 *
 * A brand-purple conic-gradient ring around a quietly-pulsing core dot,
 * centered in the thread area with a "Loading conversation" label and
 * an animated three-dot trail. The intent is "we're getting your
 * messages" — premium and intentional, not "here's a fake version of
 * your chat for 200ms".
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
      <div className="chat-loader__ring" aria-hidden="true">
        <div className="chat-loader__ring-arc" />
        <div className="chat-loader__ring-core" />
      </div>
      {label ? (
        <p className="chat-loader__label">
          <span className="chat-loader__label-text">{label}</span>
          <span className="chat-loader__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </p>
      ) : null}
    </div>
  )
}

export default ChatHistorySkeleton
