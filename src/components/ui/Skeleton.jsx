/**
 * Skeleton — canonical shimmer-skeleton primitives.
 *
 * One violet diagonal sweep animates every loading surface in the app. Wrap
 * clustered placeholders in `<SkeletonGroup>` so the cluster animates as a
 * single unified motion instead of each block sweeping on its own.
 *
 * Exports:
 *   Skeleton            — base shimmer block
 *   SkeletonText        — N stacked bars with progressive widths
 *   SkeletonCircle      — sugar for a circular Skeleton
 *   SkeletonCard        — image placeholder + text lines (mirrors a card)
 *   SkeletonList        — N rows at fixed height
 *   SkeletonThumbGrid   — grid of 16:9 tiles
 *   SkeletonVideoRow    — 96 px thumb + 2-line text (Optimize / ABT row)
 *   SkeletonGroup       — wraps a cluster so one sweep owns the whole group
 *   InlineSpinner       — tiny ring for button `isPending`
 *   PageSkeleton        — full-bleed centered wrapper for route-level loading
 */
import './Skeleton.css'

const DEFAULT_TEXT_WIDTHS = ['100%', '88%', '62%']

function mergeStyle(base, extra) {
  if (!extra) return base
  return { ...base, ...extra }
}

export function Skeleton({ width, height, radius = 10, className = '', style, ariaHidden = true }) {
  const s = mergeStyle(
    {
      width: width ?? '100%',
      height: height ?? 12,
      borderRadius: radius,
    },
    style
  )
  return <span className={`sk ${className}`.trim()} style={s} aria-hidden={ariaHidden} />
}

export function SkeletonText({
  lines = 3,
  widths = DEFAULT_TEXT_WIDTHS,
  gap = 8,
  lineHeight = 12,
  className = '',
}) {
  const rows = Array.from({ length: lines }, (_, i) => widths[i] ?? widths[widths.length - 1])
  return (
    <div className={`sk-text ${className}`.trim()} style={{ gap }} aria-hidden="true">
      {rows.map((w, i) => (
        <span
          key={i}
          className="sk sk-text-line"
          style={{ width: w, height: lineHeight, borderRadius: 999 }}
        />
      ))}
    </div>
  )
}

export function SkeletonCircle({ size = 24, className = '', style }) {
  return (
    <Skeleton
      className={`sk-circle ${className}`.trim()}
      width={size}
      height={size}
      radius={size / 2}
      style={style}
    />
  )
}

export function SkeletonCard({ ratio = '16 / 9', lines = 2, widths, padding, className = '' }) {
  const body = (
    <div className="sk-card-body" style={padding != null ? { padding } : undefined}>
      <Skeleton height={14} width="80%" radius={999} />
      {lines > 1 ? (
        <SkeletonText
          lines={lines - 1}
          widths={widths ?? DEFAULT_TEXT_WIDTHS.slice(1, lines)}
          lineHeight={10}
        />
      ) : null}
    </div>
  )
  return (
    <div className={`sk-card ${className}`.trim()} aria-hidden="true">
      <span className="sk sk-card-image" style={{ aspectRatio: ratio }} />
      {body}
    </div>
  )
}

export function SkeletonList({ count = 3, rowHeight = 72, gap = 10, className = '' }) {
  return (
    <div className={`sk-list ${className}`.trim()} style={{ gap }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={rowHeight} radius={12} />
      ))}
    </div>
  )
}

export function SkeletonThumbGrid({ cols = 2, count = 4, ratio = '16 / 9', className = '' }) {
  return (
    <div
      className={`sk-thumb-grid ${className}`.trim()}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="sk" style={{ aspectRatio: ratio }} />
      ))}
    </div>
  )
}

export function SkeletonVideoRow({ className = '' }) {
  return (
    <div className={`sk-video-row ${className}`.trim()} aria-hidden="true">
      <span className="sk sk-video-row-thumb" />
      <div className="sk-video-row-text">
        <Skeleton height={14} width="84%" radius={999} />
        <Skeleton height={10} width="48%" radius={999} />
      </div>
    </div>
  )
}

export function SkeletonGroup({ children, className = '', label = 'Loading' }) {
  return (
    <div
      className={`sk-group ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {children}
      {label ? <span className="sk-sr-only">{label}</span> : null}
    </div>
  )
}

export function InlineSpinner({ size = 12, className = '', light = false }) {
  return (
    <span
      className={`sk-spinner ${light ? 'sk-spinner--light' : ''} ${className}`.trim()}
      style={{ '--sk-spin-size': `${size}px` }}
      aria-hidden="true"
    />
  )
}

export function PageSkeleton({ children, className = '', label = 'Loading page' }) {
  return (
    <div
      className={`sk-page ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="sk-page-inner">{children}</div>
      <span className="sk-sr-only">{label}</span>
    </div>
  )
}

export default Skeleton
