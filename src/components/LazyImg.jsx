import { useEffect, useRef, useState } from 'react'

const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

// Hysteresis margins:
// - Load when within LOAD_MARGIN of the viewport (eager prefetch)
// - Unload when more than UNLOAD_MARGIN from the viewport (reclaim memory)
const LOAD_MARGIN = '1000px'
const UNLOAD_MARGIN = '3500px'

/**
 * LazyImg — drop-in <img> that defers loading until the element is near the
 * viewport, unloads the decoded bitmap when it scrolls far away, and fades in
 * each time the real image decodes (no abrupt pop-in).
 *
 * Three-state lifecycle per load cycle:
 *   idle     → element not yet in range, blank pixel showing
 *   loading  → element in range, real src assigned, browser fetching/decoding
 *   revealed → onLoad fired for real image, opacity transition to 1
 *
 * `data-state` is placed on the <img> so parent CSS can hang a shimmer
 * skeleton off it via :has(> img:not([data-state="revealed"])).
 *
 * Hysteresis: load at 1000 px, unload at 3500 px with a 2 s debounce.
 * `dims` (aspect-ratio) persists across cycles → zero layout shift on reload.
 */
export function LazyImg({ src, alt = '', className = '', rootMargin = LOAD_MARGIN, ...rest }) {
  const ref = useRef(null)
  const [loaded, setLoaded] = useState(false)
  // `revealed` flips true once the real image decodes — drives the opacity
  // fade-in. Reset alongside `loaded` in the unload timer so images fade in
  // again when they re-enter after being evicted from GPU memory.
  const [revealed, setRevealed] = useState(false)
  const [dims, setDims] = useState(null)
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
          if (!unloadTimerRef.current) {
            unloadTimerRef.current = setTimeout(() => {
              unloadTimerRef.current = null
              setLoaded(false)
              // Reset revealed so the image fades in again on next load cycle.
              setRevealed(false)
            }, 2000)
          }
        } else {
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

  // ── Src change: reset dims so new image can record its own ratio ─
  const prevSrcRef = useRef(src)
  useEffect(() => {
    if (src === prevSrcRef.current) return
    prevSrcRef.current = src
    setDims(null)
    setRevealed(false)
  }, [src])

  const handleLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    // Blank pixel is 1×1 — skip it. Only record dims and reveal for
    // the real image (which is always larger than 2×2).
    if (naturalWidth > 2 && naturalHeight > 2) {
      if (!dims) setDims({ w: naturalWidth, h: naturalHeight })
      setRevealed(true)
    }
  }

  // Three-state string written as a data attribute so parent CSS can
  // target loading vs revealed states without extra wrapper elements.
  const state = !loaded ? 'idle' : !revealed ? 'loading' : 'revealed'

  return (
    <img
      ref={ref}
      src={loaded ? src : BLANK_PIXEL}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      data-state={state}
      onLoad={handleLoad}
      style={{
        ...(dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined),
        // Keep opacity 0 until revealed so the parent's shimmer skeleton
        // shows through during fetch. Transition only fires AFTER revealed
        // flips to true (adding transition + changing opacity in the same
        // commit triggers the browser's native CSS transition correctly).
        opacity: state === 'revealed' ? 1 : 0,
        transition: revealed ? 'opacity 0.32s ease' : 'none',
      }}
      {...rest}
    />
  )
}
