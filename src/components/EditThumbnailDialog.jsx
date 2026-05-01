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
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import { invalidateCredits, useCostOf } from '../queries/billing/creditsQueries'
import { PrimaryPill } from './ui/PrimaryPill'
import { PersonaSelector } from './PersonaSelector'
import { usePersonaStore } from '../stores/personaStore'
import GenerationProgress from './GenerationProgress'
import { friendlyMessage } from '../lib/aiErrors'
import { canvasToBase64Png } from '../lib/canvasToBase64'

const Z_INDEX = 2147483647
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
const IconPencil = (p) => (
  <Svg
    {...p}
    path={
      <>
        <path d="M14.7 5.3a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 9.7-9.7z" />
        <path d="M13 7 17 11" />
      </>
    }
  />
)
const IconFaceSwap = (p) => (
  <Svg
    {...p}
    path={
      <>
        {/* head silhouette */}
        <circle cx="12" cy="9" r="3.2" />
        <path d="M6 19c1-3 3.4-4.5 6-4.5s5 1.5 6 4.5" />
        {/* swap arrows arcing around the head */}
        <path d="M3 10.5a6 6 0 0 1 4-4.2" />
        <polyline points="7.2 4.2 7 6.3 9 6.5" />
        <path d="M21 13.5a6 6 0 0 1-4 4.2" />
        <polyline points="16.8 19.8 17 17.7 15 17.5" />
      </>
    }
  />
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
const IconRect = (p) => (
  <Svg {...p} path={<rect x="4" y="6" width="16" height="12" rx="1.5" strokeDasharray="2.5 2" />} />
)
const IconBrush = (p) => (
  <Svg
    {...p}
    path={
      <>
        <path d="M3 14.5c.8-1.2 2.2-1.8 3.5-1.3 1.3.5 2.8.1 3.8-.9L16 6.5a2 2 0 0 0-2.5-2.5l-5.7 5.7c-1 1-1.4 2.5-.9 3.8.5 1.3-.1 2.7-1.3 3.5" />
        <circle cx="3.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
      </>
    }
  />
)
const IconEraser = (p) => (
  <Svg
    {...p}
    path={
      <>
        <path d="m14 6-7.5 7.5M4 16h12" />
        <path d="M4.5 13.5 10 8l4.5 4.5-3.5 3.5H7.5L4.5 13.5Z" />
      </>
    }
  />
)
// Undo / Redo glyphs from src/assets/undo-alt.svg + redo-alt.svg.
// These are fill-based (not stroke), so they bypass the local Svg
// helper which is configured for stroke icons. `currentColor` keeps
// them tied to the surrounding button colour.
const IconUndo = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
    <path d="M22.535,8.46A4.965,4.965,0,0,0,19,7h0L2.8,7,7.1,2.7A1,1,0,0,0,5.682,1.288L.732,6.237a2.5,2.5,0,0,0,0,3.535l4.95,4.951A1,1,0,1,0,7.1,13.309L2.788,9,19,9h0a3,3,0,0,1,3,3v7a3,3,0,0,1-3,3H5a1,1,0,0,0,0,2H19a5.006,5.006,0,0,0,5-5V12A4.969,4.969,0,0,0,22.535,8.46Z" />
  </svg>
)
const IconRedo = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
    <path d="M16.9,14.723a1,1,0,0,0,1.414,0l4.949-4.95a2.5,2.5,0,0,0,0-3.536l-4.95-4.949A1,1,0,0,0,16.9,2.7L21.2,7,5,7H5a5,5,0,0,0-5,5v7a5.006,5.006,0,0,0,5,5H19a1,1,0,0,0,0-2H5a3,3,0,0,1-3-3V12A3,3,0,0,1,5,9H5L21.212,9,16.9,13.309A1,1,0,0,0,16.9,14.723Z" />
  </svg>
)
const IconTrash = (p) => (
  <Svg
    {...p}
    path={
      <>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    }
  />
)

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
                paddingRight: '0.5rem',
                marginRight: '0.15rem',
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

  // Load the image + size the canvas to its natural dimensions.
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
        const w = img.naturalWidth || img.width || 1536
        const h = img.naturalHeight || img.height || 864
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
      })
      .catch(() => {
        /* image failed — drawing will no-op, edit still works as full-mask */
      })
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  // Outside-click for popovers.
  useEffect(() => {
    if (!sizePopoverOpen && !colorPopoverOpen) return
    const onDoc = (e) => {
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
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
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

  const paintBrushSegment = useCallback((ctx, p1, p2, size, rgba, erase) => {
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = rgba
    ctx.fillStyle = rgba
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (!p2 || (p1.x === p2.x && p1.y === p2.y)) {
      ctx.beginPath()
      ctx.arc(p1.x, p1.y, size / 2, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
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
      lastX: pos.x,
      lastY: pos.y,
    }
    if (tool === 'brush' || tool === 'eraser') {
      paintBrushSegment(ctx, pos, null, effectiveSize, rgba, tool === 'eraser')
    } else if (tool === 'rect') {
      // Clear overlay; rect previews land there during move so we never
      // do a full-canvas putImageData per frame.
      const overlay = overlayCanvasRef.current
      if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height)
    }
  }

  const onPointerMove = (e) => {
    if (!drawingRef.current) return
    const pos = getCanvasCoords(e)
    if (!pos) return
    const { tool: t, size, color: rgba, startX, startY, lastX, lastY } = drawingRef.current
    if (t === 'rect') {
      // Draw the in-progress rect on the overlay canvas. The base
      // (mask) canvas stays untouched until pointerup, so we avoid the
      // 5 MB putImageData blit that used to run on every mousemove.
      const overlay = overlayCanvasRef.current
      if (!overlay) return
      const octx = overlay.getContext('2d')
      octx.clearRect(0, 0, overlay.width, overlay.height)
      paintRectPreview(octx, startX, startY, pos.x, pos.y, rgba)
    } else {
      const canvas = maskCanvasRef.current
      const ctx = canvas.getContext('2d')
      paintBrushSegment(ctx, { x: lastX, y: lastY }, pos, size, rgba, t === 'eraser')
      drawingRef.current.lastX = pos.x
      drawingRef.current.lastY = pos.y
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
    } finally {
      undoBusyRef.current = false
    }
  }, [snapshotCanvasAsBlobPromise, restoreBlobToCanvas])

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
    } finally {
      undoBusyRef.current = false
    }
  }, [snapshotCanvasAsBlobPromise, restoreBlobToCanvas])

  const handleClear = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const snap = snapshotCanvas()
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (snap) pushUndoPromise(imageDataToBlobPromise(snap))
    setHasDrawn(false)
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

  const dialog = (
    <div
      onClick={() => (busy ? null : onClose?.())}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(8, 6, 14, 0.78)',
        backdropFilter: 'blur(22px) saturate(160%)',
        WebkitBackdropFilter: 'blur(22px) saturate(160%)',
        animation: 'etd-overlay-in 0.22s cubic-bezier(0.32, 0.72, 0, 1) both',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes etd-overlay-in {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes etd-panel-in {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes etd-spin { to { transform: rotate(360deg); } }
        @keyframes etd-popover-in {
          from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.95); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        @keyframes etd-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* Widen the PersonaSelector trigger into a full-row button when it
         * lives inside the face-swap panel. */
        .etd-face-panel .persona-selector { width: 100%; }
        .etd-face-panel .persona-selector-trigger {
          display: flex;
          width: 100%;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          font-size: 13px;
        }
        .etd-face-panel .persona-selector-trigger:hover {
          background: rgba(139, 92, 246, 0.1);
          border-color: rgba(139, 92, 246, 0.38);
        }
        .etd-face-panel .persona-selector-label { max-width: none; flex: 1; text-align: left; }
        .etd-face-panel .persona-selector-trigger-img { width: 22px; height: 22px; border-radius: 999px; }
        .etd-face-panel .persona-selector-icon svg { width: 18px; height: 18px; }
        .etd-face-panel .persona-selector-reset { top: 6px; right: 6px; }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit thumbnail"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 1040,
          maxHeight: 'calc(100dvh - 48px)',
          padding: '22px 22px 18px',
          borderRadius: 22,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 40%, rgba(255,255,255,0.01) 100%)',
          backdropFilter: 'blur(50px) saturate(190%) brightness(1.05)',
          WebkitBackdropFilter: 'blur(50px) saturate(190%) brightness(1.05)',
          border: '0.5px solid rgba(255, 255, 255, 0.22)',
          boxShadow:
            'inset 0 0.5px 0 rgba(255,255,255,0.18), inset 0 -0.5px 0 rgba(255,255,255,0.05), 0 0 0 0.5px rgba(0,0,0,0.14), 0 16px 48px rgba(0,0,0,0.48), 0 28px 72px rgba(0,0,0,0.28)',
          color: '#fff',
          fontFamily: 'inherit',
          animation: 'etd-panel-in 0.3s cubic-bezier(0.32, 0.72, 0, 1) both',
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

        {/* Thumbnail + canvas — 16:9 card, bigger stage so the image
         * reads clearly while masking and you can see faceswap results. */}
        <div
          ref={stageRef}
          style={{
            position: 'relative',
            alignSelf: 'center',
            width: '100%',
            maxWidth: 880,
            aspectRatio: '16 / 9',
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
            onPointerLeave={onPointerUp}
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
              cursor: busy ? 'default' : 'crosshair',
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

        {/* Toolbar — visible only in Edit mode. Centered under the
         * thumbnail, constrained to the same max-width so it shares the
         * column. Hidden on the Face-swap tab to keep that UI focused. */}
        <div
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 880,
            display: mode === 'edit' ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 14,
            background: 'rgba(14, 14, 18, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(22px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
          }}
        >
          {/* Left side — tools, separated by gap */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

            {/* Brush size popover */}
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
              {sizePopoverOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    background: 'rgba(14, 14, 18, 0.88)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 14,
                    boxShadow: '0 10px 32px rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(22px) saturate(180%)',
                    animation: 'etd-popover-in 0.18s cubic-bezier(0.32, 0.72, 0, 1) both',
                    WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                    zIndex: 10,
                    width: 200,
                  }}
                >
                  <input
                    type="range"
                    min="8"
                    max="120"
                    step="2"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#a78bfa' }}
                    aria-label="Brush size"
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'rgba(255,255,255,0.75)',
                      minWidth: 32,
                      textAlign: 'right',
                    }}
                  >
                    {brushSize}px
                  </span>
                </div>
              )}
            </div>

            {/* Color popover */}
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

          {/* Spacer */}
          <span style={{ flex: 1 }} />

          {/* Right side — history */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

        {/* Mode tabbar — Edit (paint + prompt) vs Face swap (persona). */}
        <div
          role="tablist"
          aria-label="Edit mode"
          style={{
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: 4,
            borderRadius: 999,
            background: 'rgba(14, 14, 18, 0.55)',
            border: '0.5px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(22px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
          }}
        >
          <TabButton
            active={mode === 'edit'}
            onClick={() => setMode('edit')}
            icon={<IconPencil size={13} />}
            label="Edit"
          />
          <TabButton
            active={mode === 'faceswap'}
            onClick={() => setMode('faceswap')}
            icon={<IconFaceSwap size={14} />}
            label="Face swap"
          />
        </div>

        {/* Face-swap panel — persona picker. Shown only when face-swap
         * mode is active; the drawing toolbar above is hidden in this
         * case so the UI stays focused. */}
        {mode === 'faceswap' && (
          <div
            className="etd-face-panel"
            style={{
              alignSelf: 'center',
              width: '100%',
              maxWidth: 560,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 14,
              borderRadius: 14,
              background: 'rgba(14, 14, 18, 0.45)',
              border: '0.5px solid rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(22px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
              animation: 'etd-fade-in 0.24s cubic-bezier(0.32, 0.72, 0, 1) both',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.55)',
                textAlign: 'center',
              }}
            >
              Swap face with
            </span>
            <PersonaSelector />
            {!selectedPersona && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.5)',
                  textAlign: 'center',
                }}
              >
                Pick a character above to use their face.
              </p>
            )}
          </div>
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

        {/* Input area — liquid-glass pill matching the app language:
         * dark black-tint gradient, heavy blur, thin highlight border.
         * In faceswap mode the prompt is optional (hint only), in edit
         * mode it's the main driver. */}
        <div
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 640,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            padding: '0.55rem 0.55rem 0.55rem 0.9rem',
            borderRadius: 999,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.3) 100%)',
            backdropFilter: 'blur(30px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(30px) saturate(1.8)',
            border: '0.5px solid rgba(255, 255, 255, 0.14)',
            boxShadow:
              'inset 0 0.5px 0 rgba(255,255,255,0.2), inset 0 -0.5px 0 rgba(255,255,255,0.04), 0 6px 22px rgba(0, 0, 0, 0.32)',
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
              flex: 1,
              padding: '0.5rem 0.2rem',
              fontSize: '0.86rem',
              fontFamily: 'inherit',
              color: 'rgba(255,255,255,0.95)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              lineHeight: 1.5,
              resize: 'none',
              minHeight: '1.5em',
              maxHeight: '6em',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          />
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
    </div>
  )

  return createPortal(dialog, document.body)
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onPointerDown={(e) => {
        e.currentTarget.style.transform = 'scale(0.93)'
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = ''
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = ''
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '7px 16px',
        border: 'none',
        borderRadius: 999,
        background: active
          ? 'linear-gradient(135deg, rgba(144,97,240,0.28) 0%, rgba(124,58,237,0.22) 100%)'
          : 'transparent',
        color: active ? '#ffffff' : 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.005em',
        fontFamily: 'inherit',
        cursor: 'pointer',
        boxShadow: active
          ? 'inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 14px rgba(124,58,237,0.22)'
          : 'none',
        transition:
          'background 0.22s ease, color 0.22s ease, box-shadow 0.22s ease, transform 0.12s cubic-bezier(0.33, 1, 0.68, 1)',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export default EditThumbnailDialog
