import { useCallback, useEffect, useRef, useState } from 'react'
import { rafThrottle } from '../lib/rafThrottle'
import './TabBar.css'

/**
 * Reusable tab bar. Variants: default (underline indicator), minimal, modal, segmented (sliding pill).
 * @param {{ id: string, label: string, icon?: React.ReactNode }[]} props.tabs
 * @param {string} [props.variant] - 'default' | 'minimal' | 'modal' | 'segmented'
 */
export function TabBar({
  tabs,
  value,
  onChange,
  ariaLabel = 'Tabs',
  className = '',
  variant = 'default',
  showIndicator = true,
}) {
  const tabsRef = useRef(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 })
  const [segmentStyle, setSegmentStyle] = useState({
    width: 0,
    height: 0,
    transform: 'translate(0px, 0px)',
    ready: false,
  })

  const isSegmented = variant === 'segmented'
  const isModal = variant === 'modal'
  const usesSlider = isSegmented
  const effectiveShowIndicator = showIndicator && !isSegmented && !isModal

  const updateIndicator = () => {
    if (!effectiveShowIndicator || !tabsRef.current) return
    const activeBtn = tabsRef.current.querySelector('.tabbar-tab.is-active')
    if (activeBtn) {
      setIndicatorStyle({
        width: activeBtn.offsetWidth,
        left: activeBtn.offsetLeft,
      })
    }
  }

  const updateSegment = useCallback(() => {
    if (!usesSlider || !tabsRef.current) return
    const root = tabsRef.current
    const activeBtn = root.querySelector('.tabbar-tab.is-active')
    if (!activeBtn) {
      setSegmentStyle((s) => ({ ...s, ready: false }))
      return
    }
    const r = root.getBoundingClientRect()
    const b = activeBtn.getBoundingClientRect()
    setSegmentStyle({
      width: b.width,
      height: b.height,
      transform: `translate(${b.left - r.left}px, ${b.top - r.top}px)`,
      ready: b.width > 0 && b.height > 0,
    })
  }, [usesSlider])

  useEffect(() => {
    if (!effectiveShowIndicator) return
    updateIndicator()
    const ro = new ResizeObserver(updateIndicator)
    if (tabsRef.current) ro.observe(tabsRef.current)
    return () => ro.disconnect()
  }, [value, effectiveShowIndicator, tabs.length])

  useEffect(() => {
    if (!usesSlider) return
    const throttled = rafThrottle(updateSegment)
    throttled()
    const ro = new ResizeObserver(throttled)
    if (tabsRef.current) ro.observe(tabsRef.current)
    window.addEventListener('resize', throttled)
    return () => {
      throttled.cancel()
      ro.disconnect()
      window.removeEventListener('resize', throttled)
    }
  }, [usesSlider, value, tabs.length, updateSegment])

  return (
    <div
      ref={tabsRef}
      className={`tabbar ${variant} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
    >
      {usesSlider ? (
        <span
          className={`tabbar-segment-highlight ${segmentStyle.ready ? 'tabbar-segment-highlight--ready' : ''}`}
          style={{
            width: segmentStyle.width,
            height: segmentStyle.height,
            transform: segmentStyle.transform,
          }}
          aria-hidden
        />
      ) : null}
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
      {effectiveShowIndicator ? (
        <span
          className="tabbar-indicator"
          style={{ width: indicatorStyle.width, transform: `translateX(${indicatorStyle.left}px)` }}
          aria-hidden
        />
      ) : null}
    </div>
  )
}
