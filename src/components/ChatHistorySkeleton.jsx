/**
 * ChatHistorySkeleton — message-bubble-shaped placeholders shown while
 * a thumbnail conversation loads from the network. Mirrors the final
 * thread layout (alternating left/right bubbles) so the swap to real
 * content feels instant rather than a surprise.
 *
 * Uses the shared `.sk-shim` keyframe from `skeletonShimmer.css` so
 * this skeleton, the dashboard skeletons, and any future skeleton all
 * shimmer with the same violet sweep.
 *
 * No spinner. No text label. The fade-out is handled by the parent
 * (toggle the `leaving` prop just before unmount).
 */

import { useMemo } from 'react'
import './skeletonShimmer.css'
import './ChatHistorySkeleton.css'

// Bubble layout: rough widths to hint at varied message lengths.
// Picked to look like a real conversation skeleton rather than a grid.
const BUBBLE_LAYOUT = [
  { side: 'user', width: 38 },
  { side: 'assistant', width: 72, hasGrid: true },
  { side: 'user', width: 26 },
  { side: 'assistant', width: 64 },
  { side: 'user', width: 48 },
  { side: 'assistant', width: 80, hasGrid: true },
  { side: 'user', width: 30 },
  { side: 'assistant', width: 58 },
]

export function ChatHistorySkeleton({ leaving = false, count = 8 }) {
  const items = useMemo(
    () => BUBBLE_LAYOUT.slice(0, Math.max(2, Math.min(count, BUBBLE_LAYOUT.length))),
    [count]
  )

  return (
    <div
      className={`chat-skel ${leaving ? 'chat-skel--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading chat"
    >
      {items.map((b, i) => (
        <div
          key={i}
          className={`chat-skel__row chat-skel__row--${b.side}`}
          // Stagger fade-in so it doesn't feel like a single static block.
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {b.hasGrid ? (
            <div className="chat-skel__assistant-stack">
              <span
                className="sk-shim chat-skel__bubble"
                style={{ width: `${b.width}%`, height: 16 }}
              />
              <div className="chat-skel__thumb-grid">
                <span className="sk-shim chat-skel__thumb" />
                <span className="sk-shim chat-skel__thumb" />
              </div>
            </div>
          ) : (
            <span
              className="sk-shim chat-skel__bubble"
              style={{
                width: `${b.width}%`,
                height: b.side === 'user' ? 28 : 22,
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default ChatHistorySkeleton
