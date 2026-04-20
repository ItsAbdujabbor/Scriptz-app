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
import { SegmentedTabs } from './ui/SegmentedTabs'
import { PrimaryPill } from './ui/PrimaryPill'

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
const IconUndo = (p) => (
  <Svg
    {...p}
    path={
      <>
        <path d="M3 7v6h6" />
        <path d="M3.51 13A9 9 0 1 0 6 5.3L3 7.5" />
      </>
    }
  />
)
const IconRedo = (p) => (
  <Svg
    {...p}
    path={
      <>
        <path d="M21 7v6h-6" />
        <path d="M20.49 13A9 9 0 1 1 18 5.3L21 7.5" />
      </>
    }
  />
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
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${value} ${value === 1 ? 'variant' : 'variants'} per run`}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '10px 14px',
          gap: 10,
          borderRadius: 12,
          border: `1px solid ${open ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
          background: open ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.05)',
          color: 'rgba(255,255,255,0.9)',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          transition: 'background 0.18s ease, border-color 0.18s ease',
        }}
      >
        <span style={{ display: 'inline-flex', opacity: 0.75 }}>
          <IconLayers size={16} />
        </span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          {value} {value === 1 ? 'variant' : 'variants'}
        </span>
        <span
          style={{
            opacity: 0.6,
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none',
            display: 'inline-flex',
          }}
        >
          <IconChevron size={14} />
        </span>
      </button>
      {open && !disabled && (
        <div
          role="listbox"
          style={{
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
          }}
        >
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
              style={{
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
                color: n === value ? '#ffffff' : 'rgba(255,255,255,0.6)',
                background: n === value ? 'rgba(255,255,255,0.14)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
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
  const [editPrompt, setEditPrompt] = useState('')
  const [batch] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

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
  const maskCanvasRef = useRef(null) // full natural resolution mask canvas
  const stageRef = useRef(null) // the wrapper whose rect we measure
  const baseSnapshotRef = useRef(null) // ImageData before the in-progress stroke
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
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
        if (!canvas) return
        canvas.width = img.naturalWidth || img.width || 1536
        canvas.height = img.naturalHeight || img.height || 864
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
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

  const snapshotCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  }, [])

  const restoreSnapshot = useCallback((data) => {
    const canvas = maskCanvasRef.current
    if (!canvas || !data) return
    canvas.getContext('2d').putImageData(data, 0, 0)
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

  const pushUndoSnapshot = useCallback((snap) => {
    if (!snap) return
    undoStackRef.current.push(snap)
    if (undoStackRef.current.length > UNDO_CAP) {
      undoStackRef.current.shift()
    }
    redoStackRef.current = []
    setUndoDepth(undoStackRef.current.length)
    setRedoDepth(0)
  }, [])

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
    }
    // rect waits for move
  }

  const onPointerMove = (e) => {
    if (!drawingRef.current) return
    const pos = getCanvasCoords(e)
    if (!pos) return
    const { tool: t, size, color: rgba, startX, startY, lastX, lastY } = drawingRef.current
    const canvas = maskCanvasRef.current
    const ctx = canvas.getContext('2d')
    if (t === 'rect') {
      restoreSnapshot(baseSnapshotRef.current)
      paintRectPreview(ctx, startX, startY, pos.x, pos.y, rgba)
    } else {
      paintBrushSegment(ctx, { x: lastX, y: lastY }, pos, size, rgba, t === 'eraser')
      drawingRef.current.lastX = pos.x
      drawingRef.current.lastY = pos.y
    }
  }

  const onPointerUp = () => {
    if (!drawingRef.current) return
    const snap = baseSnapshotRef.current
    drawingRef.current = null
    baseSnapshotRef.current = null
    if (snap) pushUndoSnapshot(snap)
    setHasDrawn(true)
  }

  /* ── History actions ──────────────────────────────────────────── */
  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return
    const current = snapshotCanvas()
    const prev = undoStackRef.current.pop()
    if (current) {
      redoStackRef.current.push(current)
      if (redoStackRef.current.length > UNDO_CAP) redoStackRef.current.shift()
    }
    restoreSnapshot(prev)
    setUndoDepth(undoStackRef.current.length)
    setRedoDepth(redoStackRef.current.length)
    setHasDrawn(undoStackRef.current.length > 0)
  }, [snapshotCanvas, restoreSnapshot])

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return
    const current = snapshotCanvas()
    const next = redoStackRef.current.pop()
    if (current) {
      undoStackRef.current.push(current)
      if (undoStackRef.current.length > UNDO_CAP) undoStackRef.current.shift()
    }
    restoreSnapshot(next)
    setUndoDepth(undoStackRef.current.length)
    setRedoDepth(redoStackRef.current.length)
    setHasDrawn(true)
  }, [snapshotCanvas, restoreSnapshot])

  const handleClear = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const snap = snapshotCanvas()
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (snap) pushUndoSnapshot(snap)
    setHasDrawn(false)
  }, [snapshotCanvas, pushUndoSnapshot])

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
      return out.toDataURL('image/png').split(',')[1]
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
    return out.toDataURL('image/png').split(',')[1]
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

  async function handleSubmit() {
    if (busy) return
    if (!imageUrl) return setError('No thumbnail to edit.')
    if (!editPrompt.trim()) return setError('Describe the change you want.')

    setError(null)
    setBusy(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in required.')

      const maskB64 = await exportMaskBase64()
      const oneCall = () => callEditOnce(token, maskB64)

      const settled = await Promise.allSettled(Array.from({ length: batch }, () => oneCall()))
      const urls = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value)
      if (urls.length === 0) {
        const firstErr = settled.find((r) => r.status === 'rejected')
        throw new Error(firstErr?.reason?.message || 'No image returned.')
      }
      invalidateCredits(queryClient)
      onApply?.(urls.length === 1 ? urls[0] : urls)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Edit failed. Try a different prompt.')
      setBusy(false)
    }
  }

  const canSubmit = !busy && !!imageUrl && !!editPrompt.trim()

  const placeholder =
    'Describe the change — paint a region for targeted edits, or leave blank to edit the whole thumbnail.'

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

        {/* Thumbnail + canvas — 16:9 card, no dead space. */}
        <div
          ref={stageRef}
          style={{
            position: 'relative',
            alignSelf: 'center',
            width: '100%',
            maxWidth: 640,
            aspectRatio: '16 / 9',
            borderRadius: 14,
            overflow: 'hidden',
            background: 'rgba(12, 10, 18, 0.55)',
            border: '0.5px solid rgba(255,255,255,0.1)',
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

          {busy && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 10,
                background: 'rgba(8, 6, 14, 0.72)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.16)',
                  borderTopColor: 'rgba(255,255,255,0.9)',
                  animation: 'etd-spin 0.9s linear infinite',
                }}
                aria-hidden
              />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)' }}>
                {`AI is editing${batch > 1 ? ` ${batch} variants` : ''}…`}
              </span>
            </div>
          )}
        </div>

        {/* Toolbar — visible in both tabs. Centered under the thumbnail,
         * constrained to the same max-width so it shares the column. */}
        <div
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 640,
            display: 'flex',
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

        {/* Input area */}
        <div
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 560,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            padding: '0.55rem 0.55rem 0.55rem 0.75rem',
            borderRadius: 14,
            background:
              'linear-gradient(180deg, rgba(124,58,237,0.06) 0%, rgba(14,14,18,0.55) 70%)',
            backdropFilter: 'blur(48px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(48px) saturate(1.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 -4px 24px rgba(0, 0, 0, 0.2)',
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
