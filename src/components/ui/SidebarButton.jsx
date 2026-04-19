import { forwardRef, useCallback, useState } from 'react'

/**
 * Unified sidebar navigation button — consistent sizing, hover, and active states.
 * Works as `<a>` (with href) or `<button>` (without).
 *
 * Press feedback: on pointerdown we add `.is-pressing` which triggers a 240ms
 * spring keyframe in ui.css (`.sb-btn.is-pressing`). The class clears either
 * when the animation ends or 260ms later as a safety, so a click that
 * immediately navigates still shows the press animation before the screen
 * change.
 */
const SidebarButton = forwardRef(function SidebarButton(
  { icon, label, active, collapsed, href, className = '', onPointerDown, ...rest },
  ref
) {
  const [pressing, setPressing] = useState(false)

  const handlePointerDown = useCallback(
    (e) => {
      onPointerDown?.(e)
      setPressing(false)
      // Toggle on the next frame so re-clicks always restart the keyframe.
      requestAnimationFrame(() => setPressing(true))
    },
    [onPointerDown]
  )
  const handleAnimationEnd = useCallback(() => setPressing(false), [])

  const cls = [
    'sb-btn',
    active && 'sb-btn--active',
    collapsed && 'sb-btn--collapsed',
    pressing && 'is-pressing',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {icon && <span className="sb-btn__icon">{icon}</span>}
      {label && <span className="sb-btn__label">{label}</span>}
    </>
  )

  if (href) {
    return (
      <a
        ref={ref}
        href={href}
        className={cls}
        onPointerDown={handlePointerDown}
        onAnimationEnd={handleAnimationEnd}
        {...rest}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      ref={ref}
      type="button"
      className={cls}
      onPointerDown={handlePointerDown}
      onAnimationEnd={handleAnimationEnd}
      {...rest}
    >
      {content}
    </button>
  )
})

export default SidebarButton
