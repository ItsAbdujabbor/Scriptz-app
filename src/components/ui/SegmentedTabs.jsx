/**
 * SegmentedTabs — pill-shaped segmented tab bar, reusable across screens.
 * Matches the unified look used in Coach (.tabbar.modal), Optimize, and
 * A/B Testing. framer-motion slides the active indicator between tabs.
 *
 * Usage:
 *   <SegmentedTabs
 *     value={viewMode}
 *     onChange={setViewMode}
 *     options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]}
 *     ariaLabel="View mode"
 *     layoutId="abt-view-toggle"   // framer-motion id — pass a unique string per usage
 *   />
 */
import { motion } from 'framer-motion' // eslint-disable-line no-unused-vars
import './SegmentedTabs.css'

let uid = 0
function nextLayoutId() {
  uid += 1
  return `segmented-tabs-${uid}`
}

export function SegmentedTabs({
  value,
  onChange,
  options = [],
  ariaLabel,
  layoutId,
  className = '',
}) {
  const indicatorId = layoutId || nextLayoutId()
  return (
    <div className={`seg-tabs ${className}`}>
      <nav className="seg-tabs-list" aria-label={ariaLabel}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={value === opt.value}
            className={`seg-tab ${value === opt.value ? 'seg-tab--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            <span className="seg-tab-label">{opt.label}</span>
            {value === opt.value && (
              <motion.span
                className="seg-tab-indicator"
                layoutId={indicatorId}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default SegmentedTabs
