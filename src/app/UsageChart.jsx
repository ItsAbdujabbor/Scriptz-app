/**
 * Simple SVG line chart for usage (scripts per day). UI-matchy with app theme.
 */
export function UsageChart({ data, height = 200, label = 'Scripts' }) {
  if (!data?.length) return null

  const padding = { top: 12, right: 12, bottom: 24, left: 36 }
  const w = 400
  const h = height
  const innerW = w - padding.left - padding.right
  const innerH = h - padding.top - padding.bottom
  const maxVal = Math.max(...data.map((d) => d.value), 1)
  const minVal = 0

  const xScale = (i) => padding.left + (i / (data.length - 1 || 1)) * innerW
  const yScale = (v) => padding.top + innerH - ((v - minVal) / (maxVal - minVal || 1)) * innerH

  const points = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`)
  const linePath = points.length > 1 ? `M ${points.join(' L ')}` : `M ${points[0]} L ${points[0]}`

  const areaPath =
    points.length > 1
      ? `${linePath} L ${xScale(data.length - 1)},${padding.top + innerH} L ${padding.left},${padding.top + innerH} Z`
      : ''

  return (
    <div className="usage-chart-wrap">
      <svg
        className="usage-chart"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label={`${label} over time`}
      >
        <defs>
          <linearGradient id="usage-chart-gradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.25)" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} fill="url(#usage-chart-gradient)" className="usage-chart-area" />}
        <path d={linePath} fill="none" stroke="rgba(139, 92, 246, 0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="usage-chart-line" />
        {data.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.value)} r="3" fill="rgba(139, 92, 246, 0.95)" className="usage-chart-dot" />
        ))}
      </svg>
      <div className="usage-chart-labels">
        {data.length > 0 && <span className="usage-chart-label-start">{data[0].label}</span>}
        {data.length > 1 && <span className="usage-chart-label-end">{data[data.length - 1].label}</span>}
      </div>
    </div>
  )
}
