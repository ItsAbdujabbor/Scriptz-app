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
import GenerationProgress from './GenerationProgress'
import { friendlyMessage } from '../lib/aiErrors'
import { canvasToBase64Png } from '../lib/canvasToBase64'

const PRIMARY_GRADIENT = 'var(--accent-gradient)'
const MASK_CSS_OPACITY = 0.4
const MASK_THRESHOLD = 10
const UNDO_CAP = 20

const COLOR_SWATCHES = [
  '#EF4444', // red
  '#F59E0B', // amber
  '#10B981', // emerald
  '#06B6D4', // cyan
  '#A78BFA', // violet
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
export function EditThumbnailDialog({ imageUrl, onClose, onApply }) {
  const [mode, setMode] = useState('edit') // 'edit' | 'faceswap'
  const [editPrompt, setEditPrompt] = useState('')
  const [batch] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { selectedPersona } = usePersonaStore()

  // Drawing state
  const [tool, setTool] = useState('brush') // 'rect' | 'brush' | 'eraser'
  const [brushSize, setBrushSize] = useState(32)
  const [color, setColor] = useState(COLOR_SWATCHES[0])
  const [hasDrawn, setHasDrawn] = useState(false)
  const [undoDepth, setUndoDepth] = useState(0)
  const [redoDepth, setRedoDepth] = useState(0)
  const [sizePopoverOpen, setSizePopoverOpen] = useState(false)
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false)

  const editTextareaRef = useRef(null)
  const queryClient = useQueryClient()

  // Live per-tier credit cost for the action the user is about to take.
  // Backend charges the same cost for edit + faceswap, so one key covers both.
  const { unit: unitCost, total: totalCost } = useCostOf('thumbnail_edit_faceswap', batch)

  // Canvas refs
  const maskCanvasRef = useRef(null) // full natural resolution mask canvas — holds committed strokes
  const overlayCanvasRef = useRef(null) // same-size sibling canvas — rect-tool in-progress preview only
  const stageRef = useRef(null) // the wrapper whose rect we measure
  // Custom brush cursor preview — a circle that tracks the pointer
  // while in brush/eraser mode. Position is updated imperatively
  // (`cursorPreviewRef.current.style.transform = …`) on every
  // pointermove so we don't burn React re-renders at ~60 fps.
  const cursorPreviewRef = useRef(null)
  const [cursorVisible, setCursorVisible] = useState(false)
  // Marching-ants marquee — a data URL of the painted region's
  // outline. Computed at the end of every stroke (and after undo /
  // redo / clear) by walking the alpha channel of the mask canvas
  // and marking pixels that sit on a transparent → opaque boundary.
  // Rendered as the `mask-image` of an animated striped div so the
  // stripes only show along the painted regions' perimeters.
  const [marqueeUrl, setMarqueeUrl] = useState(null)
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
  }, [onClose, busy, editPrompt, batch])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    editTextareaRef.current?.focus()
  }, [])

  // Load the image + size the canvas to its natural dimensions, with a
  // 1920-px-wide minimum so thumbnails that ship at low resolution
  // still get a high-density paint surface. The canvas is then scaled
  // DOWN to display via CSS — downscaling stays sharp under the
  // browser's bilinear filter, whereas an upscaled canvas (low
  // intrinsic res, larger CSS size) is what makes brush strokes look
  // pixelated. The mask we send to the backend keeps the same density,
  // which the region-edit service resizes back to the source image.
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
        const MIN_CANVAS_W = 1920
        const naturalW = img.naturalWidth || img.width || 1536
        const naturalH = img.naturalHeight || img.height || 864
        const aspect = naturalH / naturalW
        // Drive the stage's CSS aspect-ratio from the actual image so
        // the card snaps from landscape (16:9) to portrait (9:16) to
        // square cleanly — no letterboxing, no cropping.
        setImageAspect(naturalW / naturalH)
        const w = Math.max(naturalW, MIN_CANVAS_W)
        const h = Math.round(w * aspect)
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').clearRect(0, 0, w, h)
        if (overlay) {
          overlay.width = w
          overlay.height = h
          overlay.getContext('2d').clearRect(0, 0, w, h)
        }
        undoStackRef.current = []
        redoStackRef.current = []
        setUndoDepth(0)
        setRedoDepth(0)
        setHasDrawn(false)
        setMarqueeUrl(null)
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

  /* ── Canvas drawing primitives ────────────────────────────────── */
  const getCanvasCoords = useCallback((e) => {
    const canvas = maskCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX)
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY)
    if (clientX == null || clientY == null) return null
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    }
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

    // Stamp a filled circle at the current sample — guarantees a
    // perfect disc at every event even if the curve segment ends up
    // degenerate, and fills any sub-pixel rendering gaps near caps.
    ctx.beginPath()
    ctx.arc(curr.x, curr.y, size / 2, 0, Math.PI * 2)
    ctx.fill()

    if (!prev1) return // first sample of the stroke — disc is enough
    if (!prev2) {
      // Second sample: straight line; round caps make joins seamless.
      ctx.beginPath()
      ctx.moveTo(prev1.x, prev1.y)
      ctx.lineTo(curr.x, curr.y)
      ctx.stroke()
      return
    }
    // Three samples: quadratic curve through (mid(p0,p1)) → (mid(p1,p2))
    // with p1 as control. Standard "smooth brush" curve.
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

  // Build the marching-ants outline mask from the current mask canvas
  // and stash it as a data URL for the striped overlay to consume via
  // `mask-image`. Walks the alpha channel once: for every painted
  // pixel (alpha > MASK_THRESHOLD) we check its 4-neighbours; if any
  // is below the threshold the pixel sits on an edge, so we paint
  // the pixel + a small ring around it into the output. The ring
  // width controls the visible thickness of the marquee. Down-samples
  // first when the canvas is huge so the walk is sub-50ms even on
  // big paint surfaces. */
  const rebuildMarquee = useCallback(() => {
    const src = maskCanvasRef.current
    if (!src) {
      setMarqueeUrl(null)
      return
    }
    if (!hasDrawn) {
      setMarqueeUrl(null)
      return
    }
    // Down-sample by `step` so the edge walk stays cheap on big
    // canvases. Strokes are rounded so the marquee tolerates a 2x
    // density loss without looking jagged.
    const STEP = 2
    const sw = Math.max(1, Math.floor(src.width / STEP))
    const sh = Math.max(1, Math.floor(src.height / STEP))
    const tmp = document.createElement('canvas')
    tmp.width = sw
    tmp.height = sh
    const tctx = tmp.getContext('2d')
    tctx.imageSmoothingEnabled = true
    tctx.drawImage(src, 0, 0, sw, sh)
    const data = tctx.getImageData(0, 0, sw, sh).data
    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const octx = out.getContext('2d')
    const dst = octx.createImageData(sw, sh)
    const T = MASK_THRESHOLD
    const RING = 1 // half-thickness in down-sampled px (so 3 px total)
    let edgeCount = 0
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4
        const a = data[i + 3]
        if (a <= T) continue
        const left = x > 0 ? data[i - 4 + 3] : 0
        const right = x < sw - 1 ? data[i + 4 + 3] : 0
        const up = y > 0 ? data[i - sw * 4 + 3] : 0
        const down = y < sh - 1 ? data[i + sw * 4 + 3] : 0
        if (left > T && right > T && up > T && down > T) continue
        edgeCount++
        for (let dy = -RING; dy <= RING; dy++) {
          for (let dx = -RING; dx <= RING; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || nx >= sw || ny < 0 || ny >= sh) continue
            const j = (ny * sw + nx) * 4
            dst.data[j] = 255
            dst.data[j + 1] = 255
            dst.data[j + 2] = 255
            dst.data[j + 3] = 255
          }
        }
      }
    }
    if (edgeCount === 0) {
      setMarqueeUrl(null)
      return
    }
    octx.putImageData(dst, 0, 0)
    setMarqueeUrl(out.toDataURL('image/png'))
  }, [hasDrawn])

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
    const canvas = maskCanvasRef.current
    const ctx = canvas.getContext('2d')
    const scale = canvas.width / canvas.getBoundingClientRect().width
    const effectiveSize = brushSize * scale
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
    // Defer marquee rebuild a frame so React can flush the state
    // first; reads run after the canvas paint settles.
    requestAnimationFrame(rebuildMarquee)
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
      requestAnimationFrame(rebuildMarquee)
    } finally {
      undoBusyRef.current = false
    }
  }, [snapshotCanvasAsBlobPromise, restoreBlobToCanvas, rebuildMarquee])

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
      requestAnimationFrame(rebuildMarquee)
    } finally {
      undoBusyRef.current = false
    }
  }, [snapshotCanvasAsBlobPromise, restoreBlobToCanvas, rebuildMarquee])

  const handleClear = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const snap = snapshotCanvas()
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (snap) pushUndoPromise(imageDataToBlobPromise(snap))
    setHasDrawn(false)
    setMarqueeUrl(null)
  }, [snapshotCanvas, pushUndoPromise, imageDataToBlobPromise])

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
  async function callEditOnce(token, maskB64) {
    const imageB64 = extractBase64FromDataUrl(imageUrl)
    const res = await thumbnailsApi.editRegion(token, {
      thumbnail_image_base64: imageB64 || undefined,
      thumbnail_image_url: imageB64 ? undefined : imageUrl,
      mask_base64: maskB64,
      edit_prompt: editPrompt.trim(),
    })
    return res?.image_url || null
  }

  async function callFaceSwapOnce(token) {
    const imageB64 = extractBase64FromDataUrl(imageUrl)
    const faceUrl = selectedPersona?.image_url
    const faceB64 = extractBase64FromDataUrl(faceUrl)
    const res = await thumbnailsApi.faceSwap(token, {
      thumbnail_image_base64: imageB64 || undefined,
      thumbnail_image_url: imageB64 ? undefined : imageUrl,
      face_image_base64: faceB64 || undefined,
      face_image_url: faceB64 ? undefined : faceUrl,
      extra_hint: editPrompt.trim() || undefined,
    })
    return res?.image_url || null
  }

  async function handleSubmit() {
    if (busy) return
    if (!imageUrl) return setError('No thumbnail to edit.')
    if (mode === 'faceswap') {
      if (!selectedPersona?.image_url) {
        return setError('Pick a character to swap the face with.')
      }
    } else if (!editPrompt.trim()) {
      return setError('Describe the change you want.')
    }

    setError(null)
    setBusy(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in required.')

      let oneCall
      if (mode === 'faceswap') {
        oneCall = () => callFaceSwapOnce(token)
      } else {
        // Resolve the mask once up-front so each batch call reuses it.
        const maskB64 = await exportMaskBase64()
        oneCall = () => callEditOnce(token, maskB64)
      }

      const settled = await Promise.allSettled(Array.from({ length: batch }, () => oneCall()))
      const urls = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value)
      if (urls.length === 0) {
        const firstErr = settled.find((r) => r.status === 'rejected')
        throw new Error(
          firstErr?.reason?.message ||
            (mode === 'faceswap' ? 'Face swap failed.' : 'No image returned.')
        )
      }
      invalidateCredits(queryClient)
      onApply?.(urls.length === 1 ? urls[0] : urls)
      onClose?.()
    } catch (err) {
      setError(
        friendlyMessage(err) ||
          (mode === 'faceswap'
            ? 'Face swap failed. Try a different character.'
            : 'Edit failed. Try a different prompt.')
      )
      setBusy(false)
    }
  }

  const canSubmit =
    !busy &&
    !!imageUrl &&
    (mode === 'faceswap' ? !!selectedPersona?.image_url : !!editPrompt.trim())

  const placeholder =
    mode === 'faceswap'
      ? 'Optional hint — e.g. "keep the same expression" or "match the lighting".'
      : 'Describe the change — paint a region for targeted edits, or leave blank to edit the whole thumbnail.'

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      size="wide"
      ariaLabel="Edit thumbnail"
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
        /* Marching-ants — slides the diagonal stripe pattern by one
         * full repeat (17px) so the dashes appear to crawl along the
         * outline mask. 0.9s loop is brisk enough to read as motion
         * without feeling jittery. */
        @keyframes etd-marching-ants {
          from { background-position: 0 0; }
          to   { background-position: 17px 17px; }
        }
      `}</style>

      <div
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
                objectFit: 'cover',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
              draggable={false}
              loading="lazy"
              decoding="async"
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
              inset: 0,
              width: '100%',
              height: '100%',
              // Painted strokes are full-opacity on the canvas; CSS opacity
              // makes the overlay look transparent. This means painting over
              // the same spot twice doesn't accumulate darker — it stays one
              // uniform transparent layer.
              opacity: MASK_CSS_OPACITY,
              // Hide the native crosshair while in brush/eraser mode so
              // only the custom circle preview is visible. Rect tool still
              // uses crosshair so the corner-anchored drag is unambiguous.
              cursor: busy
                ? 'default'
                : tool === 'brush' || tool === 'eraser'
                  ? 'none'
                  : 'crosshair',
              touchAction: 'none',
              pointerEvents: busy ? 'none' : 'auto',
            }}
          />
          {/* Overlay: sibling canvas that renders the rect-tool preview
              during pointermove without forcing a putImageData restore on
              the mask canvas. pointer-events: none so all input still
              flows to the mask canvas above. Matches mask opacity so the
              preview blends identically with the committed strokes. */}
          <canvas
            ref={overlayCanvasRef}
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: MASK_CSS_OPACITY,
              pointerEvents: 'none',
            }}
          />

          {/* Marching-ants marquee — outline of the painted region
           * rendered as a striped pattern masked through the edge
           * mask. Stripes animate along their gradient axis at a
           * gentle 1.4 s loop, the classic Photoshop marquee feel.
           * Hidden during an active stroke so the live brush isn't
           * cluttered, and only mounts once we have an outline mask
           * to clip against. */}
          {marqueeUrl && !drawingRef.current && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(255,255,255,0.95) 0 6px, rgba(0,0,0,0.85) 6px 12px)',
                backgroundSize: '17px 17px',
                WebkitMaskImage: `url(${marqueeUrl})`,
                maskImage: `url(${marqueeUrl})`,
                WebkitMaskSize: '100% 100%',
                maskSize: '100% 100%',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                animation: 'etd-marching-ants 0.9s linear infinite',
                mixBlendMode: 'normal',
                zIndex: 3,
              }}
            />
          )}

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
                borderRadius: '50%',
                background: tool === 'eraser' ? 'transparent' : hexToRgba(color, 0.45),
                border: '1.5px solid rgba(255, 255, 255, 0.92)',
                boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.32)',
                pointerEvents: 'none',
                opacity: cursorVisible ? 1 : 0,
                transition: 'opacity 0.12s ease, width 0.12s ease, height 0.12s ease',
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
                background: 'rgba(8, 6, 14, 0.72)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
            >
              {/* Same shared loader as the main thumbnail-generation flow.
               * Edit / face-swap takes a touch longer than a single
               * generate (mask round-trip + variant batching), so estimate
               * 30 s for one variant and +6 s per extra variant. */}
              <div style={{ width: '100%', maxWidth: 420 }}>
                <GenerationProgress estimatedDurationMs={30000 + Math.max(0, batch - 1) * 6000} />
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
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: `min(1040px, calc(60vh * ${imageAspect}))`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '7px 12px',
            borderRadius: 16,
            background: 'rgba(14, 14, 18, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(22px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
            flexWrap: 'wrap',
          }}
        >
          {/* Left cluster — paint tools. Same set is available on
           * face-swap so users can mark a region around the face
           * they want replaced (the mask isn't sent today, but the
           * UI is consistent and undo / clear all behave the same). */}
          <div
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
          <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center' }}>
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

        {/* Face-swap panel — persona picker. Shown only when face-swap
         * mode is active; the drawing toolbar above is hidden in this
         * case so the UI stays focused. */}
        {mode === 'faceswap' && (
          <FaceSwapPanel
            busy={busy}
            disabled={!canSubmit}
            onGenerate={handleSubmit}
            unitCost={unitCost}
            totalCost={batch > 1 ? totalCost : unitCost}
          />
        )}

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

        {/* Input area — only mounted in Edit mode; face-swap mode
         * has no prompt textarea, just the persona pill + Generate
         * button rendered by `<FaceSwapPanel>` above. */}
        {mode === 'edit' && (
          <div
            style={{
              alignSelf: 'center',
              width: '100%',
              maxWidth: 720,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '12px 14px',
              borderRadius: 22,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 22px rgba(0, 0, 0, 0.22)',
              animation: 'etd-fade-in 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
            }}
          >
            <textarea
              ref={editTextareaRef}
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
                padding: '4px 2px',
                fontSize: '0.92rem',
                fontFamily: 'inherit',
                color: 'rgba(255,255,255,0.95)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                lineHeight: 1.5,
                resize: 'none',
                minHeight: '2.6em',
                maxHeight: '7em',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PrimaryActionBtn
                onClick={handleSubmit}
                disabled={!canSubmit}
                busy={busy}
                label="Generate"
                busyLabel="Generating…"
                icon={<IconArrowUp size={13} />}
                creditCost={unitCost ? (batch > 1 ? totalCost : unitCost) : null}
              />
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

/**
 * FaceSwapPanel — bespoke face-swap UI for the editor.
 *
 *   ┌──────────────────────────────────────┐
 *   │  [face]  Persona name           [×]  │   ← pill picker (full-width)
 *   └──────────────────────────────────────┘
 *   ┌──────────────────────────────────────┐
 *   │            Generate · 12cr           │   ← primary CTA
 *   └──────────────────────────────────────┘
 *
 * Rolls its own pill trigger + popover (instead of embedding the
 * shared <PersonaSelector>) so every detail — the avatar size, the
 * gradient on the active state, the hairline border, the popover
 * surface — matches the editor's design language exactly. Click the
 * pill to open / dismiss the persona list; click outside to close.
 */
function FaceSwapPanel({ busy, disabled, onGenerate, unitCost, totalCost }) {
  const { selectedPersona, setSelectedPersona, clearSelectedPersona } = usePersonaStore()
  const { data, isPending } = usePersonasQuery()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  const items = data?.items ?? []
  const cost = unitCost ? totalCost : null

  return (
    <div
      style={{
        alignSelf: 'center',
        width: '100%',
        maxWidth: 540,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        animation: 'etd-fade-in 0.24s cubic-bezier(0.32, 0.72, 0, 1) both',
      }}
    >
      {/* Pill picker. The two visual states (empty vs selected)
       * share the same silhouette: full-width capsule, white-grey
       * hairline, soft inset highlight. Selected state lifts the
       * border into a subtle violet to match the active mode tab. */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => !busy && setOpen((o) => !o)}
          disabled={busy}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={selectedPersona ? `Character: ${selectedPersona.name}` : 'Pick a character'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            padding: selectedPersona ? '8px 12px 8px 8px' : '12px 16px',
            border: `1px solid ${
              open
                ? 'rgba(167, 139, 250, 0.65)'
                : selectedPersona
                  ? 'rgba(167, 139, 250, 0.42)'
                  : 'rgba(255, 255, 255, 0.12)'
            }`,
            borderRadius: 999,
            background: selectedPersona
              ? 'linear-gradient(180deg, rgba(139, 92, 246, 0.18) 0%, rgba(139, 92, 246, 0.07) 100%)'
              : 'rgba(255, 255, 255, 0.04)',
            color: '#ffffff',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 500,
            boxShadow: selectedPersona
              ? 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 18px rgba(124, 58, 237, 0.18)'
              : 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
            transition:
              'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, transform 0.12s cubic-bezier(0.33, 1, 0.68, 1)',
            opacity: busy ? 0.55 : 1,
          }}
        >
          {selectedPersona ? (
            <>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                {selectedPersona.image_url && (
                  <img
                    src={selectedPersona.image_url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
              </span>
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selectedPersona.name}
              </span>
              <span
                role="button"
                aria-label="Clear character"
                onClick={(e) => {
                  e.stopPropagation()
                  clearSelectedPersona()
                  setOpen(false)
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'rgba(0, 0, 0, 0.35)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              >
                <IconX size={12} />
              </span>
            </>
          ) : (
            <>
              <span style={{ flex: 1, textAlign: 'center', color: 'rgba(255, 255, 255, 0.6)' }}>
                Pick a character
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  transform: open ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                  color: 'rgba(255, 255, 255, 0.55)',
                }}
              >
                <IconChevron size={14} />
              </span>
            </>
          )}
        </button>

        {open && (
          <div
            role="listbox"
            style={{
              position: 'absolute',
              // Pops UPWARD above the pill — speech-bubble style. The
              // generator's pill-tab popovers all open this way too.
              bottom: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              maxHeight: 280,
              overflowY: 'auto',
              padding: 6,
              // Solid panel surface (no backdrop-filter) — same recipe
              // as the editor's input bar so the popover reads as the
              // same dialog family, not a translucent dropdown.
              background: '#1c1c24',
              backgroundImage:
                'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 18,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 36px rgba(0, 0, 0, 0.6)',
              transformOrigin: 'bottom center',
              animation: 'etd-fade-in 0.18s cubic-bezier(0.32, 0.72, 0, 1) both',
              zIndex: 5,
            }}
          >
            {isPending && (
              <div
                style={{
                  padding: 12,
                  fontSize: 12,
                  color: 'rgba(255, 255, 255, 0.55)',
                  textAlign: 'center',
                }}
              >
                Loading characters…
              </div>
            )}
            {!isPending && items.length === 0 && (
              <div
                style={{
                  padding: 12,
                  fontSize: 12,
                  color: 'rgba(255, 255, 255, 0.55)',
                  textAlign: 'center',
                }}
              >
                No characters yet — create one from the Characters menu.
              </div>
            )}
            {items.map((p) => {
              const active = selectedPersona?.id === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setSelectedPersona(p)
                    setOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: 10,
                    background: active ? 'rgba(167, 139, 250, 0.16)' : 'transparent',
                    color: active ? '#ffffff' : 'rgba(229, 231, 235, 0.85)',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt=""
                        loading="lazy"
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
                      flex: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.name}
                  </span>
                  {(p.visibility === 'admin' || p.visibility === 'stock') && (
                    <span
                      style={{
                        flexShrink: 0,
                        padding: '2px 7px',
                        borderRadius: 999,
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: 'rgba(255, 255, 255, 0.92)',
                        background: 'rgba(0, 0, 0, 0.62)',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.16)',
                      }}
                      aria-hidden
                    >
                      Demo
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Generate — full-width primary pill. PrimaryPill at size=md
       * here (not sm) because this is the only CTA on the screen. */}
      <PrimaryPill
        type="button"
        size="md"
        fullWidth
        onClick={onGenerate}
        disabled={disabled}
        busy={busy}
        busyLabel="Swapping…"
        label={
          cost ? (
            <>
              <span
                aria-hidden
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  lineHeight: 1,
                  paddingRight: '0.55rem',
                  marginRight: '0.2rem',
                  borderRight: '1px solid rgba(255, 255, 255, 0.22)',
                }}
              >
                <IconZapFilled size={12} />
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                  }}
                >
                  {cost}
                </span>
              </span>
              Generate
            </>
          ) : (
            'Generate'
          )
        }
        ariaLabel="Run face swap"
      />
    </div>
  )
}

export default EditThumbnailDialog
