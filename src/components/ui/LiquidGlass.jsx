/**
 * Liquid glass container — frosted backdrop-blur with subtle border and inset shine.
 * Use as a wrapper for cards, footers, and elevated surfaces.
 */
export default function LiquidGlass({ as = 'div', className = '', children, ...rest }) {
  const Tag = as
  return (
    <Tag className={`liquid-glass ${className}`} {...rest}>
      {children}
    </Tag>
  )
}
