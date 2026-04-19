import { forwardRef } from 'react'

/**
 * Collapsible sidebar dropdown — trigger button + grid-animated content panel.
 */
const SidebarDropdown = forwardRef(function SidebarDropdown(
  { icon, label, expanded, active, collapsed, onToggle, children, ariaControls, ...rest },
  ref
) {
  const cls = [
    'sb-dropdown',
    expanded && 'sb-dropdown--expanded',
    active && 'sb-dropdown--active',
    collapsed && 'sb-dropdown--collapsed',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} role="group" {...rest}>
      <button
        ref={ref}
        type="button"
        className="sb-dropdown__trigger sb-btn"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={ariaControls}
      >
        {icon && <span className="sb-btn__icon">{icon}</span>}
        {label && <span className="sb-btn__label">{label}</span>}
        <span className="sb-dropdown__chevron" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      <div className="sb-dropdown__content" role="menu">
        <div className="sb-dropdown__content-inner">{children}</div>
      </div>
    </div>
  )
})

export default SidebarDropdown
