import { forwardRef } from 'react'

/**
 * Unified sidebar navigation button — consistent sizing, hover, and active states.
 * Works as `<a>` (with href) or `<button>` (without).
 */
const SidebarButton = forwardRef(function SidebarButton(
  { icon, label, active, collapsed, href, className = '', ...rest },
  ref
) {
  const cls = ['sb-btn', active && 'sb-btn--active', collapsed && 'sb-btn--collapsed', className]
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
      <a ref={ref} href={href} className={cls} {...rest}>
        {content}
      </a>
    )
  }

  return (
    <button ref={ref} type="button" className={cls} {...rest}>
      {content}
    </button>
  )
})

export default SidebarButton
