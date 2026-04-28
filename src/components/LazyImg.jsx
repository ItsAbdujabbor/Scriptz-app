import { useEffect, useRef, useState } from 'react'

/**
 * 1×1 transparent GIF — placeholder `src` used before the real URL is
 * loaded for the first time. Keeps the <img> element cheap until the
 * element approaches the viewport.
 */
const BLANK_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * LazyImg — drop-in `<img>` that defers loading until the element
 * approaches the viewport (IntersectionObserver + native `loading=lazy`
 * as a fallback). Once the real image has loaded, it stays in memory —
 * we never swap back to a placeholder on scroll.
 *
 * The "swap-out offscreen" trick from an earlier revision caused visible
 * flashes when users scrolled back to a loaded image: the real `src`
 * was replaced with a blank pixel, and the re-swap-back exposed the
 * brief decode delay. One-way loading removes that glitch at the cost
 * of holding decoded bitmaps longer (which is what the browser does
 * natively anyway with `loading="lazy"`).
 */
export function LazyImg({ src, alt = '', className = '', rootMargin = '800px', ...rest }) {
  const ref = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [dims, setDims] = useState(null)

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
          setLoaded(true)
          io.disconnect()
        }
      },
      { rootMargin, threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [loaded, rootMargin])

  // Whenever `src` changes, reset so the observer loads the new URL.
  useEffect(() => {
    setLoaded(false)
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
