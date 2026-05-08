/**
 * Chat-thread loading state.
 *
 * No skeleton bubbles, no shimmer sweep. A single soft ring spinner
 * centered in the thread area with a small "Loading conversation…"
 * label that fades in. The intent is "we're getting your messages" —
 * not "here's a fake version of your chat for 200ms".
 *
 * Component name kept as ChatHistorySkeleton so the import sites in
 * ThumbnailGenerator don't change. The CSS file `ChatHistorySkeleton.css`
 * is rewritten to match.
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
      <div className="chat-loader__ring" aria-hidden="true" />
      {label ? <p className="chat-loader__label">{label}</p> : null}
    </div>
  )
}

export default ChatHistorySkeleton
