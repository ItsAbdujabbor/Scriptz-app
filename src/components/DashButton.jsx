import { forwardRef } from 'react'

/**
 * Reusable dashboard button with consistent styling and press animation.
 *
 * @param {'primary' | 'secondary' | 'ghost'} variant
 * @param {'md' | 'sm'} size
 * @param {boolean} asLink - render as <a> instead of <button>
 * @param {string} className - additional classes
 */
export const DashButton = forwardRef(function DashButton(
  { variant = 'primary', size = 'md', asLink, className, children, ...rest },
  ref
) {
  const cls = ['dash-btn', `dash-btn--${variant}`, size === 'sm' && 'dash-btn--sm', className]
    .filter(Boolean)
    .join(' ')

  if (asLink) {
    return (
      <a ref={ref} className={cls} {...rest}>
        {children}
      </a>
    )
  }

  return (
    <button ref={ref} type="button" className={cls} {...rest}>
      {children}
    </button>
  )
})
