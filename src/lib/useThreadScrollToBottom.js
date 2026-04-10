import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Shared scroll-to-bottom state + handler for chat-like screens.
 *
 * Usage:
 *   const threadRef = useRef(null)
 *   const { showScrollToBottom, scrollToBottom } =
 *     useThreadScrollToBottom(threadRef, { enabled: !isLoading })
 *
 *   <div ref={threadRef} className="coach-thread">...</div>
 *   {showScrollToBottom && <button onClick={scrollToBottom}>...</button>}
 *
 * Tracks whether the user has scrolled up from the bottom of the thread
 * and exposes a smooth-scroll handler. Uses a ResizeObserver to handle
 * content growth while the user is at the bottom (auto-sticks) and a
 * scroll listener (+ scrollend where supported) to detect user scroll-up.
 *
 * Deps is an optional array of values that should trigger a re-check
 * (e.g. message count changing, streaming state toggling).
 */
export function useThreadScrollToBottom(threadRef, options = {}) {
  const { enabled = true, deps = [] } = options
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const scrollingToBottomRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    scrollingToBottomRef.current = true
    setShowScrollToBottom(false)
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' })
    const check = () => {
      const el = threadRef.current
      if (!el) {
        scrollingToBottomRef.current = false
        return
      }
      const { scrollTop, scrollHeight, clientHeight } = el
      const atBottom = scrollHeight - scrollTop - clientHeight <= 24
      if (atBottom) setShowScrollToBottom(false)
      if (atBottom || !scrollingToBottomRef.current) scrollingToBottomRef.current = false
    }
    ;[200, 400, 600, 900].forEach((ms) =>
      setTimeout(() => {
        check()
        if (ms === 900) scrollingToBottomRef.current = false
      }, ms)
    )
  }, [threadRef])

  useEffect(() => {
    if (!enabled) return undefined
    const thread = threadRef.current
    if (!thread) return undefined

    const SCROLL_THRESHOLD = 24

    const checkScrollPosition = () => {
      const { scrollTop, scrollHeight, clientHeight } = thread
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      const atBottom = distanceFromBottom <= SCROLL_THRESHOLD
      const isScrollable = scrollHeight > clientHeight
      if (atBottom) {
        setShowScrollToBottom(false)
        scrollingToBottomRef.current = false
      } else if (!scrollingToBottomRef.current) {
        setShowScrollToBottom(isScrollable)
      }
    }

    checkScrollPosition()
    thread.addEventListener('scroll', checkScrollPosition, { passive: true })
    if ('onscrollend' in thread) {
      thread.addEventListener('scrollend', checkScrollPosition)
    }
    const ro = new ResizeObserver(checkScrollPosition)
    ro.observe(thread)
    return () => {
      thread.removeEventListener('scroll', checkScrollPosition)
      if ('onscrollend' in thread) {
        thread.removeEventListener('scrollend', checkScrollPosition)
      }
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, threadRef, ...deps])

  return { showScrollToBottom, scrollToBottom, setShowScrollToBottom }
}
