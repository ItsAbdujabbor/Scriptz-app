/**
 * Shared icon library.
 *
 * Every icon used in more than one place lives here so the close-X, plus,
 * chevron, arrow, check, trash, etc. are pixel-identical across screens.
 *
 * Each icon accepts `size` (default 16) and passes other props through, so
 * callers can set `aria-label`, `className`, colour (via `color` or
 * `currentColor` on parent), etc. Stroke weight is standardised at 2 for
 * line icons, with `strokeLinecap` + `strokeLinejoin` always `round` for a
 * friendly look.
 *
 * Convention: feature-specific glyphs stay local to their file (e.g. paint
 * tools in EditThumbnailDialog). Anything that appears on 2+ screens
 * belongs here.
 */

const baseLineProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Svg({ size = 16, viewBox = '0 0 24 24', children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} aria-hidden {...rest}>
      {children}
    </svg>
  )
}

/* ── Navigation / chrome ─────────────────────────────────────────── */

export function IconX({ size, strokeWidth = 2.4, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps} strokeWidth={strokeWidth}>
        <path d="m18 6-12 12" />
        <path d="m6 6 12 12" />
      </g>
    </Svg>
  )
}

export function IconPlus({ size, strokeWidth = 2, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps} strokeWidth={strokeWidth}>
        <path d="M12 5v14M5 12h14" />
      </g>
    </Svg>
  )
}

export function IconChevronDown({ size, strokeWidth = 2.2, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <polyline points="6 9 12 15 18 9" {...baseLineProps} strokeWidth={strokeWidth} />
    </Svg>
  )
}

export function IconChevronUp({ size, strokeWidth = 2.2, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <polyline points="6 15 12 9 18 15" {...baseLineProps} strokeWidth={strokeWidth} />
    </Svg>
  )
}

export function IconChevronLeft({ size, strokeWidth = 2.2, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <polyline points="15 6 9 12 15 18" {...baseLineProps} strokeWidth={strokeWidth} />
    </Svg>
  )
}

export function IconChevronRight({ size, strokeWidth = 2.2, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <polyline points="9 6 15 12 9 18" {...baseLineProps} strokeWidth={strokeWidth} />
    </Svg>
  )
}

export function IconArrowUp({ size, strokeWidth = 2.4, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps} strokeWidth={strokeWidth}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 5 5 12" />
      </g>
    </Svg>
  )
}

export function IconArrowRight({ size, strokeWidth = 2.2, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps} strokeWidth={strokeWidth}>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </g>
    </Svg>
  )
}

export function IconCheck({ size, strokeWidth = 2.4, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <path d="m5 12 5 5L20 7" {...baseLineProps} strokeWidth={strokeWidth} />
    </Svg>
  )
}

/* ── Content / actions ───────────────────────────────────────────── */

export function IconTrash({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </g>
    </Svg>
  )
}

export function IconDownload({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </g>
    </Svg>
  )
}

export function IconEdit({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <path d="M14.7 5.3a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 9.7-9.7z" />
        <path d="M13 7 17 11" />
      </g>
    </Svg>
  )
}

export function IconPreview({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" {...baseLineProps} />
    </Svg>
  )
}

export function IconSearch({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </g>
    </Svg>
  )
}

export function IconCopy({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </g>
    </Svg>
  )
}

/* ── Decorative / brand ──────────────────────────────────────────── */

/** Filled lightning bolt used for the credits/zap indicator. */
export function IconZapFilled({ size = 12, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
    </svg>
  )
}

/** Filled sparkle/star used on AI-generation CTAs. */
export function IconSparkle({ size = 14, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
    </svg>
  )
}

export function IconStar({ size, strokeWidth = 2, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <polygon
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
        {...baseLineProps}
        strokeWidth={strokeWidth}
      />
    </Svg>
  )
}

/* ── Status / system ─────────────────────────────────────────────── */

export function IconLock({ size, strokeWidth = 2.5, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps} strokeWidth={strokeWidth}>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </g>
    </Svg>
  )
}

export function IconInfo({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </g>
    </Svg>
  )
}

export function IconHelp({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </g>
    </Svg>
  )
}

export function IconSettings({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </g>
    </Svg>
  )
}

/* ── People / persona ────────────────────────────────────────────── */

export function IconUser({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <circle cx="12" cy="9" r="3.4" />
        <path d="M5 20.2c1-3.6 3.8-5.6 7-5.6s6 2 7 5.6" />
      </g>
    </Svg>
  )
}

/** "Character" glyph — head silhouette with a sparkle accent. */
export function IconCharacter({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps} strokeWidth="1.8">
        <circle cx="12" cy="9" r="3.4" />
        <path d="M5 20.2c1-3.6 3.8-5.6 7-5.6s6 2 7 5.6" />
      </g>
      <path d="M18.5 4.4 19 3l.5 1.4L21 5l-1.5.6L19 7l-.5-1.4L17 5z" fill="currentColor" />
    </Svg>
  )
}

/** "Character swap" — head silhouette with swap arrows arcing around. */
export function IconCharacterSwap({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <circle cx="12" cy="9" r="3.2" />
        <path d="M6 19c1-3 3.4-4.5 6-4.5s5 1.5 6 4.5" />
        <path d="M3 10.5a6 6 0 0 1 4-4.2" />
        <polyline points="7.2 4.2 7 6.3 9 6.5" />
        <path d="M21 13.5a6 6 0 0 1-4 4.2" />
        <polyline points="16.8 19.8 17 17.7 15 17.5" />
      </g>
    </Svg>
  )
}

/** Artist-palette glyph used for visual-style selectors. */
export function IconStyle({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <path
        d="M12 2.5a9.5 9.5 0 1 0 0 19h1.6a2 2 0 0 0 0-4h-1.1a2 2 0 1 1 0-4H17a5.5 5.5 0 0 0 0-11h-5z"
        {...baseLineProps}
        strokeWidth="1.8"
      />
      <circle cx="8" cy="11" r="1.2" fill="currentColor" />
      <circle cx="10.5" cy="7.5" r="1.2" fill="currentColor" />
      <circle cx="14.8" cy="7.5" r="1.2" fill="currentColor" />
    </Svg>
  )
}

/* ── Nav-rail / feature glyphs (used in Sidebar) ─────────────────── */

export function IconDashboard({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </g>
    </Svg>
  )
}

export function IconImage({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </g>
    </Svg>
  )
}

export function IconChart({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </g>
    </Svg>
  )
}

export function IconAb({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <g {...baseLineProps}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
        <path d="M15 3v18" />
      </g>
    </Svg>
  )
}

export function IconMessage({ size, ...rest }) {
  return (
    <Svg size={size} {...rest}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" {...baseLineProps} />
    </Svg>
  )
}

/* ── Loading ─────────────────────────────────────────────────────── */

/** CSS-animated spinner. Uses currentColor so caller controls hue. */
export function IconSpinner({ size = 14 }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        animation: 'ui-icon-spin 0.7s linear infinite',
      }}
    >
      <style>{`@keyframes ui-icon-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}
