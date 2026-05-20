/**
 * EditThumbnailDialog — compact, centered AI editor for an existing thumbnail.
 *
 * Layout (top → bottom):
 *   1. Gradient title pill + close X.
 *   2. Thumbnail + painted-mask overlay (Fabric-free canvas drawing).
 *   3. Toolbar row (Edit tab only):
 *        left  → Rect · Brush · Eraser · Brush-size · Colour
 *        right → Undo · Redo · Clear
 *   4. Pill tabbar (Edit | Character swap).
 *   5. Floating-glass input bar (matches Optimize Video) with batch
 *      picker and send. Face-swap tab shows `<PersonaSelector>` in the
 *      action row.
 *
 * All inline-styled + portaled so no global CSS can break it.
 *
 * Mask exports: if the user painted something, we build a B&W PNG
 * (white where painted, black elsewhere) at the image's natural
 * resolution. If nothing is painted we fall back to a full-white mask
 * — i.e. "edit the whole image" — so the AI always has something to
 * work with.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Square as LucideSquare,
  Paintbrush as LucidePaintbrush,
  Eraser as LucideEraser,
  Undo2 as LucideUndo2,
  Redo2 as LucideRedo2,
  Trash2 as LucideTrash2,
  Pencil as LucidePencil,
  UserRoundCog as LucideUserRoundCog,
} from 'lucide-react'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import { invalidateCredits, useCostOf } from '../queries/billing/creditsQueries'
import { PrimaryPill } from './ui/PrimaryPill'
import { Dialog } from './ui/Dialog'
import { ThumbPillTabs } from './ThumbPillTabs'
import { usePersonaStore } from '../stores/personaStore'
import { usePersonasQuery } from '../queries/personas/personaQueries'
import { PersonasModal } from '../app/PersonasModal'
import GenerationProgress from './GenerationProgress'
import { friendlyMessage } from '../lib/aiErrors'
import { canvasToBase64Png } from '../lib/canvasToBase64'
// Responsive overrides — media-query rules the inline styles can't
// express without a JS resize listener. Class hooks live on the
// content wrap / toolbar / input card; see the .css file for the
// breakpoints they target.
import './EditThumbnailDialog.css'

const PRIMARY_GRADIENT = 'var(--accent-gradient)'
const MASK_CSS_OPACITY = 0.72
const MASK_THRESHOLD = 10
const UNDO_CAP = 20

/**
 * Chaikin corner-cutting smoothing for a closed polygon.
 * Each iteration replaces every edge with two points at 1/4 and 3/4
 * along the edge, converging on a smooth quadratic B-spline.
 * Input/output: Float32Array [x0,y0,x1,y1,...].
 */
function chaikinSmooth(input, iterations) {
  let cur = input instanceof Float32Array ? input : new Float32Array(input)
  for (let iter = 0; iter < iterations; iter++) {
    const n = cur.length >> 1
    const out = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const x0 = cur[i * 2],
        y0 = cur[i * 2 + 1]
      const x1 = cur[j * 2],
        y1 = cur[j * 2 + 1]
      out[i * 4 + 0] = 0.75 * x0 + 0.25 * x1
      out[i * 4 + 1] = 0.75 * y0 + 0.25 * y1
      out[i * 4 + 2] = 0.25 * x0 + 0.75 * x1
      out[i * 4 + 3] = 0.25 * y0 + 0.75 * y1
    }
    cur = out
  }
  return cur
}

/**
 * Convert a flat [x,y,...] polygon to a smooth SVG closed path.
 * Uses the midpoint-bezier technique: each original vertex becomes a
 * quadratic bezier control point; midpoints between vertices are the
 * on-curve anchors. This produces a C1-continuous curve with no
 * visible corners even on coarse polygons.
 */
function polygonToSmoothPath(pts, scale) {
  const n = pts.length >> 1
  if (n < 3) return ''
  const f = (v) => (v * scale).toFixed(1)
  // Close smoothly: start at the midpoint of the last→first edge
  const lx = pts[(n - 1) * 2],
    ly = pts[(n - 1) * 2 + 1]
  let d = `M${f((pts[0] + lx) / 2)},${f((pts[1] + ly) / 2)}`
  for (let i = 0; i < n; i++) {
    const cx = pts[i * 2],
      cy = pts[i * 2 + 1]
    const j = (i + 1) % n
    const ex = (cx + pts[j * 2]) / 2
    const ey = (cy + pts[j * 2 + 1]) / 2
    d += `Q${f(cx)},${f(cy)},${f(ex)},${f(ey)}`
  }
  return d + 'Z'
}

const COLOR_SWATCHES = [
  // Brand deep-purple first — matches the rest of the product accent
  // (--accent-gradient, the generate/score pill, the prompt focus ring)
  // so the default brush colour reads as "in the product family"
  // instead of a random alarm-red. Index 0 is the React-state default.
  '#7c3aed', // deep purple (brand accent)
  '#EF4444', // red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#06B6D4', // cyan
  '#FFFFFF', // white
]

// Brush-size preset chips — the popover renders these as a row of
// dots that visually scale up so the user picks by *appearance* of
// the stroke they'll be making, not by reading a number off a
// slider. Covers fine-detail (8px) through bold area-fill (96px).
const BRUSH_SIZE_PRESETS = [8, 16, 32, 56, 96]
const BRUSH_PREVIEW_MIN = 6
const BRUSH_PREVIEW_MAX = 22

/* ── Icons ────────────────────────────────────────────────────────── */
function Svg({ path, size = 16, strokeWidth = 2 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden
    >
      {path}
    </svg>
  )
}
const IconX = (p) => (
  <Svg
    {...p}
    strokeWidth={2.4}
    path={
      <>
        <path d="m18 6-12 12" />
        <path d="m6 6 12 12" />
      </>
    }
  />
)
const IconSparkle = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden>
    <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
  </svg>
)
const IconPencil = ({ size = 13 }) => <LucidePencil size={size} strokeWidth={2.2} aria-hidden />
const IconFaceSwap = ({ size = 14 }) => (
  <LucideUserRoundCog size={size} strokeWidth={2.2} aria-hidden />
)
const IconChevron = (p) => (
  <Svg {...p} strokeWidth={2.4} path={<polyline points="6 9 12 15 18 9" />} />
)
const IconLayers = (p) => (
  <Svg
    {...p}
    path={
      <>
        <polygon points="12 3 21 8 12 13 3 8 12 3" />
        <polyline points="3 13 12 18 21 13" />
      </>
    }
  />
)
const IconZapFilled = ({ size = 12 }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} aria-hidden>
    <path d="M13 2 3 14h7l-1 8 11-13h-8l1-7z" />
  </svg>
)
const IconArrowUp = (p) => (
  <Svg
    {...p}
    strokeWidth={2.4}
    path={
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 5 5 12" />
      </>
    }
  />
)
// Tool + history icons come from `lucide-react` for visual parity
// with the rest of the composer (the thumbnail generator's toolbar
// pills and the persona/style selectors all draw from the same set).
// `strokeWidth: 2.2` matches the slightly heavier weight used on the
// composer-level icons so the editor doesn't read as thinner.
const IconRect = ({ size = 14 }) => <LucideSquare size={size} strokeWidth={2.2} aria-hidden />
const IconBrush = ({ size = 14 }) => <LucidePaintbrush size={size} strokeWidth={2.2} aria-hidden />
const IconEraser = ({ size = 14 }) => <LucideEraser size={size} strokeWidth={2.2} aria-hidden />
const IconUndo = ({ size = 14 }) => <LucideUndo2 size={size} strokeWidth={2.4} aria-hidden />
const IconRedo = ({ size = 14 }) => <LucideRedo2 size={size} strokeWidth={2.4} aria-hidden />
const IconTrash = ({ size = 14 }) => <LucideTrash2 size={size} strokeWidth={2.2} aria-hidden />

/* ── Helpers ──────────────────────────────────────────────────────── */
function extractBase64FromDataUrl(url) {
  if (!url || typeof url !== 'string') return null
  const comma = url.indexOf(',')
  if (!url.startsWith('data:') || comma === -1) return null
  return url.slice(comma + 1)
}

async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = url.startsWith('data:') ? '' : 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Could not load image.'))
    el.src = url
  })
}

function hexToRgba(hex, alpha = 1) {
  const m = hex.replace('#', '')
  const v =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m
  const r = parseInt(v.slice(0, 2), 16)
  const g = parseInt(v.slice(2, 4), 16)
  const b = parseInt(v.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/* ── Batch picker (matches VideoOptimize) ─────────────────────────── */
/* Hoisted style constants: keeping these at module scope means React gets
   the same object identity every render, which preserves memoisation and
   removes ~45 object allocations per BatchRowBtn render in hot paths. The
   dialog's "inline styles for isolation" guarantee is unchanged — same
   style surface, just referentially stable. */
const BRB_WRAPPER = { position: 'relative', width: '100%' }
const BRB_BUTTON_BASE = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '10px 14px',
  gap: 10,
  borderRadius: 12,
  color: 'rgba(255,255,255,0.9)',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 500,
  transition: 'background 0.18s ease, border-color 0.18s ease',
}
const BRB_ICON_WRAP = { display: 'inline-flex', opacity: 0.75 }
const BRB_LABEL = { flex: 1, textAlign: 'left' }
const BRB_CHEVRON_BASE = { opacity: 0.6, transition: 'transform 0.2s', display: 'inline-flex' }
const BRB_CHEVRON_OPEN = { ...BRB_CHEVRON_BASE, transform: 'rotate(180deg)' }
const BRB_CHEVRON_CLOSED = { ...BRB_CHEVRON_BASE, transform: 'none' }
const BRB_LIST = {
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  display: 'flex',
  gap: 4,
  padding: 4,
  background: 'rgba(14, 14, 18, 0.92)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  boxShadow: '0 10px 32px rgba(0,0,0,0.55)',
  backdropFilter: 'blur(22px) saturate(180%)',
  WebkitBackdropFilter: 'blur(22px) saturate(180%)',
  zIndex: 10,
  animation: 'etd-fade-in 0.18s cubic-bezier(0.32, 0.72, 0, 1) both',
}
const BRB_OPTION_BASE = {
  flex: 1,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background 0.15s ease, color 0.15s ease',
}
const BRB_OPTION_SELECTED = {
  ...BRB_OPTION_BASE,
  color: '#ffffff',
  background: 'rgba(255,255,255,0.14)',
}
const BRB_OPTION_UNSELECTED = {
  ...BRB_OPTION_BASE,
  color: 'rgba(255,255,255,0.6)',
  background: 'transparent',
}
const BRB_COUNTS = [1, 2, 3, 4]

function BatchRowBtn({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', onDoc)
      return () => document.removeEventListener('click', onDoc)
    }
  }, [open])
  const buttonStyle = {
    ...BRB_BUTTON_BASE,
    border: `1px solid ${open ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
    background: open ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.05)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }
  return (
    <div ref={ref} style={BRB_WRAPPER}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${value} ${value === 1 ? 'variant' : 'variants'} per run`}
        style={buttonStyle}
      >
        <span style={BRB_ICON_WRAP}>
          <IconLayers size={16} />
        </span>
        <span style={BRB_LABEL}>
          {value} {value === 1 ? 'variant' : 'variants'}
        </span>
        <span style={open ? BRB_CHEVRON_OPEN : BRB_CHEVRON_CLOSED}>
          <IconChevron size={14} />
        </span>
      </button>
      {open && !disabled && (
        <div role="listbox" style={BRB_LIST}>
          {BRB_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={n === value}
              onClick={() => {
                onChange(n)
                setOpen(false)
              }}
              style={n === value ? BRB_OPTION_SELECTED : BRB_OPTION_UNSELECTED}
            >
              {n}×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BatchPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', onDoc)
      return () => document.removeEventListener('click', onDoc)
    }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <CircleBtn
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title="Variants per run"
        label={`${value}×`}
      />
      {open && !disabled && (
        <Popover>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              aria-selected={n === value}
              onClick={() => {
                onChange(n)
                setOpen(false)
              }}
              style={popoverOptionStyle(n === value)}
            >
              {n}
            </button>
          ))}
        </Popover>
      )}
    </div>
  )
}

/* ── Reusable circle button + popover ─────────────────────────────── */
function CircleBtn({ onClick, disabled, active, title, children, label, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active ? true : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        flexShrink: 0,
        padding: 0,
        color: active ? '#ffffff' : danger ? 'rgba(255,180,180,0.85)' : 'rgba(255,255,255,0.78)',
        background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '50%',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'inherit',
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.005em',
        transition:
          'background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.12s cubic-bezier(0.33, 1, 0.68, 1)',
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.9)'
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = ''
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = ''
      }}
    >
      {children}
      {label}
    </button>
  )
}

/**
 * PrimaryActionBtn — thin adapter around the shared <PrimaryPill>. The
 * dialog's call sites used to pass `creditCost` (a pre-computed number)
 * instead of `featureKey`; we forward that as a display-only number via a
 * `count` of 1 against a synthetic feature key — but since call sites
 * actually know the cost already, we just render it as the label prefix
 * when provided and skip the PrimaryPill cost chip. Simpler: we let
 * PrimaryPill render its own `featureKey`-driven cost where we have a
 * feature key, and fall back to a plain pill when we only have a raw
 * number. Until call sites are updated to pass `featureKey`, we pass
 * `creditCost` through via a tiny custom element that mimics the chip.
 */
function PrimaryActionBtn({
  onClick,
  disabled,
  busy,
  label,
  busyLabel,
  icon,
  fullWidth = false,
  ariaLabel,
  creditCost,
}) {
  // Prepend the credit chip inline if a raw cost was given. PrimaryPill's
  // built-in cost chip needs a featureKey; this dialog computes the cost
  // upstream via useCostOf('thumbnail_edit_faceswap'), so we feed the
  // number straight in as a leading span.
  const showCost = creditCost != null && creditCost > 0
  return (
    <PrimaryPill
      type="button"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      busy={busy}
      busyLabel={busyLabel || 'Working…'}
      label={
        showCost ? (
          <>
            <span
              aria-hidden
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                lineHeight: 1,
                paddingRight: '0.45rem',
                marginRight: '0.15rem',
                borderRight: '1px solid rgba(255, 255, 255, 0.22)',
              }}
            >
              <IconZapFilled size={11} />
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                }}
              >
                {creditCost}
              </span>
            </span>
            {label}
          </>
        ) : (
          label
        )
      }
      icon={icon}
      fullWidth={fullWidth}
      ariaLabel={ariaLabel || label}
    />
  )
}

function Popover({ children }) {
  return (
    <div
      role="listbox"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        padding: 4,
        background: 'rgba(14, 14, 18, 0.88)',
        border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        boxShadow: '0 10px 32px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        zIndex: 10,
        animation: 'etd-popover-in 0.18s cubic-bezier(0.32, 0.72, 0, 1) both',
      }}
    >
      {children}
    </div>
  )
}

function popoverOptionStyle(isActive) {
  return {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 999,
    fontSize: '0.72rem',
    fontWeight: 700,
    fontFamily: 'inherit',
    color: isActive ? '#ffffff' : 'rgba(255,255,255,0.6)',
    background: isActive ? 'rgba(255,255,255,0.14)' : 'transparent',
    cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease',
  }
}

// Mode-tab options consumed by `<ThumbPillTabs>`. Same { value, label,
// icon } contract the generator's tab row uses.
const EDIT_MODE_OPTIONS = [
  { value: 'edit', label: 'Edit', icon: <IconPencil size={13} /> },
  { value: 'faceswap', label: 'Face swap', icon: <IconFaceSwap size={14} /> },
]

/**
 * BrushSizePopover — preset chip selector. Each chip renders a dot
 * scaled to its preset value so the user picks by visual size, not
 * by reading a number. Tapping a chip commits the size and the
 * active chip glows so the current size always reads at a glance.
 */
function BrushSizePopover({ value, onChange }) {
  return (
    <div
      role="listbox"
      aria-label="Brush size"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: 8,
        background: 'rgba(14, 14, 18, 0.88)',
        border: '0.5px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        boxShadow: '0 10px 32px rgba(0,0,0,0.55)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        zIndex: 10,
        animation: 'etd-popover-in 0.18s cubic-bezier(0.32, 0.72, 0, 1) both',
      }}
    >
      {BRUSH_SIZE_PRESETS.map((sz) => {
        const active = value === sz
        // Map preset → dot diameter inside its 36px chip. Largest
        // preset still leaves a comfortable rim of breathing room.
        const span = BRUSH_SIZE_PRESETS[BRUSH_SIZE_PRESETS.length - 1] - BRUSH_SIZE_PRESETS[0]
        const t = (sz - BRUSH_SIZE_PRESETS[0]) / span
        const dot = BRUSH_PREVIEW_MIN + Math.round(t * (BRUSH_PREVIEW_MAX - BRUSH_PREVIEW_MIN))
        return (
          <button
            key={sz}
            type="button"
            role="option"
            aria-selected={active}
            aria-label={`Brush size ${sz} pixels`}
            title={`${sz}px`}
            onClick={() => onChange(sz)}
            style={{
              width: 36,
              height: 36,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: `1px solid ${active ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.08)'}`,
              background: active ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.04)',
              color: active ? '#ffffff' : 'rgba(255,255,255,0.78)',
              cursor: 'pointer',
              transition:
                'background 0.15s ease, border-color 0.15s ease, transform 0.12s cubic-bezier(0.33, 1, 0.68, 1)',
            }}
          >
            <span
              style={{
                width: dot,
                height: dot,
                borderRadius: '50%',
                background: 'currentColor',
                boxShadow: active ? '0 0 12px rgba(167,139,250,0.5)' : 'none',
              }}
              aria-hidden
            />
          </button>
        )
      })}
    </div>
  )
}

/* ── Component ────────────────────────────────────────────────────── */
export function EditThumbnailDialog({
  imageUrl,
  onClose,
  onApply,
  onError,
  // Optional persistence-lifecycle callbacks. When provided, the dialog
  // pre-persists a pending event row BEFORE calling /edit-region or
  // /face-swap and finalizes it once the result/error is known. This
  // makes mid-flight refresh survive (the conversation reload picks up
  // the pending row), and makes failures durable instead of toast-only.
  // When omitted the dialog falls back to its legacy fire-and-forget
  // behaviour — the parent's `onApply` / `onError` carry the
  // persistence load (legacy path).
  //
  //   onBeforeSubmit({ mode, prompt, sourceImageUrl, persona, batch })
  //     → Promise<{ pendingMessageId: number | null }>
  //
  //   onSubmitFinalize({ pendingMessageId, mode, prompt, sourceImageUrl,
  //                      persona, urls })
  //     → Promise<void>  (after a successful submit; parent updates the
  //                       row in-place + binds local optimistic state)
  //
  //   onSubmitErrorFinalize({ pendingMessageId, mode, prompt,
  //                           sourceImageUrl, persona, error })
  //     → Promise<void>  (after a failed submit; parent converts the
  //                       pending row into a failure card)
  onBeforeSubmit,
  onSubmitFinalize,
  onSubmitErrorFinalize,
}) {
  const [mode, setMode] = useState('edit') // 'edit' | 'faceswap'
  const [editPrompt, setEditPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // PersonasModal writes the selected persona into the same store via
  // setSelectedPersona, so the edit dialog only needs to READ here.
  // ``clearSelectedPersona`` is still used by the inline chip's ✕ button.
  const { selectedPersona, clearSelectedPersona } = usePersonaStore()
  const [charPickerOpen, setCharPickerOpen] = useState(false)
  // The picker is for selection only. When the user needs to create
  // a brand-new character they click "Create new" inside the picker,
  // which closes the picker and opens the full PersonasModal (the
  // management UI with the create form / favourite / delete / rename
  // affordances).
  const [personasModalOpen, setPersonasModalOpen] = useState(false)
  const charPickerTriggerRef = useRef(null)

  // Drawing state
  const [tool, setTool] = useState('brush') // 'rect' | 'brush' | 'eraser'
  const [brushSize, setBrushSize] = useState(32)
  const [color, setColor] = useState(COLOR_SWATCHES[0])
  const [hasDrawn, setHasDrawn] = useState(false)
  const [undoDepth, setUndoDepth] = useState(0)
  const [redoDepth, setRedoDepth] = useState(0)
  const [sizePopoverOpen, setSizePopoverOpen] = useState(false)
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false)
  // Marching ants — SVG path string of the selection boundary + canvas
  // Marching ants — always-rendered SVG whose opacity is toggled
  // imperatively so the CSS animation never restarts (no flicker).
  // marqueePath + canvasDims drive the path/viewBox; the SVG element
  // itself stays in the DOM at all times.
  const [marqueePath, setMarqueePath] = useState('')
  const [canvasDims, setCanvasDims] = useState({ w: 1536, h: 864 })
  // Exact CSS-pixel dimensions for the canvas elements. Set imperatively
  // after image load so the canvas never displays at a non-integer CSS
  // scale — fractional scaling from `width:100%` / CSS aspect-ratio
  // causes bilinear blur even when the intrinsic size is DPR-correct.
  const [canvasCssPx, setCanvasCssPx] = useState(null) // { w, h } | null
  const marqueeSvgRef = useRef(null) // imperative opacity control
  const isDrawingRef = useRef(false) // true between pointerDown and pointerUp

  const editTextareaRef = useRef(null)
  const queryClient = useQueryClient()
  // Abort control for in-flight editRegion / faceSwap calls.
  // Lets the Cancel button abort mid-flight; also cleared in finally
  // so the ref is always null when the dialog is idle.
  const abortCtrlRef = useRef(null)
  // Set to true when the user explicitly cancels so the success path
  // in handleSubmit doesn't call onClose() on a race-winning request.
  const cancelledRef = useRef(false)

  // Live per-tier credit cost for the action the user is about to take.
  // Backend charges the same cost for edit + faceswap, so one key covers both.
  const { unit: unitCost } = useCostOf('thumbnail_edit_faceswap', 1)

  // Canvas refs
  const maskCanvasRef = useRef(null) // full natural resolution mask canvas — holds committed strokes
  const overlayCanvasRef = useRef(null) // same-size sibling canvas — rect-tool in-progress preview only
  const stageRef = useRef(null) // the wrapper whose rect we measure
  const dprRef = useRef(1) // device pixel ratio at last canvas resize
  // Custom brush cursor preview — a circle that tracks the pointer
  // while in brush/eraser mode. Position is updated imperatively
  // (`cursorPreviewRef.current.style.transform = …`) on every
  // pointermove so we don't burn React re-renders at ~60 fps.
  const cursorPreviewRef = useRef(null)
  const [cursorVisible, setCursorVisible] = useState(false)
  // Marching-ants marquee — SVG path string recomputed on each stroke
  // commit (pointerUp) and undo/redo/clear via computeAndSetContour.
  // The previous implementation was removed; this is the new one.
  // (Replaced old comment block)
  // Stage aspect-ratio — derived from the source thumbnail so the
  // editor adapts to landscape (16:9), portrait (9:16), and square
  // (1:1) thumbnails without cropping. Default 16:9 for the brief
  // window between mount and image load.
  const [imageAspect, setImageAspect] = useState(16 / 9)
  const baseSnapshotRef = useRef(null) // ImageData captured at pointerdown; converted to blob and pushed to undo on pointerup
  // Undo/redo stacks now hold `Promise<Blob>` (compressed PNG snapshots)
  // instead of raw ImageData. A full 1536×864 ImageData is 5.3 MB; the
  // same canvas PNG-compressed is typically 20–200 KB because masks are
  // mostly transparent. 20-entry cap × 200 KB ≈ 4 MB, vs. 106 MB before.
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const undoBusyRef = useRef(false) // prevents concurrent handleUndo/Redo while a blob restore is in flight
  const drawingRef = useRef(null) // { tool, points, size, color, startX, startY }
  const imageRef = useRef(null) // loaded HTMLImageElement
  const sizePopoverRef = useRef(null)
  const colorPopoverRef = useRef(null)

  /* ── Effects ─────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault()
        handleRedo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, busy, editPrompt])

  // Abort any in-flight generation when the dialog unmounts so the
  // hanging request doesn't settle into a detached component.
  useEffect(() => {
    return () => {
      abortCtrlRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    editTextareaRef.current?.focus()
  }, [])

  // Load the image + size the canvas to display-pixel density (CSS width × DPR).
  // Sizing to 1920px and CSS-scaling down 2.67× is what made brush strokes look
  // blurry — bilinear downscaling blurs every stroke. Setting canvas intrinsic
  // size to displayWidth × devicePixelRatio means no downscaling occurs and every
  // stroke renders at the native pixel density of the screen. The backend's PIL
  // resize normalises the mask to the image's actual dimensions.
  useEffect(() => {
    let cancelled = false
    if (!imageUrl) return
    loadImage(imageUrl)
      .then((img) => {
        if (cancelled) return
        imageRef.current = img
        const canvas = maskCanvasRef.current
        const overlay = overlayCanvasRef.current
        if (!canvas) return
        const naturalW = img.naturalWidth || img.width || 1536
        const naturalH = img.naturalHeight || img.height || 864
        // Force the stage to adopt the correct aspect-ratio BEFORE we measure it.
        // Without flushSync, setImageAspect batches a React state update that
        // hasn't been committed to the DOM yet — so getBoundingClientRect would
        // return the old (wrong) stage dimensions, sizing the canvas incorrectly
        // and causing a stretched / blurry mask.
        flushSync(() => setImageAspect(naturalW / naturalH))
        // Now measure the stage at its true rendered size.
        const stage = stageRef.current
        const stageRect = stage ? stage.getBoundingClientRect() : { width: 0, height: 0 }
        // Use the ACTUAL device pixel ratio — never round it. Rounding turns
        // 1.25 → 1 (canvas too small → upscaled → pixelated) or 2.75 → 3
        // (canvas too large → downscaled → blurry). The canvas intrinsic
        // size is rounded to whole pixels; the DPR value stays fractional.
        const dpr = Math.max(1, window.devicePixelRatio || 1)
        dprRef.current = dpr
        const cssW = stageRect.width > 10 ? stageRect.width : Math.min(1040, window.innerWidth - 44)
        const cssH =
          stageRect.height > 10 ? stageRect.height : Math.round(cssW * (naturalH / naturalW))
        // Intrinsic canvas size in physical pixels (integer — sub-pixel
        // canvas dimensions are unsupported and cause rendering artefacts).
        const w = Math.max(1, Math.round(cssW * dpr))
        const h = Math.max(1, Math.round(cssH * dpr))
        // Expose CSS-pixel dims so the JSX can set the canvas element's
        // style.width / style.height to exact integer values. Letting
        // `width: 100%` remain means the CSS engine can produce fractional
        // pixel heights (e.g. 540.37px via aspect-ratio), forcing a
        // non-integer scale factor that blurs every rendered stroke.
        setCanvasCssPx({ w: Math.round(cssW), h: Math.round(cssH) })
        // canvasDims is the SVG viewBox used by the marching-ants
        // marquee. The marquee path coordinates come from
        // computeAndSetContour which walks canvas.width × canvas.height
        // (PHYSICAL pixels — CSS pixels times DPR). The viewBox MUST
        // match the path-coordinate space or the ants render offset by
        // a factor of DPR (on a DPR=2 screen, ants appeared at 2x the
        // distance from top-left of the actual painted region — the
        // "marquee in the wrong place" bug). Use physical-pixel dims
        // here; the SVG's CSS width/height stay at 100% so it stretches
        // back to the canvas's CSS footprint.
        setCanvasDims({ w, h })
        canvas.width = w
        canvas.height = h
        // willReadFrequently: browser keeps backing store CPU-accessible so
        // getImageData (marching-ants + undo) skips the GPU→CPU round-trip.
        const _maskCtx = canvas.getContext('2d', { willReadFrequently: true })
        // Disable bilinear filtering on drawImage / pixel-blit operations
        // (snapshot/restore for undo, mask compositing). Brush strokes
        // themselves are vector-path stroked which is always
        // anti-aliased — but any drawImage at the canvas edge picks up
        // edge-pixel blur from neighbour sampling without this. Reported:
        // "drawings blurry at the sides".
        _maskCtx.imageSmoothingEnabled = false
        _maskCtx.clearRect(0, 0, w, h)
        if (overlay) {
          overlay.width = w
          overlay.height = h
          const _overlayCtx = overlay.getContext('2d')
          _overlayCtx.imageSmoothingEnabled = false
          _overlayCtx.clearRect(0, 0, w, h)
        }
        undoStackRef.current = []
        redoStackRef.current = []
        setUndoDepth(0)
        setRedoDepth(0)
        setHasDrawn(false)
        setMarqueePath('')
      })
      .catch(() => {
        /* image failed — drawing will no-op, edit still works as full-mask */
      })
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  // Outside-click for popovers. Uses `pointerdown` on the CAPTURE
  // phase because the shared <Dialog> panel calls `stopPropagation`
  // on bubble, which would otherwise prevent any document-level
  // listener from firing for clicks inside the dialog. Capture phase
  // runs before the panel sees the event, so we still hear outside
  // clicks (anywhere except inside the popover itself) and can close
  // cleanly without dismissing the dialog.
  useEffect(() => {
    if (!sizePopoverOpen && !colorPopoverOpen) return
    const onDocDown = (e) => {
      if (sizePopoverOpen && sizePopoverRef.current && !sizePopoverRef.current.contains(e.target)) {
        setSizePopoverOpen(false)
      }
      if (
        colorPopoverOpen &&
        colorPopoverRef.current &&
        !colorPopoverRef.current.contains(e.target)
      ) {
        setColorPopoverOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDocDown, true)
    return () => document.removeEventListener('pointerdown', onDocDown, true)
  }, [sizePopoverOpen, colorPopoverOpen])

  /* ── Marching ants contour ────────────────────────────────────── */
  // Two-pass algorithm:
  //   1. Marching squares: extracts unordered boundary segments from the
  //      mask canvas at a coarse (≈300-cell) grid.
  //   2. Path assembly: chains those segments into closed loops using an
  //      endpoint hash-map (O(n)) so each loop becomes one continuous
  //      M…L…Z path. A continuous path is REQUIRED for stroke-dashoffset
  //      animation to march — disconnected M…L segments each get their
  //      own independent dash phase and produce static noise instead.
  //
  // Show/hide the marquee SVG without touching React state.
  // The CSS animation keeps running while opacity=0 so when we restore
  // opacity the ants resume mid-march — no restart, no flicker.
  const showMarquee = useCallback(() => {
    if (marqueeSvgRef.current) marqueeSvgRef.current.style.opacity = '1'
  }, [])
  const hideMarquee = useCallback(() => {
    if (marqueeSvgRef.current) marqueeSvgRef.current.style.opacity = '0'
  }, [])

  // STEP must be even so all segment endpoints land on integers, which
  // guarantees exact string-key matching in the endpoint map.
  const computeAndSetContour = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas || canvas.width === 0) {
      setMarqueePath('')
      hideMarquee()
      return
    }
    const { width, height } = canvas
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    // Finer grid → more contour vertices → smoother outline after bezier
    // smoothing. Dividing by 500 (was 300) gives STEP=4 for a 2000px canvas
    // instead of STEP=6, so boundary vertices land every 2px rather than 3px.
    // STEP must be even so HS=STEP/2 is always an integer.
    const raw = Math.max(2, Math.round(Math.max(width, height) / 500))
    const STEP = raw % 2 === 0 ? raw : raw + 1
    const HS = STEP >> 1
    const cols = Math.ceil(width / STEP)
    const rows = Math.ceil(height / STEP)

    // Binary grid — 1-cell zero padding on every side avoids
    // out-of-bounds reads in the marching-squares loop.
    const GW = cols + 2
    const grid = new Uint8Array(GW * (rows + 2))
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const px = Math.min(gx * STEP + HS, width - 1)
        const py = Math.min(gy * STEP + HS, height - 1)
        grid[(gy + 1) * GW + (gx + 1)] = data[(py * width + px) * 4 + 3] > MASK_THRESHOLD ? 1 : 0
      }
    }

    // ── Pass 1: Marching squares → flat segment array ─────────────
    // Flat layout: [x1, y1, x2, y2, ...] — all integers (canvas-px).
    const sv = [] // segment values
    for (let gy = 0; gy <= rows; gy++) {
      for (let gx = 0; gx <= cols; gx++) {
        const tl = grid[gy * GW + gx] || 0
        const tr = grid[gy * GW + (gx + 1)] || 0
        const bl = grid[(gy + 1) * GW + gx] || 0
        const br = grid[(gy + 1) * GW + (gx + 1)] || 0
        const code = (tl << 3) | (tr << 2) | (br << 1) | bl
        if (code === 0 || code === 15) continue
        const x0 = gx * STEP,
          y0 = gy * STEP
        const x1 = x0 + STEP,
          y1 = y0 + STEP
        const xm = x0 + HS,
          ym = y0 + HS
        // prettier-ignore
        switch (code) {
          case  1: sv.push(xm,y1, x0,ym); break
          case  2: sv.push(x1,ym, xm,y1); break
          case  3: sv.push(x1,ym, x0,ym); break
          case  4: sv.push(xm,y0, x1,ym); break
          case  5: sv.push(xm,y0, x0,ym); sv.push(x1,ym, xm,y1); break
          case  6: sv.push(xm,y0, xm,y1); break
          case  7: sv.push(xm,y0, x0,ym); break
          case  8: sv.push(x0,ym, xm,y0); break
          case  9: sv.push(xm,y1, xm,y0); break
          case 10: sv.push(x0,ym, xm,y1); sv.push(xm,y0, x1,ym); break
          case 11: sv.push(x1,ym, xm,y0); break
          case 12: sv.push(x0,ym, x1,ym); break
          case 13: sv.push(xm,y1, x1,ym); break
          case 14: sv.push(x0,ym, xm,y1); break
        }
      }
    }

    const segN = sv.length >> 2 // sv.length / 4
    if (segN === 0) {
      setMarqueePath('')
      return
    }

    // ── Pass 2: Assemble segments into closed loops ────────────────
    // Build endpoint → [packed: segIdx<<1 | isAEnd] map.
    // isAEnd=0 → this key is the A-endpoint; follow to B.
    // isAEnd=1 → this key is the B-endpoint; follow to A.
    const endMap = new Map()
    const addEP = (k, i, isA) => {
      let a = endMap.get(k)
      if (!a) {
        a = []
        endMap.set(k, a)
      }
      a.push((i << 1) | (isA ? 0 : 1))
    }
    for (let i = 0; i < segN; i++) {
      addEP(`${sv[i * 4]},${sv[i * 4 + 1]}`, i, true) // A-end → go to B
      addEP(`${sv[i * 4 + 2]},${sv[i * 4 + 3]}`, i, false) // B-end → go to A
    }

    const used = new Uint8Array(segN)
    const loops = [] // each loop: flat [x0,y0,x1,y1,...] integers

    for (let si = 0; si < segN; si++) {
      if (used[si]) continue
      used[si] = 1

      const pts = [sv[si * 4], sv[si * 4 + 1], sv[si * 4 + 2], sv[si * 4 + 3]]
      let tx = sv[si * 4 + 2],
        ty = sv[si * 4 + 3]

      for (let guard = segN; guard > 0; guard--) {
        const neighbors = endMap.get(`${tx},${ty}`)
        if (!neighbors) break
        let advanced = false
        for (let ni = 0; ni < neighbors.length; ni++) {
          const packed = neighbors[ni]
          const idx = packed >> 1
          if (used[idx]) continue
          used[idx] = 1
          // packed & 1 = 0 → we matched A-end → next point is B
          // packed & 1 = 1 → we matched B-end → next point is A
          const toA = (packed & 1) === 1
          const nx = toA ? sv[idx * 4] : sv[idx * 4 + 2]
          const ny = toA ? sv[idx * 4 + 1] : sv[idx * 4 + 3]
          pts.push(nx, ny)
          tx = nx
          ty = ny
          advanced = true
          break
        }
        if (!advanced) break
      }

      if (pts.length >= 8) loops.push(pts) // at least 4 distinct points
    }

    if (loops.length === 0) {
      setMarqueePath('')
      hideMarquee()
      return
    }

    // ── Pass 3: Smooth + build SVG path in CSS-pixel space ───────────
    // Two-step smoothing pipeline:
    //   a) Chaikin corner-cutting (3 iters) — halves every polygon edge
    //      3× so staircase vertices from the grid become dense curves.
    //   b) Midpoint-bezier path — each smoothed vertex is a Q control
    //      point; anchors are the midpoints between vertices. This is
    //      C1-continuous and passes no straight-line segments through
    //      the data, so the result looks organic and vector-quality.
    //
    // L (lineTo) commands were the root cause of the jagged look: they
    // connected raw grid-aligned vertices with straight lines, making
    // every contour look like a pixelated staircase.
    const inv = 1 / dprRef.current
    const svgParts = loops
      .map((rawPts) => {
        const smoothed = chaikinSmooth(rawPts, 3)
        return polygonToSmoothPath(smoothed, inv)
      })
      .filter(Boolean)

    setCanvasDims({ w: Math.round(width * inv), h: Math.round(height * inv) })
    setMarqueePath(svgParts.join(' '))
    // Only reveal if not currently drawing (user might have started a new
    // stroke before this async contour computation finished)
    if (!isDrawingRef.current) showMarquee()
  }, [hideMarquee, showMarquee])

  /* ── Canvas drawing primitives ────────────────────────────────── */
  const getCanvasCoords = useCallback((e) => {
    const canvas = maskCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX)
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY)
    if (clientX == null || clientY == null) return null
    // Clamp to canvas bounds so dragging past the edge (which the
    // pointer-capture path makes routine for users painting near the
    // border) still paints at the boundary, instead of dropping the
    // sample silently because the coord falls outside [0, w/h].
    const x = Math.max(
      0,
      Math.min(canvas.width, ((clientX - rect.left) / rect.width) * canvas.width)
    )
    const y = Math.max(
      0,
      Math.min(canvas.height, ((clientY - rect.top) / rect.height) * canvas.height)
    )
    return { x, y }
  }, [])

  // Position the brush-cursor preview in CSS pixels relative to the
  // stage. brushSize is already in CSS-px terms (the canvas-coord
  // scale is applied to the actual stroke, not to the visible
  // overlay), so feeding the raw client coords through is enough.
  const moveCursorPreview = useCallback((e) => {
    const stage = stageRef.current
    const el = cursorPreviewRef.current
    if (!stage || !el) return
    const rect = stage.getBoundingClientRect()
    el.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px) translate(-50%, -50%)`
  }, [])

  // Grab the current mask pixels as ImageData. Used only while a stroke
  // is in progress — kept so the in-progress rect preview has a baseline
  // reference (though the overlay canvas now handles live painting, we
  // still capture a snapshot at pointerdown so the undo stack has
  // something to restore if this stroke ends).
  const snapshotCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }, [])

  // ImageData → compressed PNG Blob. Fires an off-screen canvas + toBlob,
  // returns a Promise so callers can await without blocking pointerup.
  const imageDataToBlobPromise = useCallback((imageData) => {
    if (!imageData) return Promise.resolve(null)
    return new Promise((resolve) => {
      const c = document.createElement('canvas')
      c.width = imageData.width
      c.height = imageData.height
      c.getContext('2d').putImageData(imageData, 0, 0)
      c.toBlob((blob) => resolve(blob || null), 'image/png')
    })
  }, [])

  // Snapshot the current mask as a Promise<Blob>. Used when pushing the
  // post-stroke state to the redo stack during undo (we need the latest
  // committed pixels, not a baseline).
  const snapshotCanvasAsBlobPromise = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return Promise.resolve(null)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob || null), 'image/png')
    })
  }, [])

  // Restore a stored Blob onto the mask canvas. `createImageBitmap` is
  // GPU-accelerated and ~5 ms for typical masks; `drawImage` is another
  // 2 ms. User-perceived undo feels instant.
  const restoreBlobToCanvas = useCallback(async (blobOrPromise) => {
    if (!blobOrPromise) return
    const blob = await blobOrPromise
    if (!blob) return
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const bitmap = await createImageBitmap(blob)
    try {
      ctx.globalCompositeOperation = 'source-over'
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0)
    } finally {
      bitmap.close?.()
    }
  }, [])

  // Smooth quadratic-Bezier brush. We track three rolling points
  // (`p0` previous-previous, `p1` previous, `p2` current) and stroke
  // a curve from the midpoint of (p0,p1) to the midpoint of (p1,p2)
  // using p1 as the control point. The result is a continuously
  // tangent-smooth path even when pointer events are sparse — no
  // visible polyline corners between samples. A filled disc is
  // dropped at every sample and at the start of every stroke as a
  // safety net so even single-pixel taps render as a clean circle.
  const paintBrushSegment = useCallback((ctx, prev2, prev1, curr, size, rgba, erase) => {
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = rgba
    ctx.fillStyle = rgba
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (!prev1) {
      // First sample of the stroke — a single arc fill is the only draw
      // operation. A stroke with a round cap at a zero-length path is a
      // degenerate sub-path and renders nothing, so we use arc+fill.
      // IMPORTANT: do NOT also stroke a line here. The previous approach
      // stamped an arc AND then stroked a segment, which caused two
      // overlapping semi-transparent edges to compound at every sample
      // point — producing a heavy, over-blurred ring that looked soft
      // and low-resolution even on a sharp canvas.
      ctx.beginPath()
      ctx.arc(curr.x, curr.y, size / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }

    // For all subsequent samples: stroke only — no arc. The round lineCap
    // produces a clean disc at the path endpoints without any double-draw.
    if (!prev2) {
      // Second sample: straight segment from prev1 to curr.
      ctx.beginPath()
      ctx.moveTo(prev1.x, prev1.y)
      ctx.lineTo(curr.x, curr.y)
      ctx.stroke()
      return
    }

    // Third+ sample: quadratic Bézier through the midpoints of the rolling
    // three-point window. The midpoint-to-midpoint curve is C1-continuous
    // at every join (tangent matches between adjacent segments) so rapid
    // pointer movement produces smooth curves with no visible polyline kinks.
    const m1 = { x: (prev2.x + prev1.x) / 2, y: (prev2.y + prev1.y) / 2 }
    const m2 = { x: (prev1.x + curr.x) / 2, y: (prev1.y + curr.y) / 2 }
    ctx.beginPath()
    ctx.moveTo(m1.x, m1.y)
    ctx.quadraticCurveTo(prev1.x, prev1.y, m2.x, m2.y)
    ctx.stroke()
  }, [])

  const paintRectPreview = useCallback((ctx, x1, y1, x2, y2, rgba) => {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = rgba
    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    const w = Math.abs(x2 - x1)
    const h = Math.abs(y2 - y1)
    ctx.fillRect(x, y, w, h)
  }, [])

  // (Removed `rebuildMarquee` — was the Moore-neighbor boundary tracer
  // that built the SVG path for the marching-ants overlay. Marquee
  // overlay was removed per user request, so this whole ~100-line
  // perimeter-tracing pass + its rAF schedule on every stroke commit
  // is dead. Net win: stroke commits skip a per-stroke alpha walk.)

  // Push a Promise<Blob> onto the undo stack. Accepts either a ready
  // Promise or a raw ImageData — we convert either way. The Promise
  // flavour lets callers fire the expensive PNG compression off the
  // pointerup hot path; the stack UI updates synchronously because
  // depth is just the array length, not the blob contents.
  const pushUndoPromise = useCallback(
    (promiseOrImageData) => {
      if (!promiseOrImageData) return
      const promise =
        promiseOrImageData instanceof Promise
          ? promiseOrImageData
          : imageDataToBlobPromise(promiseOrImageData)
      undoStackRef.current.push(promise)
      if (undoStackRef.current.length > UNDO_CAP) {
        undoStackRef.current.shift()
      }
      redoStackRef.current = []
      setUndoDepth(undoStackRef.current.length)
      setRedoDepth(0)
    },
    [imageDataToBlobPromise]
  )

  /* ── Pointer handlers ─────────────────────────────────────────── */
  const onPointerEnter = (e) => {
    if (busy) return
    moveCursorPreview(e)
    setCursorVisible(true)
  }

  const onPointerDown = (e) => {
    if (busy) return
    const pos = getCanvasCoords(e)
    if (!pos) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    // Hide marching ants while drawing — avoids visual noise during the stroke
    // and eliminates the "flickering" that happens when path state updates
    // during active painting. The ants reappear after pointerUp.
    isDrawingRef.current = true
    hideMarquee()
    const canvas = maskCanvasRef.current
    const ctx = canvas.getContext('2d')
    const scale = canvas.width / canvas.getBoundingClientRect().width
    const effectiveSize = brushSize * scale
    // Paint at full alpha so the export mask is clean and the strokes don't
    // compound opacity when painted over each other. CSS opacity on the
    // canvas element provides the visual transparency without accumulation.
    const rgba = hexToRgba(color, 1)
    baseSnapshotRef.current = snapshotCanvas()
    drawingRef.current = {
      tool,
      size: effectiveSize,
      color: rgba,
      startX: pos.x,
      startY: pos.y,
      // Rolling 3-sample window for the smooth-curve brush. `prev2` and
      // `prev1` are null at the start of a stroke; the painter handles
      // both cases (single disc → straight segment → quadratic curve).
      prev2: null,
      prev1: null,
      curr: pos,
    }
    if (tool === 'brush' || tool === 'eraser') {
      paintBrushSegment(ctx, null, null, pos, effectiveSize, rgba, tool === 'eraser')
    } else if (tool === 'rect') {
      // Clear overlay; rect previews land there during move so we never
      // do a full-canvas putImageData per frame.
      const overlay = overlayCanvasRef.current
      if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height)
    }
  }

  const onPointerMove = (e) => {
    // Track the cursor preview every move, even when the user isn't
    // actively drawing — the brush ring follows the pointer through
    // the whole hover window so the user always sees what their next
    // stroke will look like.
    moveCursorPreview(e)
    if (!drawingRef.current) return
    const { tool: t, size, color: rgba, startX, startY } = drawingRef.current
    if (t === 'rect') {
      const pos = getCanvasCoords(e)
      if (!pos) return
      // Draw the in-progress rect on the overlay canvas. The base
      // (mask) canvas stays untouched until pointerup, so we avoid the
      // 5 MB putImageData blit that used to run on every mousemove.
      const overlay = overlayCanvasRef.current
      if (!overlay) return
      const octx = overlay.getContext('2d')
      octx.clearRect(0, 0, overlay.width, overlay.height)
      paintRectPreview(octx, startX, startY, pos.x, pos.y, rgba)
      drawingRef.current.curr = pos
    } else {
      // Drain coalesced sub-frame events so quick flicks render every
      // intermediate sample the OS captured between paint frames —
      // produces a continuous, perfectly smooth stroke instead of a
      // segmented polyline. Falls back to the single event when
      // `getCoalescedEvents` isn't available (older browsers).
      const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null
      const list = events && events.length ? events : [e]
      const canvas = maskCanvasRef.current
      const ctx = canvas.getContext('2d')
      for (const ev of list) {
        const pos = getCanvasCoords(ev)
        if (!pos) continue
        const { prev1, curr } = drawingRef.current
        // Shift the rolling window: (prev2, prev1, curr) ← (prev1, curr, pos).
        paintBrushSegment(ctx, prev1, curr, pos, size, rgba, t === 'eraser')
        drawingRef.current.prev2 = prev1
        drawingRef.current.prev1 = curr
        drawingRef.current.curr = pos
      }
    }
  }

  const onPointerUp = () => {
    if (!drawingRef.current) return
    const { tool: t } = drawingRef.current
    // Commit rect preview from overlay → base canvas in one drawImage.
    if (t === 'rect') {
      const canvas = maskCanvasRef.current
      const overlay = overlayCanvasRef.current
      if (canvas && overlay) {
        const ctx = canvas.getContext('2d')
        ctx.globalCompositeOperation = 'source-over'
        ctx.drawImage(overlay, 0, 0)
        overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height)
      }
    }
    const snap = baseSnapshotRef.current
    drawingRef.current = null
    baseSnapshotRef.current = null
    if (snap) pushUndoPromise(imageDataToBlobPromise(snap))
    setHasDrawn(true)
    // Allow showMarquee then recompute the marching-ants contour.
    // Binarization (alpha-snap) happens only in exportMaskBase64, which is
    // what the API receives — keeping the canvas anti-aliased here means
    // smooth, Photoshop-style edges during real-time drawing.
    isDrawingRef.current = false
    computeAndSetContour()
  }

  /* ── History actions ──────────────────────────────────────────── */
  const handleUndo = useCallback(async () => {
    if (undoStackRef.current.length === 0 || undoBusyRef.current) return
    undoBusyRef.current = true
    try {
      const currentPromise = snapshotCanvasAsBlobPromise()
      const prevPromise = undoStackRef.current.pop()
      redoStackRef.current.push(currentPromise)
      if (redoStackRef.current.length > UNDO_CAP) redoStackRef.current.shift()
      setUndoDepth(undoStackRef.current.length)
      setRedoDepth(redoStackRef.current.length)
      setHasDrawn(undoStackRef.current.length > 0)
      await restoreBlobToCanvas(prevPromise)
      computeAndSetContour()
    } finally {
      undoBusyRef.current = false
    }
  }, [snapshotCanvasAsBlobPromise, restoreBlobToCanvas, computeAndSetContour])

  const handleRedo = useCallback(async () => {
    if (redoStackRef.current.length === 0 || undoBusyRef.current) return
    undoBusyRef.current = true
    try {
      const currentPromise = snapshotCanvasAsBlobPromise()
      const nextPromise = redoStackRef.current.pop()
      undoStackRef.current.push(currentPromise)
      if (undoStackRef.current.length > UNDO_CAP) undoStackRef.current.shift()
      setUndoDepth(undoStackRef.current.length)
      setRedoDepth(redoStackRef.current.length)
      setHasDrawn(true)
      await restoreBlobToCanvas(nextPromise)
      computeAndSetContour()
    } finally {
      undoBusyRef.current = false
    }
  }, [snapshotCanvasAsBlobPromise, restoreBlobToCanvas, computeAndSetContour])

  const handleClear = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const snap = snapshotCanvas()
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (snap) pushUndoPromise(imageDataToBlobPromise(snap))
    setHasDrawn(false)
    setMarqueePath('')
    hideMarquee()
  }, [snapshotCanvas, pushUndoPromise, imageDataToBlobPromise, hideMarquee])

  /* ── Mask composite preview (for chat bubble display) ────────── */
  async function createMaskPreviewDataUrl() {
    if (!hasDrawn || !maskCanvasRef.current || !imageRef.current) return null
    try {
      const img = imageRef.current
      const out = document.createElement('canvas')
      out.width = img.naturalWidth || img.width || 1536
      out.height = img.naturalHeight || img.height || 864
      const ctx = out.getContext('2d')
      ctx.drawImage(img, 0, 0, out.width, out.height)
      ctx.globalAlpha = 0.65
      ctx.drawImage(maskCanvasRef.current, 0, 0, out.width, out.height)
      ctx.globalAlpha = 1
      return canvasToBase64Png(out)
    } catch {
      return null
    }
  }

  /* ── Mask export ──────────────────────────────────────────────── */
  async function exportMaskBase64() {
    const canvas = maskCanvasRef.current
    // Fallback: no canvas or nothing drawn → full-white mask ("edit whole image")
    if (!canvas || !hasDrawn) {
      const img = imageRef.current || (await loadImage(imageUrl))
      const out = document.createElement('canvas')
      out.width = img.naturalWidth || img.width || 1536
      out.height = img.naturalHeight || img.height || 864
      const ctx = out.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, out.width, out.height)
      return canvasToBase64Png(out)
    }
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, out.width, out.height)
    const maskCtx = canvas.getContext('2d')
    const maskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height)
    const outData = ctx.getImageData(0, 0, out.width, out.height)
    for (let i = 0; i < maskData.data.length; i += 4) {
      if (maskData.data[i + 3] > MASK_THRESHOLD) {
        outData.data[i] = 255
        outData.data[i + 1] = 255
        outData.data[i + 2] = 255
        outData.data[i + 3] = 255
      }
    }
    ctx.putImageData(outData, 0, 0)
    return canvasToBase64Png(out)
  }

  /* ── Submit ───────────────────────────────────────────────────── */
  async function callEditOnce(token, maskB64, pendingMessageId, signal) {
    const imageB64 = extractBase64FromDataUrl(imageUrl)
    const res = await thumbnailsApi.editRegion(
      token,
      {
        thumbnail_image_base64: imageB64 || undefined,
        thumbnail_image_url: imageB64 ? undefined : imageUrl,
        mask_base64: maskB64,
        edit_prompt: editPrompt.trim(),
        pending_message_id: pendingMessageId ?? undefined,
      },
      { signal }
    )
    return res?.image_url || null
  }

  async function callFaceSwapOnce(token, pendingMessageId, signal) {
    const imageB64 = extractBase64FromDataUrl(imageUrl)
    const faceUrl = selectedPersona?.image_url
    const faceB64 = extractBase64FromDataUrl(faceUrl)
    const res = await thumbnailsApi.faceSwap(
      token,
      {
        thumbnail_image_base64: imageB64 || undefined,
        thumbnail_image_url: imageB64 ? undefined : imageUrl,
        face_image_base64: faceB64 || undefined,
        face_image_url: faceB64 ? undefined : faceUrl,
        extra_hint: editPrompt.trim() || undefined,
        pending_message_id: pendingMessageId ?? undefined,
      },
      { signal }
    )
    return res?.image_url || null
  }

  function handleCancel() {
    cancelledRef.current = true
    abortCtrlRef.current?.abort()
    // setBusy/setError will be handled by the catch block via AbortError,
    // but set them here immediately so the UI responds without waiting for
    // the in-flight fetch to propagate the abort signal.
    setBusy(false)
    setError(null)
  }

  async function handleSubmit() {
    if (busy) return
    if (!imageUrl) return setError('No thumbnail to edit.')
    if (mode === 'faceswap') {
      if (!selectedPersona?.image_url) {
        return setError('Pick a persona to swap the face with.')
      }
    } else if (!editPrompt.trim()) {
      return setError('Describe the change you want.')
    }

    setError(null)
    setBusy(true)
    cancelledRef.current = false

    // 120 s client-side hard cap. The backend has its own timeout
    // budget; this ensures the dialog never stays stuck "Generating…"
    // if a network or server hang prevents a response from arriving.
    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl
    const timeoutId = setTimeout(() => ctrl.abort(), 120_000)

    const submitMode = mode
    const submitPrompt = submitMode === 'faceswap' ? '' : editPrompt || ''
    const submitPersona = submitMode === 'faceswap' ? selectedPersona : null

    // Build a composite preview (thumbnail + drawn mask) for the user's
    // chat bubble BEFORE making the AI call, so it's ready instantly.
    const maskPreviewDataUrl =
      submitMode === 'edit' && hasDrawn ? await createMaskPreviewDataUrl() : null

    let pendingMessageId = null
    let pendingUserMessageId = null
    let pendingConversationId = null
    if (typeof onBeforeSubmit === 'function') {
      try {
        const ctx = await onBeforeSubmit({
          mode: submitMode,
          prompt: submitPrompt,
          sourceImageUrl: imageUrl,
          persona: submitPersona,
          batch: 1,
          maskPreviewDataUrl,
        })
        pendingMessageId = ctx?.pendingMessageId ?? null
        pendingUserMessageId = ctx?.pendingUserMessageId ?? null
        pendingConversationId = ctx?.pendingConversationId ?? null
      } catch {
        pendingMessageId = null
      }
    }

    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in required.')

      let oneCall
      if (submitMode === 'faceswap') {
        oneCall = () => callFaceSwapOnce(token, pendingMessageId, ctrl.signal)
      } else {
        const maskB64 = await exportMaskBase64()
        oneCall = () => callEditOnce(token, maskB64, pendingMessageId, ctrl.signal)
      }

      const settled = await Promise.allSettled([oneCall()])
      const urls = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value)
      if (urls.length === 0) {
        const firstErr = settled.find((r) => r.status === 'rejected')
        throw (
          firstErr?.reason ||
          new Error(submitMode === 'faceswap' ? 'Face swap failed.' : 'No image returned.')
        )
      }

      // Guard: don't finalise or close if user cancelled while the
      // request was in flight (race where abort resolved after done).
      if (cancelledRef.current) return

      invalidateCredits(queryClient)

      if (typeof onSubmitFinalize === 'function') {
        try {
          await onSubmitFinalize({
            pendingMessageId,
            pendingUserMessageId,
            pendingConversationId,
            mode: submitMode,
            prompt: submitPrompt,
            sourceImageUrl: imageUrl,
            persona: submitPersona,
            urls,
          })
        } catch {
          /* never let a persistence hiccup mask the successful edit */
        }
      } else {
        onApply?.(urls.length === 1 ? urls[0] : urls)
      }
      onClose?.()
    } catch (err) {
      // AbortError = user hit Cancel or the 120 s timeout fired.
      // Either way, reset to idle — no error toast for explicit cancel.
      if (err?.name === 'AbortError' || ctrl.signal.aborted) {
        setBusy(false)
        if (!cancelledRef.current) {
          // Timeout (not user cancel) — surface a friendly hint.
          setError('Generation timed out. Please try again.')
        }
        // Best-effort: mark the pending row as failed so it shows as a
        // retryable card on reload instead of a permanent spinner.
        if (pendingMessageId && typeof onSubmitErrorFinalize === 'function') {
          try {
            await onSubmitErrorFinalize({
              pendingMessageId,
              mode: submitMode,
              prompt: submitPrompt,
              sourceImageUrl: imageUrl,
              persona: submitPersona,
              error: { friendly: 'Cancelled', code: 'CANCELLED', retryable: true },
            })
          } catch {
            /* swallow */
          }
        }
        return
      }

      const friendly =
        friendlyMessage(err) ||
        (submitMode === 'faceswap'
          ? 'Face swap failed. Try a different persona.'
          : 'Edit failed. Try a different prompt.')
      setError(friendly)
      setBusy(false)

      if (typeof onSubmitErrorFinalize === 'function') {
        try {
          await onSubmitErrorFinalize({
            pendingMessageId,
            mode: submitMode,
            prompt: submitPrompt,
            sourceImageUrl: imageUrl,
            persona: submitPersona,
            error: { friendly, code: err?.code || null, retryable: true },
          })
        } catch {
          /* swallow */
        }
      } else {
        try {
          onError?.({
            friendly,
            code: err?.code || null,
            retryable: true,
            baseImageUrl: imageUrl,
            editMode: submitMode,
            prompt: submitPrompt,
          })
        } catch {
          /* swallow */
        }
      }
    } finally {
      clearTimeout(timeoutId)
      abortCtrlRef.current = null
    }
  }

  const canSubmit =
    !busy &&
    !!imageUrl &&
    (mode === 'faceswap' ? !!selectedPersona?.image_url : !!editPrompt.trim())

  // Short single-line hints — the previous copy wrapped to 2-3 rows on
  // narrow viewports and visually fought the composer's compact look.
  // Power-user detail (paint a region first, match lighting, etc.) is
  // discoverable from the toolbar tooltips; the hint just nudges.
  const placeholder =
    mode === 'faceswap'
      ? 'Optional hint — keep expression, match lighting…'
      : 'Describe the change — or paint a region first.'

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      size="wide"
      ariaLabel="Edit thumbnail"
      className="etd-dialog-panel"
    >
      <style>{`
        @keyframes etd-spin { to { transform: rotate(360deg); } }
        @keyframes etd-popover-in {
          from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.95); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes etd-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes etd-march {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -6; }
        }
      `}</style>

      <div
        className="etd-content"
        style={{
          position: 'relative',
          width: '100%',
          padding: '22px 22px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          color: '#fff',
          fontFamily: 'inherit',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 3,
            width: 32,
            height: 32,
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '0.5px solid rgba(255,255,255,0.18)',
            borderRadius: 999,
            background: 'rgba(12, 10, 22, 0.5)',
            color: 'rgba(255,255,255,0.85)',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: busy ? 0.5 : 1,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <IconX size={14} />
        </button>

        {/* Gradient title pill */}
        <div
          style={{
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 16px 7px 12px',
            borderRadius: 999,
            background: PRIMARY_GRADIENT,
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.005em',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 18px rgba(124,58,237,0.35)',
            textShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.28)',
              borderRadius: '50%',
            }}
          >
            <IconSparkle />
          </span>
          Edit thumbnail
        </div>

        {/* Thumbnail + canvas — aspect adapts to the source image so
         * landscape (16:9), portrait (9:16), and square thumbnails
         * all fill the card without cropping. `maxWidth` is computed
         * via `calc(60vh * aspect)` so portrait thumbnails are
         * height-bound instead of overflowing — landscape stays
         * width-bound at 1040px. */}
        <div
          ref={stageRef}
          style={{
            position: 'relative',
            alignSelf: 'center',
            width: '100%',
            maxWidth: `min(1040px, calc(60vh * ${imageAspect}))`,
            aspectRatio: String(imageAspect),
            borderRadius: 16,
            overflow: 'hidden',
            isolation: 'isolate',
            // Force a GPU compositing layer so overflow:hidden + border-radius
            // actually clips absolutely-positioned canvas children in Chrome/Safari.
            transform: 'translateZ(0)',
            background: 'rgba(12, 10, 18, 0.55)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.08), 0 14px 40px rgba(0,0,0,0.38)',
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Thumbnail"
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                // `fill` instead of `contain`: the stage's aspect-ratio
                // is already set from the image's natural aspect, so
                // no actual stretching happens — but `fill` guarantees
                // the image element box exactly matches the stage box
                // (no sub-pixel letterboxing). With `contain`, any
                // sub-pixel aspect mismatch between the stage's
                // computed height and the image's exact aspect left a
                // thin strip of empty stage at the bottom/right, and
                // the canvas (which fills the stage) overlapped that
                // strip — letting the user paint outside the visible
                // image and producing a marquee that extended past
                // the image edge.
                objectFit: 'fill',
                borderRadius: 16,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
              draggable={false}
              loading="eager"
              decoding="sync"
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 14,
              }}
            >
              No thumbnail.
            </div>
          )}

          <canvas
            ref={maskCanvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerEnter={onPointerEnter}
            onPointerLeave={(e) => {
              onPointerUp(e)
              setCursorVisible(false)
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              // Explicit integer-pixel CSS size eliminates the fractional
              // scaling that `width:100%` + CSS `aspect-ratio` can produce
              // (e.g. 540.37px height). A non-integer CSS/intrinsic ratio
              // forces the browser to bilinear-scale every painted stroke,
              // blurring the canvas regardless of correct DPR sizing.
              // Falls back to 100% before the image has loaded.
              width: canvasCssPx ? `${canvasCssPx.w}px` : '100%',
              height: canvasCssPx ? `${canvasCssPx.h}px` : '100%',
              // No border-radius on the canvas itself. The stage
              // container clips with overflow:hidden + its own
              // border-radius, so paint near the rounded corners
              // still reaches the visible image. Setting a radius on
              // the canvas would create a small pointer-dead-zone in
              // each corner because clicks landing on the rounded-out
              // area miss the canvas's hit shape.
              opacity: 0.48,
              cursor: busy
                ? 'default'
                : tool === 'brush' || tool === 'eraser'
                  ? 'none'
                  : 'crosshair',
              touchAction: 'none',
              pointerEvents: busy ? 'none' : 'auto',
            }}
          />
          <canvas
            ref={overlayCanvasRef}
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: canvasCssPx ? `${canvasCssPx.w}px` : '100%',
              height: canvasCssPx ? `${canvasCssPx.h}px` : '100%',
              opacity: 0.48,
              pointerEvents: 'none',
            }}
          />

          {/* Marching-ants marquee — SVG overlay that outlines the painted
           * selection using two offset dashed paths (white + dark) so the
           * border is legible on both bright and dark regions of the image.
           * `vector-effect="non-scaling-stroke"` keeps the stroke width in
           * screen pixels regardless of the SVG viewBox scale, so the 2px
           * border and 10/10 dashes look the same on every aspect ratio.
           * The `etd-march` @keyframes drives the dashoffset so the ants
           * animate. The SVG is hidden when nothing has been drawn (empty
           * marqueePath) and also while the editor is busy (generation in
           * progress shows the progress overlay on top anyway). */}
          {/* Marching-ants selection overlay — only when something is painted
           * and the editor is not busy. Uses TWO SVG passes on the same
           * assembled closed-loop path:
           *   1. A slightly thicker dark shadow pass for contrast on light
           *      backgrounds.
           *   2. The white dashes, offset by half the dash period so the
           *      two layers create the classic black/white marching look.
           * stroke-dasharray="8 6" (period=14) + @keyframes animating
           * dashoffset by -14 each 0.6 s → smooth continuous march at
           * ~23 CSS-px per second, matching the Figma selection speed.
           * No vector-effect needed: the viewBox is in CSS-pixel coords
           * (canvas-px ÷ DPR) so user-space units = screen pixels. */}
          {/* Marching-ants selection border. Always in DOM so the CSS
           * animation keeps running while hidden (opacity 0) — when we
           * reveal it (opacity 1) the ants resume mid-march with no
           * restart flicker. Visibility is controlled imperatively via
           * marqueeSvgRef: hidden during active stroke, shown on pointerUp.
           *
           * Two-layer classic look:
           *   1. Dark shadow pass (strokeWidth 2, dasharray 4 4) for
           *      contrast on bright areas.
           *   2. White dashes (strokeWidth 1.2) offset by half a period
           *      (animationDelay -0.6 s) so they fill the dark gaps.
           * Period = 8 CSS px, cycle = 1.2 s → ~6.7 px/s march speed. */}
          <svg
            ref={marqueeSvgRef}
            aria-hidden
            style={{
              // Pin the SVG to the EXACT same CSS rectangle as the
              // mask canvas — same top/left origin, same width/height
              // in CSS px. Previously the SVG used inset:0 + 100%
              // which made it fill the whole stage (image + any
              // letterboxing the stage padded around the image). The
              // canvas, sized to an exact integer CSS px, was a
              // SMALLER rect inside that stage when the image's aspect
              // didn't perfectly match the stage's measured rect —
              // and the SVG path coordinates (path coords are in the
              // canvas's pixel space) got stretched across the larger
              // stage area, offsetting the marching ants from the
              // actual painted region. Hard-pinning to canvasCssPx
              // makes the marquee origin/scale identical to the
              // canvas's, so the ants land exactly on the painted
              // outline regardless of stage padding/letterboxing.
              position: 'absolute',
              top: 0,
              left: 0,
              width: canvasCssPx ? `${canvasCssPx.w}px` : '100%',
              height: canvasCssPx ? `${canvasCssPx.h}px` : '100%',
              pointerEvents: 'none',
              overflow: 'visible',
              borderRadius: 16,
              opacity: 0,
            }}
            viewBox={`0 0 ${canvasDims.w} ${canvasDims.h}`}
            preserveAspectRatio="none"
          >
            <path
              d={marqueePath}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth="1"
              strokeDasharray="3 3"
              strokeLinecap="butt"
              fill="none"
              style={{ animation: 'etd-march 1.2s linear infinite' }}
            />
            <path
              d={marqueePath}
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="0.6"
              strokeDasharray="3 3"
              strokeLinecap="butt"
              fill="none"
              style={{ animation: 'etd-march 1.2s linear infinite', animationDelay: '-0.6s' }}
            />
          </svg>

          {/* Brush cursor preview — circle that follows the pointer
           * while a paint tool is active. Centre is the chosen colour
           * (semi-transparent so the user still sees the image
           * underneath); border is white-tinted with a contrasting
           * dark outer ring so the preview is legible on any
           * brightness of background. Position is updated imperatively
           * by `moveCursorPreview`; React only re-renders when tool /
           * brushSize / colour / visibility change. */}
          {(tool === 'brush' || tool === 'eraser') && !busy && (
            <div
              ref={cursorPreviewRef}
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: brushSize,
                height: brushSize,
                // box-sizing: border-box keeps the white border INSIDE the
                // brushSize box, and the contrast ring is `inset` so it
                // doesn't extend past the perimeter either. Net result:
                // the visible circle's outer diameter = brushSize, exactly
                // matching the disc the brush will paint at this position.
                boxSizing: 'border-box',
                borderRadius: '50%',
                background: tool === 'eraser' ? 'transparent' : hexToRgba(color, 0.5),
                border: '1.5px solid rgba(255, 255, 255, 0.92)',
                boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.55)',
                pointerEvents: 'none',
                opacity: cursorVisible ? 1 : 0,
                // Only opacity is transitioned — width/height must change
                // synchronously with brushSize so the indicator never
                // disagrees with the on-canvas stroke during the swap.
                transition: 'opacity 0.12s ease',
                willChange: 'transform',
                zIndex: 2,
              }}
            />
          )}

          {busy && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 1.5rem',
                background: 'rgba(8, 6, 14, 0.74)',
                backdropFilter: 'blur(8px) saturate(120%)',
                WebkitBackdropFilter: 'blur(8px) saturate(120%)',
                zIndex: 4,
              }}
            >
              {/* Editor-specific loading state — uses the muted variant
               * of the shared progress component (no shimmer sheen, flat
               * purple fill) plus a one-line status label so the user
               * always knows which operation is in flight. The bar is
               * narrower than the dialog body so it doesn't dominate
               * the preview. Estimate: 30 s for one variant + 6 s per
               * extra variant on a batch run. */}
              <div
                style={{
                  width: '100%',
                  maxWidth: 360,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    alignSelf: 'center',
                    fontSize: 12.5,
                    fontWeight: 500,
                    letterSpacing: '0.01em',
                    color: 'rgba(255, 255, 255, 0.8)',
                  }}
                >
                  {mode === 'faceswap'
                    ? 'Swapping face…'
                    : hasDrawn
                      ? 'Editing painted region…'
                      : 'Editing thumbnail…'}
                </span>
                <GenerationProgress estimatedDurationMs={30000} className="gen-progress--muted" />
                <button
                  type="button"
                  onClick={handleCancel}
                  style={{
                    alignSelf: 'center',
                    marginTop: 4,
                    padding: '5px 18px',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 999,
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.65)',
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: '0.01em',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'color 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Toolbar + mode tabs — one cohesive centered row.
         *
         *   [ tools (rect, brush, eraser, size, colour) ]
         *   [ Edit | Face-swap tabs (center) ]
         *   [ history (undo, redo, clear) ]
         *
         * The mode tabs use `<ThumbPillTabs>` so the bar reads as the
         * same component family as the generator's mode tabs. Tools
         * + history fade out when face-swap is active (mode tabs stay
         * put so the user can flip back). Width tracks the thumbnail
         * card so the toolbar stays flush with the stage on every
         * aspect ratio (portrait + square cards shrink the toolbar
         * to match instead of leaving it ballooned). */}
        <div
          className="etd-toolbar"
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 720,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '7px 12px',
            borderRadius: 16,
            background: '#14141a',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            flexWrap: 'wrap',
          }}
        >
          {/* Left cluster — paint tools. Drawing works in BOTH edit
           * and face-swap modes: the user can mark a region around
           * the face they want replaced (or a region they want
           * edited). Edit-region consumes the painted mask as a
           * constraint; face-swap currently doesn't read it (the
           * paint is a visual marker for the user's reference) —
           * the backend can grow mask support without any UI
           * change. Undo / clear all behave the same in both modes. */}
          <div
            className="etd-toolbar-cluster"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: '0 0 auto',
            }}
          >
            <CircleBtn
              onClick={() => setTool('rect')}
              active={tool === 'rect'}
              title="Rectangle (R)"
              disabled={busy}
            >
              <IconRect size={14} />
            </CircleBtn>
            <CircleBtn
              onClick={() => setTool('brush')}
              active={tool === 'brush'}
              title="Brush (B)"
              disabled={busy}
            >
              <IconBrush size={14} />
            </CircleBtn>
            <CircleBtn
              onClick={() => setTool('eraser')}
              active={tool === 'eraser'}
              title="Eraser (E)"
              disabled={busy}
            >
              <IconEraser size={14} />
            </CircleBtn>

            {/* Brush-size selector — preset chips inside a popover. The
             * trigger renders a dot whose diameter scales with the
             * current `brushSize`, giving an at-a-glance preview. */}
            <div ref={sizePopoverRef} style={{ position: 'relative' }}>
              <CircleBtn
                onClick={() => {
                  setSizePopoverOpen((o) => !o)
                  setColorPopoverOpen(false)
                }}
                active={sizePopoverOpen}
                title={`Brush size: ${brushSize}px`}
                disabled={busy}
              >
                <span
                  style={{
                    width: Math.min(16, Math.max(6, brushSize / 3)),
                    height: Math.min(16, Math.max(6, brushSize / 3)),
                    borderRadius: '50%',
                    background: 'currentColor',
                  }}
                  aria-hidden
                />
              </CircleBtn>
              {sizePopoverOpen && <BrushSizePopover value={brushSize} onChange={setBrushSize} />}
            </div>

            {/* Colour swatch — popover with the predefined palette. */}
            <div ref={colorPopoverRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setColorPopoverOpen((o) => !o)
                  setSizePopoverOpen(false)
                }}
                disabled={busy}
                title={`Overlay colour (${color})`}
                aria-label="Overlay colour"
                aria-pressed={colorPopoverOpen}
                style={{
                  width: 34,
                  height: 34,
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${
                    colorPopoverOpen ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.1)'
                  }`,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.04)',
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.4 : 1,
                  transition:
                    'border-color 0.18s ease, background 0.18s ease, transform 0.08s ease',
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: color,
                    border: '0.5px solid rgba(0,0,0,0.35)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                  }}
                  aria-hidden
                />
              </button>
              {colorPopoverOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 6,
                    padding: 8,
                    background: 'rgba(14, 14, 18, 0.88)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 14,
                    animation: 'etd-popover-in 0.18s cubic-bezier(0.32, 0.72, 0, 1) both',
                    boxShadow: '0 10px 32px rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(22px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                    zIndex: 10,
                  }}
                >
                  {COLOR_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setColor(c)
                        setColorPopoverOpen(false)
                      }}
                      aria-label={`Colour ${c}`}
                      aria-pressed={color === c}
                      style={{
                        width: 24,
                        height: 24,
                        padding: 0,
                        border:
                          color === c
                            ? '1.5px solid rgba(255,255,255,0.9)'
                            : '0.5px solid rgba(0,0,0,0.35)',
                        borderRadius: '50%',
                        background: c,
                        cursor: 'pointer',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center — Edit / Face-swap mode tabs. Same pill recipe as
           * the generator's mode tabs (`ThumbPillTabs`) so the editor
           * reads as part of the same component family. */}
          <div
            className="etd-toolbar-center"
            style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center' }}
          >
            <ThumbPillTabs
              options={EDIT_MODE_OPTIONS}
              value={mode}
              onChange={setMode}
              ariaLabel="Edit mode"
            />
          </div>

          {/* Right cluster — undo / redo / clear. Always visible so
           * the toolbar reads as one cohesive row in both modes. */}
          <div
            className="etd-toolbar-cluster"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: '0 0 auto',
            }}
          >
            <CircleBtn onClick={handleUndo} disabled={busy || undoDepth === 0} title="Undo (⌘Z)">
              <IconUndo size={14} />
            </CircleBtn>
            <CircleBtn onClick={handleRedo} disabled={busy || redoDepth === 0} title="Redo (⌘⇧Z)">
              <IconRedo size={14} />
            </CircleBtn>
            <CircleBtn onClick={handleClear} disabled={busy || !hasDrawn} title="Clear all" danger>
              <IconTrash size={14} />
            </CircleBtn>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: '8px 14px',
              borderRadius: 12,
              background: 'rgba(239,68,68,0.12)',
              border: '0.5px solid rgba(239,68,68,0.32)',
              color: '#fca5a5',
              fontSize: 13,
              lineHeight: 1.4,
              textAlign: 'center',
            }}
          >
            {error}
          </p>
        )}

        {/* Bottom action area — mode-specific. Edit mode keeps the
         * full input-card chrome so the textarea reads as a chat
         * composer. Face-swap mode drops the chrome entirely — no
         * fake-input bar, no rounded card. Just a compact pill
         * button to pick a character (or a chip showing the selected
         * one) paired with the Generate action. */}
        {mode === 'edit' ? (
          <div
            className="etd-input-card"
            style={{
              alignSelf: 'center',
              width: '100%',
              maxWidth: 720,
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
              padding: '10px 14px 10px 16px',
              borderRadius: 22,
              background: '#1c1c24',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 16px rgba(0, 0, 0, 0.35)',
              boxSizing: 'border-box',
            }}
          >
            <textarea
              ref={editTextareaRef}
              className="etd-input-textarea"
              value={editPrompt}
              onChange={(e) => {
                setEditPrompt(e.target.value)
                if (error) setError(null)
              }}
              placeholder={placeholder}
              rows={1}
              maxLength={400}
              disabled={busy}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              style={{
                width: '100%',
                padding: '2px 0 8px',
                fontSize: '0.93rem',
                fontFamily: 'inherit',
                color: 'rgba(255,255,255,0.92)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                lineHeight: 1.55,
                resize: 'none',
                minHeight: '2.2em',
                maxHeight: '7em',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
            />
            <div
              className="etd-input-actions"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 8,
                paddingTop: 4,
              }}
            >
              <PrimaryActionBtn
                onClick={handleSubmit}
                disabled={!canSubmit}
                busy={busy}
                label="Generate"
                busyLabel="Generating…"
                icon={<IconArrowUp size={13} />}
                creditCost={unitCost ?? null}
              />
            </div>
          </div>
        ) : (
          /* Face-swap layout. Stacked vertically + centered, with the
           * SAME minHeight as the .etd-input-card chrome used in Edit
           * mode so the stage container above (which is height-bound
           * by 60vh of the viewport) ends up the same physical size
           * across tab switches — no image resize when toggling
           * Edit ↔ Face swap.
           *
           *   Choose persona  ← centered pill (avatar+name chip when picked)
           *      Generate     ← centered primary action below */
          <div
            style={{
              alignSelf: 'center',
              width: '100%',
              maxWidth: 720,
              minHeight: 96,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '10px 14px',
              boxSizing: 'border-box',
            }}
          >
            <button
              ref={charPickerTriggerRef}
              type="button"
              onClick={() => !busy && setCharPickerOpen(true)}
              disabled={busy}
              aria-label={
                selectedPersona ? `Persona: ${selectedPersona.name} — change` : 'Choose persona'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: selectedPersona ? '4px 12px 4px 4px' : '8px 16px',
                background: selectedPersona
                  ? 'rgba(124, 58, 237, 0.16)'
                  : 'rgba(255, 255, 255, 0.06)',
                border: `1px solid ${
                  selectedPersona ? 'rgba(124, 58, 237, 0.5)' : 'rgba(255, 255, 255, 0.16)'
                }`,
                borderRadius: 999,
                color: 'rgba(255, 255, 255, 0.94)',
                fontFamily: 'inherit',
                fontSize: '0.86rem',
                fontWeight: 500,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.55 : 1,
                transition: 'background 0.16s ease, border-color 0.16s ease',
              }}
            >
              {selectedPersona ? (
                <>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: 'rgba(0,0,0,0.35)',
                    }}
                  >
                    {selectedPersona.image_url && (
                      <img
                        src={selectedPersona.image_url}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    )}
                  </span>
                  <span
                    style={{
                      maxWidth: 200,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedPersona.name}
                  </span>
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label="Clear persona"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearSelectedPersona()
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      marginLeft: 2,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.75)',
                      flexShrink: 0,
                    }}
                  >
                    <IconX size={10} />
                  </span>
                </>
              ) : (
                <>
                  <LucideUserRoundCog size={14} aria-hidden />
                  <span>Choose persona</span>
                </>
              )}
            </button>
            <PrimaryActionBtn
              onClick={handleSubmit}
              disabled={!canSubmit}
              busy={busy}
              label="Generate"
              busyLabel="Swapping…"
              icon={<IconArrowUp size={13} />}
              creditCost={unitCost ?? null}
            />
          </div>
        )}

        {/* Dedicated character picker — clean grid for SELECTION only.
         * Distinct from the full PersonasModal (which is the
         * management UI with create/favourite/rename/delete). Has a
         * "Create new" link at the bottom that opens PersonasModal
         * for users who need to add a character mid-flow. */}
        {charPickerOpen && (
          <CharacterPickerDialog
            onClose={() => setCharPickerOpen(false)}
            onCreateNew={() => {
              setCharPickerOpen(false)
              setPersonasModalOpen(true)
            }}
          />
        )}
        {personasModalOpen && <PersonasModal onClose={() => setPersonasModalOpen(false)} />}
      </div>
    </Dialog>
  )
}

/**
 * CharacterPickerDialog — dedicated face-swap character picker.
 *
 * Selection-only dialog (NOT the full PersonasModal management UI).
 * Centered modal with a clean grid of persona cards: tap a card →
 * persona is written into the global persona store (which the editor
 * reads from) and the dialog closes. A "Create new character" CTA at
 * the bottom opens the full PersonasModal for users who need to add
 * a character mid-flow.
 *
 * Sits in the same Dialog primitive as the rest of the product so
 * the backdrop, escape-to-close, and focus-trap behaviour are
 * consistent with PersonasModal / StylesModal.
 */
function CharacterPickerDialog({ onClose, onCreateNew }) {
  const { data, isPending } = usePersonasQuery()
  const { selectedPersonaId, setSelectedPersona } = usePersonaStore()

  const items = data?.items ?? []
  // Sort: stock/admin characters first (Demo badge), then user's own.
  // Identical ordering to PersonasModal so the user sees the same
  // characters in the same order across both surfaces.
  const stockItems = items.filter((p) => p.visibility === 'admin' || p.visibility === 'stock')
  const personalItems = items.filter((p) => p.visibility === 'personal')
  const ordered = [...stockItems, ...personalItems]

  const handlePick = (p) => {
    setSelectedPersona(p)
    onClose?.()
  }

  return (
    <Dialog open onClose={onClose} size="md" ariaLabel="Choose persona">
      <div
        className="etd-cpicker"
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#16161e',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 22,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '78vh',
        }}
      >
        {/* Header */}
        <div
          style={{
            position: 'relative',
            padding: '20px 22px 14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              fontSize: '1.05rem',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.96)',
              letterSpacing: '-0.005em',
            }}
          >
            Choose a persona
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: '0.82rem',
              color: 'rgba(255, 255, 255, 0.55)',
              lineHeight: 1.45,
            }}
          >
            Tap a saved persona to swap their face into this thumbnail.
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.75)',
              cursor: 'pointer',
            }}
          >
            <IconX size={12} />
          </button>
        </div>

        {/* Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 18px',
          }}
        >
          {isPending ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.85rem',
              }}
            >
              Loading personas…
            </div>
          ) : ordered.length === 0 ? (
            <div
              style={{
                padding: '36px 16px',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.55)',
                fontSize: '0.88rem',
                lineHeight: 1.5,
              }}
            >
              <div style={{ marginBottom: 14, color: 'rgba(255, 255, 255, 0.7)' }}>
                You don&rsquo;t have any personas yet.
              </div>
              <button
                type="button"
                onClick={onCreateNew}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: PRIMARY_GRADIENT,
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Create your first persona
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 12,
              }}
            >
              {ordered.map((p) => {
                const selected = selectedPersonaId === p.id
                const isStock = p.visibility === 'admin' || p.visibility === 'stock'
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePick(p)}
                    aria-pressed={selected}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 0,
                      padding: 0,
                      borderRadius: 16,
                      overflow: 'hidden',
                      background: selected
                        ? 'rgba(124, 58, 237, 0.16)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: `1.5px solid ${
                        selected ? 'rgba(124, 58, 237, 0.8)' : 'rgba(255, 255, 255, 0.08)'
                      }`,
                      cursor: 'pointer',
                      transition:
                        'transform 0.12s ease, border-color 0.16s ease, background 0.16s ease',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        position: 'relative',
                        aspectRatio: '1 / 1',
                        background: 'rgba(0, 0, 0, 0.4)',
                        overflow: 'hidden',
                      }}
                    >
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                          draggable={false}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'rgba(255, 255, 255, 0.3)',
                            fontSize: 22,
                          }}
                        >
                          <LucideUserRoundCog size={26} />
                        </div>
                      )}
                      {selected && (
                        <div
                          aria-hidden
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: PRIMARY_GRADIENT,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 12,
                            fontWeight: 700,
                            boxShadow: '0 2px 8px rgba(124, 58, 237, 0.5)',
                          }}
                        >
                          ✓
                        </div>
                      )}
                      {isStock && (
                        <div
                          aria-hidden
                          style={{
                            position: 'absolute',
                            bottom: 6,
                            left: 6,
                            padding: '2px 7px',
                            borderRadius: 999,
                            background: 'rgba(0, 0, 0, 0.6)',
                            color: 'rgba(255, 255, 255, 0.85)',
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                          }}
                        >
                          Demo
                        </div>
                      )}
                    </div>
                    {/* Name */}
                    <div
                      style={{
                        padding: '8px 10px 10px',
                        fontSize: '0.82rem',
                        fontWeight: 500,
                        color: 'rgba(255, 255, 255, 0.92)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name || 'Untitled'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer with Create CTA — only shows when there are
         * existing characters; the empty state has its own create
         * button. */}
        {!isPending && ordered.length > 0 && (
          <div
            style={{
              padding: '12px 18px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: '0.78rem',
                color: 'rgba(255, 255, 255, 0.45)',
              }}
            >
              {ordered.length} {ordered.length === 1 ? 'persona' : 'personas'}
            </div>
            <button
              type="button"
              onClick={onCreateNew}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 999,
                background: 'rgba(124, 58, 237, 0.18)',
                border: '1px solid rgba(124, 58, 237, 0.45)',
                color: 'rgba(196, 181, 253, 0.95)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Create new
            </button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export default EditThumbnailDialog
