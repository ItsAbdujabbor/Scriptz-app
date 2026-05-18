import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { InlineSpinner } from '../components/ui'

// ── VirtualizedMessageList ───────────────────────────────────────────────────
/**
 * Scrollable chat message list — no external library.
 *
 * Removed react-virtuoso because its internal flushSync-based scroll tracking
 * causes React error #185 (maximum update depth exceeded) in React 19.
 *
 * Scroll contract:
 *  • Mount       — snap to bottom immediately (no animation).
 *  • New message appended — smooth-scroll to bottom IF the user was already
 *    near the bottom (within 200 px); otherwise leave position alone.
 *  • Older messages prepended — restore scroll position to the same message
 *    the user was looking at (DOM scroll-height delta correction). Done in
 *    useLayoutEffect with direct DOM writes — no setState, no cascade.
 *  • Scroll near top — call onLoadOlder() once per "near top" entry to fetch
 *    older messages.
 *  • atTop reported via onAtTopChange for the header-collapse animation.
 */
export const VirtualizedMessageList = memo(function VirtualizedMessageList({
  messages,
  hasMoreOlder,
  isLoadingOlder,
  onLoadOlder,
  onAtTopChange,
  renderItem,
}) {
  const containerRef = useRef(null)

  // True while the user is within 200 px of the bottom — gates auto-scroll.
  const isNearBottomRef = useRef(true)

  // Prevents firing onLoadOlder multiple times for one "near top" entry.
  const loadOlderFiredRef = useRef(false)

  // Snapshot of scrollHeight taken just before older messages are prepended.
  // Set when isLoadingOlder becomes true; cleared after position is restored.
  const scrollHeightBeforeLoadRef = useRef(0)

  // ── Initial scroll to bottom ────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, []) // mount only

  // ── Capture scrollHeight just before the prepended messages land ─────────
  // Runs when isLoadingOlder transitions true → false: we need the height
  // from BEFORE the new items were added to compute the delta.
  const prevIsLoadingRef = useRef(isLoadingOlder)
  useEffect(() => {
    if (!prevIsLoadingRef.current && isLoadingOlder) {
      // Loading just STARTED — snapshot height now (spinner is in DOM but
      // the actual older messages haven't arrived yet).
      scrollHeightBeforeLoadRef.current = containerRef.current?.scrollHeight ?? 0
    }
    prevIsLoadingRef.current = isLoadingOlder
  }, [isLoadingOlder])

  // ── Restore scroll position after prepend (DOM-only, no setState) ────────
  // useLayoutEffect so the height correction happens before paint, preventing
  // visible scroll jump. Does NOT call setState so no synchronous cascade.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (!isLoadingOlder && scrollHeightBeforeLoadRef.current > 0) {
      const delta = el.scrollHeight - scrollHeightBeforeLoadRef.current
      if (delta > 0) el.scrollTop += delta
      scrollHeightBeforeLoadRef.current = 0
    }
  }, [isLoadingOlder, messages.length])

  // ── Auto-scroll when messages are appended ───────────────────────────────
  // Only fires when the list grows from the bottom (new reply arrives).
  // Skips when isLoadingOlder is true because that's a prepend, handled above.
  useEffect(() => {
    const el = containerRef.current
    if (!el || isLoadingOlder) return
    if (isNearBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, isLoadingOlder])

  // ── Scroll event handler ─────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return

    const { scrollTop, scrollHeight, clientHeight } = el
    const distFromBottom = scrollHeight - scrollTop - clientHeight

    isNearBottomRef.current = distFromBottom < 200

    // Header collapse animation
    onAtTopChange?.(scrollTop < 10)

    // Trigger load-older when near the top
    if (scrollTop < 300 && hasMoreOlder && !isLoadingOlder && !loadOlderFiredRef.current) {
      loadOlderFiredRef.current = true
      onLoadOlder()
    }
    // Reset the guard once the user has scrolled away from the top
    if (scrollTop > 400) {
      loadOlderFiredRef.current = false
    }
  }, [hasMoreOlder, isLoadingOlder, onAtTopChange, onLoadOlder])

  return (
    <div ref={containerRef} className="coach-thread-virtuoso" onScroll={handleScroll}>
      {isLoadingOlder && (
        <div className="thumb-load-older-row" role="status" aria-live="polite">
          <InlineSpinner size={12} />
          <span>Loading earlier messages…</span>
        </div>
      )}
      <div className="coach-virtuoso-list">
        {messages.map((msg) => (
          <div key={msg?.id} className="coach-virtuoso-item">
            {renderItem(msg)}
          </div>
        ))}
      </div>
    </div>
  )
})
