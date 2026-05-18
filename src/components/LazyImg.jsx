import { useEffect, useRef, useState } from 'react'

const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * LazyImg — defers loading until the element approaches the viewport
 * (IntersectionObserver, falling back to native `loading=lazy`).
 *
 * Three states:
 *   idle     – blank pixel shown; IO not yet fired
 *   loading  – real src set; waiting for the image to decode
 *   revealed – image decoded; fades in, shimmer on parent clears
 *
 * The parent `.thumb-batch-img-wrap` reads `data-state` via :has() to
 * display a moving shimmer while idle or loading (see ThumbnailGenerator.css).
 */
export function LazyImg({ src, alt = '', className = '', rootMargin = '800px', style, ...rest }) {
  const ref = useRef(null)
  const [state, setState] = useState('idle')
  const prevSrcRef = useRef(src)

  useEffect(() => {
    if (state !== 'idle') return undefined
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setState('loading')
      return undefined
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState('loading')
          io.disconnect()
        }
      },
      { rootMargin, threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [state, rootMargin])

  useEffect(() => {
    if (src === prevSrcRef.current) return
    prevSrcRef.current = src
    // If already in view, go straight to loading; otherwise stay idle so IO fires.
    setState((s) => (s === 'idle' ? 'idle' : 'loading'))
  }, [src])

  const handleLoad = (e) => {
    if (state === 'revealed') return
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (naturalWidth > 2 && naturalHeight > 2) {
      setState('revealed')
    }
  }

  return (
    <img
      ref={ref}
      src={state === 'idle' ? BLANK_PIXEL : src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      data-state={state}
      onLoad={handleLoad}
      style={{
        opacity: state === 'revealed' ? 1 : 0,
        transition: state === 'revealed' ? 'opacity 0.35s ease' : 'none',
        ...style,
      }}
      {...rest}
    />
  )
}
