/**
 * PrimaryPill — the canonical button component.
 *
 * Replaces (and is visually identical to) the previous per-screen button
 * components: PrimaryActionBtn (EditThumbnailDialog), ThumbSendPill
 * (ThumbnailGenerator), VOSendPill (VideoOptimizeModal), .abt-btn--primary,
 * .auth-btn. Use this for every primary CTA in the app.
 *
 * Basic usage:
 *   <PrimaryPill label="Save" onClick={save} />
 *
 * With credit cost chip (reads the live per-tier cost from the billing
 * cache and shows `⚡ N` on the left, separated by a divider):
 *   <PrimaryPill
 *     featureKey="video_thumbnail_generate"
 *     count={batchSize}
 *     label="Generate"
 *     icon={<IconArrowUp />}
 *     onClick={run}
 *   />
 *
 * Variants: `primary` (gradient, default) · `ghost` (translucent) · `danger`.
 * Sizes: `sm` (32px) · `md` (38px, default) · `lg` (44px).
 * Shape: pill by default, set `rect` to switch to rounded-rectangle
 * (matches the older `.abt-btn` / `.auth-btn` shape — use sparingly).
 *
 * Busy state:
 *   <PrimaryPill busy label="Save" busyLabel="Saving…" />
 * While `busy` is true the pill is disabled and renders a spinner + the
 * `busyLabel` (or the regular label if `busyLabel` is not given).
 */
import { forwardRef } from 'react'
import { useCostOf } from '../../queries/billing/creditsQueries'
import { IconSpinner, IconZapFilled } from './icons'
import './PrimaryPill.css'

const cn = (...parts) => parts.filter(Boolean).join(' ')

export const PrimaryPill = forwardRef(function PrimaryPill(
  {
    // Content
    label,
    busyLabel,
    icon,
    // Behaviour
    onClick,
    disabled,
    busy,
    type = 'button',
    // Look
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    rect = false,
    // Credit badge (optional)
    featureKey,
    count = 1,
    showCost = true,
    // Passthrough
    className,
    ariaLabel,
    ...rest
  },
  ref
) {
  // Only read cost when a featureKey is supplied — otherwise the hook is
  // still called (React rules of hooks) but the caller has no chip.
  const { total } = useCostOf(featureKey || 'noop', count)
  const renderCost = Boolean(featureKey) && showCost && total > 0

  const classes = cn(
    'pp',
    `pp--${variant}`,
    size !== 'md' && `pp--${size}`,
    fullWidth && 'pp--full',
    rect && 'pp--rect',
    className
  )

  const isDisabled = Boolean(disabled || busy)

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      aria-label={ariaLabel || label}
      {...rest}
    >
      {busy ? (
        <>
          <IconSpinner size={size === 'sm' ? 11 : 14} />
          {(busyLabel || label) && <span className="pp-label">{busyLabel || label}</span>}
        </>
      ) : (
        <>
          {renderCost && (
            <span className="pp-cost" aria-hidden>
              <span className="pp-cost-zap">
                <IconZapFilled size={12} />
              </span>
              <span className="pp-cost-num">{total}</span>
            </span>
          )}
          {label && <span className="pp-label">{label}</span>}
          {icon && <span className="pp-icon">{icon}</span>}
        </>
      )}
    </button>
  )
})

export default PrimaryPill
