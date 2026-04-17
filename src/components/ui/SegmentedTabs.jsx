/**
 * SegmentedTabs — pill-shaped segmented tab bar, reusable across screens.
 * Matches the unified look used in Coach (.tabbar.modal), Optimize, and
 * A/B Testing.
 *
 * The active-pill indicator is a single absolutely-positioned <span> that
 * we move via CSS `transform` + `width`. We measure each tab button's
 * offsetLeft / offsetWidth on mount, on value change, and on resize.
 *
 * Why CSS over framer-motion: this component used to use framer-motion's
 * `layoutId` for the indicator FLIP. That participates in framer-motion's
 * shared layout system, which means any *other* motion component on the
 * page that triggers a layout pass (e.g. a parent with `layout="size"`)
 * would also re-measure the indicator and re-animate it — making the
 * tabbar twitch even when nothing in the tabbar itself changed. With
 * pure CSS the indicator can only move when `value` actually changes.
 *
 * Usage:
 *   <SegmentedTabs
 *     value={viewMode}
 *     onChange={setViewMode}
 *     options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]}
 *     ariaLabel="View mode"
 *   />
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './SegmentedTabs.css'

export function SegmentedTabs({
  value,
  onChange,
  options = [],
  ariaLabel,
  className = '',
  // eslint-disable-next-line no-unused-vars
  layoutId, // accepted for backward compat; CSS slider doesn't need it
}) {
  const listRef = useRef(null)
  const [indicator, setIndicator] = useState({ x: 0, w: 0, ready: false })

  const measure = () => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector('.seg-tab--active')
    if (!active) {
      setIndicator((s) => ({ ...s, ready: false }))
      return
    }
    const x = active.offsetLeft
    const w = active.offsetWidth
    setIndicator((prev) =>
      prev.x === x && prev.w === w && prev.ready ? prev : { x, w, ready: true }
    )
  }

  // Measure synchronously after layout so the very first paint shows the
  // indicator under the active tab — no flash from (0,0).
  useLayoutEffect(() => {
    measure()
     
  }, [value, options.length])

  // Re-measure on container resize (font load, parent width change, etc.)
  // — but NOT on every parent re-render. ResizeObserver only fires on
  // actual size changes.
  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(list)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={`seg-tabs ${className}`}>
      <nav ref={listRef} className="seg-tabs-list" aria-label={ariaLabel}>
        <span
          className={`seg-tab-indicator ${indicator.ready ? 'seg-tab-indicator--ready' : ''}`}
          style={{
            width: indicator.w,
            transform: `translateX(${indicator.x}px)`,
          }}
          aria-hidden="true"
        />
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={value === opt.value}
            className={`seg-tab ${value === opt.value ? 'seg-tab--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon ? <span className="seg-tab-icon">{opt.icon}</span> : null}
            <span className="seg-tab-label">{opt.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default SegmentedTabs
