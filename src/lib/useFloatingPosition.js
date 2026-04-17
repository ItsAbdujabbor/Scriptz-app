import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * useFloatingPosition — anchors a popover to a trigger element using fixed
 * viewport coordinates with collision detection.
 *
 * Default placement is `top-start` (popover sits ABOVE the trigger, left
 * edges aligned). If there is not enough room above, it flips to below.
 * The horizontal position is clamped so the popover never overflows the
 * viewport (with a small `padding` buffer).
 *
 * Re-measures on:
 *   • Window resize
 *   • Window scroll (capture phase — catches scroll on any ancestor)
 *   • Popover content size change (ResizeObserver)
 *
 * Usage:
 *   const triggerRef = useRef(null)
 *   const { popoverRef, style, placement } = useFloatingPosition({
 *     triggerRef,
 *     open,
 *     placement: 'top-start',
 *     offset: 8,
 *   })
 *
 *   <button ref={triggerRef} onClick={() => setOpen(o => !o)}>...</button>
 *   {open && createPortal(
 *     <div ref={popoverRef} style={style}>...</div>,
 *     document.body,
 *   )}
 *
 * Returns:
 *   popoverRef  — attach to the popover element
 *   style       — inline `{ position, top, left, ... }` for the popover
 *   placement   — actual placement after collision check ('top' | 'bottom')
 */
export function useFloatingPosition({
  triggerRef,
  open,
  placement = 'top-start',
  offset = 8,
  padding = 8,
}) {
  const popoverRef = useRef(null)
  const [style, setStyle] = useState({
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
  })
  const [actualPlacement, setActualPlacement] = useState(
    placement.startsWith('bottom') ? 'bottom' : 'top'
  )

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef?.current
    const popover = popoverRef.current
    if (!trigger || !popover) return

    const compute = () => {
      const t = trigger.getBoundingClientRect()
      const p = popover.getBoundingClientRect()
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight

      // Vertical placement with collision check
      const wantTop = placement.startsWith('top')
      const spaceAbove = t.top
      const spaceBelow = viewportH - t.bottom
      let useTop = wantTop
      if (wantTop && spaceAbove < p.height + offset + padding && spaceBelow > spaceAbove) {
        useTop = false
      } else if (!wantTop && spaceBelow < p.height + offset + padding && spaceAbove > spaceBelow) {
        useTop = true
      }
      const top = useTop
        ? Math.max(padding, t.top - p.height - offset)
        : Math.min(viewportH - p.height - padding, t.bottom + offset)

      // Horizontal alignment with viewport clamp
      const align = placement.endsWith('end')
        ? 'end'
        : placement.endsWith('center')
          ? 'center'
          : 'start'
      let left
      if (align === 'end') {
        left = t.right - p.width
      } else if (align === 'center') {
        left = t.left + t.width / 2 - p.width / 2
      } else {
        left = t.left
      }
      left = Math.min(viewportW - p.width - padding, Math.max(padding, left))

      setActualPlacement(useTop ? 'top' : 'bottom')
      setStyle({
        position: 'fixed',
        top: Math.round(top),
        left: Math.round(left),
        visibility: 'visible',
      })
    }

    // First run: measure popover at its natural size with visibility hidden
    // so the user never sees a flash at (0, 0).
    compute()

    const onResize = () => compute()
    const onScroll = () => compute()
    window.addEventListener('resize', onResize)
    // Capture so we hear scroll on every ancestor, not just window.
    window.addEventListener('scroll', onScroll, true)

    let ro
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => compute())
      ro.observe(popover)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
      if (ro) ro.disconnect()
    }
    // placement / offset / padding are config — re-running on change is fine.
  }, [open, placement, offset, padding, triggerRef])

  // Reset to hidden so a re-open doesn't flash at the previous coords.
  useEffect(() => {
    if (!open) {
      setStyle((s) => ({ ...s, visibility: 'hidden' }))
    }
  }, [open])

  return { popoverRef, style, placement: actualPlacement }
}
