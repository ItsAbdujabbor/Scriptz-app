import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { InlineSpinner } from '../components/ui'

const INITIAL_FIRST_INDEX = 50_000

// ── Stable component definitions ────────────────────────────────────────────
// Defined outside VirtualizedMessageList so Virtuoso never tears down the DOM
// on a parent re-render. New object references for `components` force a full
// list remount.

const VirtuosoScroller = forwardRef(function VirtuosoScroller({ style, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      {...props}
      className="coach-thread-virtuoso"
      style={style}
      data-coach-virtuoso-scroller={true}
    >
      {children}
    </div>
  )
})

const VirtuosoList = forwardRef(function VirtuosoList({ style, children }, ref) {
  return (
    <div ref={ref} className="coach-virtuoso-list" style={style}>
      {children}
    </div>
  )
})

const VirtuosoItem = forwardRef(function VirtuosoItem({ children, ...props }, ref) {
  return (
    <div ref={ref} {...props} className="coach-virtuoso-item">
      {children}
    </div>
  )
})

// Header receives `context` from Virtuoso — avoids creating a new component
// reference when isLoadingOlder toggles.
const VirtuosoHeader = ({ context }) =>
  context?.isLoadingOlder ? (
    <div className="thumb-load-older-row" role="status" aria-live="polite">
      <InlineSpinner size={12} />
      <span>Loading earlier messages…</span>
    </div>
  ) : null

const VIRTUOSO_COMPONENTS = {
  Scroller: VirtuosoScroller,
  List: VirtuosoList,
  Item: VirtuosoItem,
  Header: VirtuosoHeader,
}

// ── VirtualizedMessageList ───────────────────────────────────────────────────
/**
 * Virtualized chat message list built on react-virtuoso.
 *
 * The parent MUST pass a stable `key` equal to `conversationId` so this
 * component remounts on conversation switch. That gives us a fresh
 * `firstItemIndex = INITIAL_FIRST_INDEX` and a fresh scroll position
 * without any `setState` inside `useLayoutEffect` (which would cause React
 * error #185 — "maximum update depth exceeded" — via synchronous cascade
 * with Virtuoso's internal flushSync-based scroll tracking).
 */
export const VirtualizedMessageList = memo(function VirtualizedMessageList({
  messages,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  onAtTopChange,
  renderItem,
}) {
  const virtuosoRef = useRef(null)
  const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_FIRST_INDEX)
  const prePrependLengthRef = useRef(messages.length)

  // Scroll to the bottom after initial mount. Runs async (after paint) so it
  // cannot trigger a synchronous update cascade.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' })
    })
    return () => cancelAnimationFrame(id)
  }, []) // empty deps — mount only

  // When isLoadingOlder goes true → false, compute how many messages were
  // prepended and shift firstItemIndex backward so Virtuoso keeps the viewport
  // anchored to the same message (no scroll jump). This is async so it does
  // not participate in the synchronous commit-phase loop.
  const prevLoadingOlderRef = useRef(isLoadingOlder)
  useEffect(() => {
    const wasLoading = prevLoadingOlderRef.current
    prevLoadingOlderRef.current = isLoadingOlder
    if (wasLoading && !isLoadingOlder) {
      const added = messages.length - prePrependLengthRef.current
      if (added > 0) {
        setFirstItemIndex((prev) => prev - added)
      }
    }
  }, [isLoadingOlder, messages.length])

  const handleStartReached = useCallback(() => {
    if (!hasMoreOlder || isLoadingOlder) return
    prePrependLengthRef.current = messages.length
    onLoadOlder()
  }, [hasMoreOlder, isLoadingOlder, messages.length, onLoadOlder])

  const itemContent = useCallback((_index, msg) => renderItem(msg), [renderItem])

  const context = useMemo(() => ({ isLoadingOlder }), [isLoadingOlder])

  return (
    <Virtuoso
      ref={virtuosoRef}
      context={context}
      data={messages}
      firstItemIndex={firstItemIndex}
      itemContent={itemContent}
      followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
      startReached={handleStartReached}
      atTopStateChange={onAtTopChange}
      atBottomThreshold={150}
      components={VIRTUOSO_COMPONENTS}
      overscan={600}
      increaseViewportBy={{ top: 800, bottom: 400 }}
    />
  )
})
