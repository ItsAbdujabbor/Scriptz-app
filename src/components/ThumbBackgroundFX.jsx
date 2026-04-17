/**
 * ThumbBackgroundFX — quiet atmospheric backdrop for the Thumbnail
 * Generator screen. Three static layers + one interactive layer:
 *
 *   ▸ Base: deep black with a soft purple gradient rising from the
 *     bottom so the screen feels grounded, not void.
 *
 *   ▸ Dot grid: a repeating CSS-painted grid of tiny dots, masked by
 *     a radial fade so the density is concentrated near the center
 *     and falls off toward every edge. Looks like a "spotlight"
 *     section of a larger grid.
 *
 *   ▸ Cursor spotlight: a gentle radial halo that tracks the pointer
 *     by writing two CSS variables (no per-frame DOM work). Single
 *     subtle signal — no dot brightening, no trails.
 *
 * No decorative animations. No falling stars. No drift. Everything
 * that moves on this screen does so because the user moved it.
 */
import { useEffect, useRef } from 'react'
import './ThumbBackgroundFX.css'

export function ThumbBackgroundFX() {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let rafId = 0
    let targetX = 50
    let targetY = 50
    let currentX = 50
    let currentY = 50

    const tick = () => {
      // Light smoothing — 0.15 factor is close-to-instant but spares
      // us the jagged jumps of a raw pointermove handler.
      currentX += (targetX - currentX) * 0.15
      currentY += (targetY - currentY) * 0.15
      root.style.setProperty('--thumb-bg-mx', `${currentX}%`)
      root.style.setProperty('--thumb-bg-my', `${currentY}%`)
      if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
        rafId = requestAnimationFrame(tick)
      } else {
        rafId = 0
      }
    }

    const onMove = (e) => {
      const rect = root.getBoundingClientRect()
      targetX = ((e.clientX - rect.left) / rect.width) * 100
      targetY = ((e.clientY - rect.top) / rect.height) * 100
      if (!rafId) rafId = requestAnimationFrame(tick)
    }

    const onLeave = () => {
      // Park the spotlight off-panel when the cursor leaves so idle
      // state is "no spotlight" rather than whichever corner it exited.
      targetX = -30
      targetY = -30
      if (!rafId) rafId = requestAnimationFrame(tick)
    }

    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)
    return () => {
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div ref={rootRef} className="thumb-bg-fx" aria-hidden="true">
      <div className="thumb-bg-fx__base" />
      <div className="thumb-bg-fx__bottom-glow" />
      <div className="thumb-bg-fx__grid" />
      <div className="thumb-bg-fx__spotlight" />
    </div>
  )
}
