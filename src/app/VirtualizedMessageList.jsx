import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Virtuoso } from 'react-virtuoso'
import { InlineSpinner } from '../components/ui'

const INITIAL_FIRST_INDEX = 50_000

// ── Stable component definitions ────────────────────────────────────────────
// Must be defined outside VirtualizedMessageList so Virtuoso never tears down
// the DOM tree on a parent re-render. Each render that creates a new object
// reference for `components` would force a full remount of the list.

const VirtuosoScroller = forwardRef(function VirtuosoScroller({ style, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      {...props}
      className="coach-thread-virtuoso"
      style={style}
      data-coach-virtuoso-scroller
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
// reference when isLoadingOlder toggles. context.isLoadingOlder drives rendering.
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
 * Key features:
 *  • `firstItemIndex` prepend pattern — older messages are prepended by
 *    decrementing the index so the viewport stays anchored (no scroll jump).
 *  • `followOutput` — auto-scrolls smoothly when at bottom, leaves position
 *    alone when user has scrolled up to read history.
 *  • `startReached` — fires when user scrolls near the top; replaces the
 *    manual IntersectionObserver sentinel approach.
 *  • `atTopStateChange` — drives parent's `isScrolled` header-collapse state
 *    without a manual scroll listener.
 *  • Conversation switch — `useLayoutEffect` snaps to bottom instantly when
 *    `conversationId` changes.
 */
export const VirtualizedMessageList = memo(function VirtualizedMessageList({
  messages,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  onAtTopChange,
  renderItem,
  conversationId,
}) {
  const virtuosoRef = useRef(null)
  const [firstItemIndex, setFirstItemIndex] = useState(INITIAL_FIRST_INDEX)
  const prePrependLengthRef = useRef(messages.length)

  // Snap to bottom on mount and on every conversation switch.
  // `prevConvIdRef` starts equal to `conversationId`, so on the initial
  // render the condition is false (no index reset) but the rAF snap still
  // fires — putting the list at the newest message from the start.
  const prevConvIdRef = useRef(conversationId)
  useLayoutEffect(() => {
    if (prevConvIdRef.current !== conversationId) {
      prevConvIdRef.current = conversationId
      setFirstItemIndex(INITIAL_FIRST_INDEX)
    }
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto' })
    })
  }, [conversationId])

  // When isLoadingOlder goes true → false, compute how many messages were
  // prepended and shift firstItemIndex backward by that count. Virtuoso uses
  // firstItemIndex to keep the viewport anchored to the same message.
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

  // context is passed to all Virtuoso components; changes trigger re-renders
  // only in the components that read from it (Header in our case).
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
