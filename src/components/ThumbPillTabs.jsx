import { memo } from 'react'

/**
 * ThumbPillTabs — minimal group of pill-shaped tab buttons.
 *
 * Renders a horizontal list of `options` ({ value, label, icon }) and
 * highlights the one matching `value`. `onChange(nextValue)` fires on
 * click. `align` controls horizontal placement inside the tab row
 * ("left" | "right").
 *
 * `memo`-wrapped so parent re-renders (which happen whenever the user
 * types into the composer textarea) don't re-render the tab row
 * unless its own props actually change. Keeps tab interactions cheap
 * on long threads where the parent component is heavy.
 */
function ThumbPillTabsImpl({ options, value, onChange, ariaLabel, align = 'left' }) {
  const alignClass =
    align === 'right' ? ' thumb-gen-pill-tab-group--right' : ''
  return (
    <div
      className={`thumb-gen-pill-tab-group${alignClass}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`thumb-gen-pill-tab${active ? ' thumb-gen-pill-tab--active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export const ThumbPillTabs = memo(ThumbPillTabsImpl)
