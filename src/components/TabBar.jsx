import { useRef, useEffect, useState } from 'react'
import './TabBar.css'

/**
 * Reusable tab bar with sliding indicator.
 * @param {Object} props
 * @param {{ id: string, label: string, icon?: React.ReactNode }[]} props.tabs - Tab definitions
 * @param {string} props.value - Active tab id
 * @param {(id: string) => void} props.onChange - Called when tab changes
 * @param {string} [props.ariaLabel] - Accessibility label for tablist
 * @param {string} [props.className] - Additional class for the container
 * @param {string} [props.variant] - 'default' | 'minimal' | 'modal'
 */
export function TabBar({ tabs, value, onChange, ariaLabel = 'Tabs', className = '', variant = 'default' }) {
  const tabsRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 })

  const updateIndicator = () => {
    if (!tabsRef.current) return
    const activeBtn = tabsRef.current.querySelector('.tabbar-tab.is-active')
    if (activeBtn) {
      setIndicatorStyle({
        width: activeBtn.offsetWidth,
        left: activeBtn.offsetLeft,
      })
    }
  }

  useEffect(() => {
    updateIndicator()
    const ro = new ResizeObserver(updateIndicator)
    if (tabsRef.current) ro.observe(tabsRef.current)
    return () => ro.disconnect()
  }, [value])

  return (
    <div ref={tabsRef} className={`tabbar ${variant} ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          id={tab.id ? `tab-${tab.id}` : undefined}
          className={`tabbar-tab ${value === tab.id ? 'is-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon && <span className="tabbar-tab-icon">{tab.icon}</span>}
          <span className="tabbar-tab-label">{tab.label}</span>
        </button>
      ))}
      <span
        className="tabbar-indicator"
        style={{ width: indicatorStyle.width, transform: `translateX(${indicatorStyle.left}px)` }}
        aria-hidden
      />
    </div>
  )
}
