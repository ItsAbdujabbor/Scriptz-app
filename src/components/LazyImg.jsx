import { useEffect, useRef, useState } from 'react'

const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

// Hysteresis margins:
// - Load when within LOAD_MARGIN of the viewport (eager prefetch)
// - Unload when more than UNLOAD_MARGIN from the viewport (reclaim memory)
const LOAD_MARGIN = '1000px'
const UNLOAD_MARGIN = '3500px'

/**
 * LazyImg — drop-in <img> that defers loading until the element is
 * near the viewport, and unloads the decoded bitmap when the element
 * scrolls far away (reclaims GPU/RAM for long chat sessions with many
 * generated thumbnails).
 *
 * Hysteresis prevents thrashing: load at 1000px, unload at 3500px.
 * The `dims` (aspect-ratio) state is preserved across load/unload cycles
 * so there is zero layout shift when the image reloads.
 */
export function LazyImg({ src, alt = '', className = '', rootMargin = LOAD_MARGIN, ...rest }) {
  const ref = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [dims, setDims] = useState(null)
  // Debounce token — only unload after being out-of-range for 2 s to
  // prevent thrashing during fast scrolling.
  const unloadTimerRef = useRef(null)

  // ── Load observer ────────────────────────────────────────────────
  useEffect(() => {
    if (loaded) return undefined
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setLoaded(true)
      return undefined
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Cancel any pending unload (image scrolled back in range).
          if (unloadTimerRef.current) {
            clearTimeout(unloadTimerRef.current)
            unloadTimerRef.current = null
          }
          setLoaded(true)
          io.disconnect()
        }
      },
      { rootMargin, threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loaded, rootMargin])

  // ── Unload observer ──────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return undefined
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          // Schedule unload — cancel if image scrolls back in range
          // before the timer fires.
          if (!unloadTimerRef.current) {
            unloadTimerRef.current = setTimeout(() => {
              unloadTimerRef.current = null
              setLoaded(false)
            }, 2000)
          }
        } else {
          // Back in the far range — cancel pending unload.
          if (unloadTimerRef.current) {
            clearTimeout(unloadTimerRef.current)
            unloadTimerRef.current = null
          }
        }
      },
      { rootMargin: UNLOAD_MARGIN, threshold: 0 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (unloadTimerRef.current) {
        clearTimeout(unloadTimerRef.current)
        unloadTimerRef.current = null
      }
    }
  }, [loaded])

  // ── Src change: keep bitmap visible while new URL decodes ────────
  const prevSrcRef = useRef(src)
  useEffect(() => {
    if (src === prevSrcRef.current) return
    prevSrcRef.current = src
    setDims(null)
  }, [src])

  const handleLoad = (e) => {
    if (dims) return
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth > 2 && naturalHeight > 2) {
      setDims({ w: naturalWidth, h: naturalHeight })
    }
  }

  return (
    <img
      ref={ref}
      src={loaded ? src : BLANK_PIXEL}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onLoad={handleLoad}
      style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}
      {...rest}
    />
  )
}
