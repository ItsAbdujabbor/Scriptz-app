import { memo } from 'react'
import './ThumbPillTabs.css'

/**
 * Crown — Pro-feature signpost. Painted as a small overlay on tabs
 * whose `premium` flag is true. Amber fill so it pops against the
 * dark pill body without depending on the active state. */
function IconCrown() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 8.5l3.5 3 3-5 2.5 4 2.5-4 3 5L21 8.5l-1.5 8.5h-15L3 8.5z" />
      <path d="M4.5 18.5h15v1.5h-15z" />
    </svg>
  )
}

/**
 * ThumbPillTabs — minimal group of pill-shaped tab buttons.
 *
 * Renders a horizontal list of `options` ({ value, label, icon, premium? })
 * and highlights the one matching `value`. `onChange(nextValue)` fires
 * on click. `align` controls horizontal placement ("left" | "right").
 *
 * If an option has `premium: true`, a small amber crown is painted in
 * the top-right corner of that tab — visual signpost only, no
 * behavioural change (the actual gate lives on the submit handler).
 *
 * `memo`-wrapped so parent re-renders don't re-render the tab row
 * unless its own props actually change.
 */
function ThumbPillTabsImpl({ options, value, onChange, ariaLabel, align = 'left' }) {
  const alignClass = align === 'right' ? ' thumb-gen-pill-tab-group--right' : ''
  return (
    <div className={`thumb-gen-pill-tab-group${alignClass}`} role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`thumb-gen-pill-tab${active ? ' thumb-gen-pill-tab--active' : ''}${opt.premium ? ' thumb-gen-pill-tab--premium' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
            <span>{opt.label}</span>
            {opt.premium ? (
              <span className="clixa-pro-crown" aria-hidden>
                <IconCrown />
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export const ThumbPillTabs = memo(ThumbPillTabsImpl)
