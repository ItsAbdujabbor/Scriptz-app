import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import './EditThumbnailDialog.css'

/* ---- Inline SVG icons ---- */
const IconRect = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" strokeDasharray="3 2" />
  </svg>
)
const IconBrush = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 14.5c.8-1.2 2.2-1.8 3.5-1.3 1.3.5 2.8.1 3.8-.9L16 6.5a2 2 0 0 0-2.5-2.5l-5.7 5.7c-1 1-1.4 2.5-.9 3.8.5 1.3-.1 2.7-1.3 3.5" />
    <circle cx="3.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)
const IconEraser = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m14 6-7.5 7.5" />
    <path d="M4 16h12" />
    <path d="M4.5 13.5 10 8l4.5 4.5-3.5 3.5H7.5L4.5 13.5Z" />
  </svg>
)
const IconClear = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h14M8 6V4h4v2M16 6l-1 10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L4 6" />
  </svg>
)
const IconClose = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 5l10 10M15 5 5 15" />
  </svg>
)
const IconSparkle = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.2 4.2l2.1 2.1M13.7 13.7l2.1 2.1M4.2 15.8l2.1-2.1M13.7 6.3l2.1-2.1" />
    <circle cx="10" cy="10" r="3" strokeWidth="1.6" />
  </svg>
)

function extractBase64FromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const i = dataUrl.indexOf(';base64,')
  return i >= 0 ? dataUrl.slice(i + 8) : null
}

const TOOLS = [
  { id: 'rect', label: 'Rectangle', shortcut: 'R', Icon: IconRect },
  { id: 'brush', label: 'Brush', shortcut: 'B', Icon: IconBrush },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', Icon: IconEraser },
]

export function EditThumbnailDialog({ imageUrl, onClose, onApply }) {
  const [editPrompt, setEditPrompt] = useState('')
  const [tool, setTool] = useState('rect')
  const [brushSize, setBrushSize] = useState(28)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState(null)
  const [hasAnyStroke, setHasAnyStroke] = useState(false)
  const [rectPreviewActive, setRectPreviewActive] = useState(false)

  const containerRef = useRef(null)
  const drawCanvasRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef(null)
  const rectStartRef = useRef(null)
  const dashOffsetRef = useRef(0)
  const animFrameRef = useRef(null)

  /* ---- Canvas sizing ---- */
  const resizeCanvases = useCallback(() => {
    const draw = drawCanvasRef.current
    const mask = maskCanvasRef.current
    if (!draw || !mask || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    ;[draw, mask].forEach((c) => {
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (c === mask) {
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, w, h)
        } else {
          ctx.clearRect(0, 0, w, h)
        }
      }
    })
  }, [])

  useEffect(() => {
    resizeCanvases()
    const ro = new ResizeObserver(() => resizeCanvases())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [resizeCanvases])

  /* ---- ESC + body lock ---- */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (e.key === 'b' || e.key === 'B') setTool('brush')
      if (e.key === 'e' || e.key === 'E') setTool('eraser')
      if (e.key === 'r' || e.key === 'R') setTool('rect')
    }
    window.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [onClose])

  /* ---- Coord helper ---- */
  const getPos = (e) => {
    const rect = drawCanvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const dpr = window.devicePixelRatio || 1
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    return { x: (clientX - rect.left) * dpr, y: (clientY - rect.top) * dpr }
  }

  /* ---- Drawing ---- */
  const drawStroke = useCallback(
    (from, to) => {
      const draw = drawCanvasRef.current
      const mask = maskCanvasRef.current
      if (!draw || !mask) return
      const dc = draw.getContext('2d')
      const mc = mask.getContext('2d')
      const size = brushSize * (window.devicePixelRatio || 1)

      if (tool === 'eraser') {
        dc.globalCompositeOperation = 'destination-out'
        dc.strokeStyle = 'rgba(255,255,255,1)'
        dc.fillStyle = 'rgba(255,255,255,1)'
        mc.strokeStyle = '#000'
        mc.fillStyle = '#000'
      } else {
        dc.globalCompositeOperation = 'source-over'
        dc.strokeStyle = 'rgba(139, 92, 246, 0.55)'
        dc.fillStyle = 'rgba(139, 92, 246, 0.55)'
        mc.strokeStyle = '#fff'
        mc.fillStyle = '#fff'
      }

      ;[
        [dc, size],
        [mc, size],
      ].forEach(([ctx, s]) => {
        ctx.lineWidth = s
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (from) {
          ctx.beginPath()
          ctx.moveTo(from.x, from.y)
          ctx.lineTo(to.x, to.y)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(to.x, to.y, s / 2, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      dc.globalCompositeOperation = 'source-over'
      setHasAnyStroke(true)
    },
    [tool, brushSize]
  )

  /* ---- Rect selection ---- */
  const fillRectSelection = (start, end) => {
    const draw = drawCanvasRef.current
    const mask = maskCanvasRef.current
    if (!draw || !mask) return
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const w = Math.max(4, Math.abs(end.x - start.x))
    const h = Math.max(4, Math.abs(end.y - start.y))
    const dc = draw.getContext('2d')
    const mc = mask.getContext('2d')
    // Add to existing mask
    dc.globalCompositeOperation = 'source-over'
    dc.fillStyle = 'rgba(139, 92, 246, 0.4)'
    dc.fillRect(x, y, w, h)
    mc.fillStyle = '#fff'
    mc.fillRect(x, y, w, h)
    setHasAnyStroke(true)
  }

  /* ---- Animated dashed rect preview ---- */
  const drawRectPreview = useCallback((start, current) => {
    const draw = drawCanvasRef.current
    if (!draw) return
    const dc = draw.getContext('2d')
    dc.clearRect(0, 0, draw.width, draw.height)

    // Redraw committed mask as purple tint
    const mask = maskCanvasRef.current
    if (mask) {
      dc.globalCompositeOperation = 'source-over'
      dc.save()
      dc.drawImage(mask, 0, 0)
      dc.globalCompositeOperation = 'source-in'
      dc.fillStyle = 'rgba(139, 92, 246, 0.4)'
      dc.fillRect(0, 0, draw.width, draw.height)
      dc.restore()
      dc.globalCompositeOperation = 'source-over'
    }

    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const w = Math.max(2, Math.abs(current.x - start.x))
    const h = Math.max(2, Math.abs(current.y - start.y))

    // Filled area
    dc.fillStyle = 'rgba(139, 92, 246, 0.25)'
    dc.fillRect(x, y, w, h)

    // Animated dashed border
    dc.strokeStyle = 'rgba(167, 139, 250, 0.95)'
    dc.lineWidth = 1.5 * (window.devicePixelRatio || 1)
    dc.setLineDash([6 * (window.devicePixelRatio || 1), 3 * (window.devicePixelRatio || 1)])
    dc.lineDashOffset = -dashOffsetRef.current
    dc.strokeRect(x, y, w, h)
    dc.setLineDash([])
  }, [])

  /* ---- Animate dash offset ---- */
  useEffect(() => {
    if (!rectPreviewActive) return
    const tick = () => {
      dashOffsetRef.current = (dashOffsetRef.current + 0.5) % 20
      if (rectStartRef.current && lastPosRef.current) {
        drawRectPreview(rectStartRef.current, lastPosRef.current)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [rectPreviewActive, drawRectPreview])

  /* ---- Pointer events ---- */
  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault()
      const pos = getPos(e)
      if (!pos) return
      if (tool === 'rect') {
        rectStartRef.current = pos
        lastPosRef.current = pos
        setRectPreviewActive(true)
      } else {
        isDrawingRef.current = true
        lastPosRef.current = pos
        drawStroke(null, pos)
      }
    },
    [tool, drawStroke]
  )

  const handlePointerMove = useCallback(
    (e) => {
      const pos = getPos(e)
      if (!pos) return
      if (tool === 'rect' && rectStartRef.current) {
        lastPosRef.current = pos
        // animation loop handles redraw
      } else if (isDrawingRef.current) {
        drawStroke(lastPosRef.current, pos)
        lastPosRef.current = pos
      }
    },
    [tool, drawStroke]
  )

  const handlePointerUp = useCallback(
    (e) => {
      if (tool === 'rect' && rectStartRef.current) {
        const end = lastPosRef.current || getPos(e) || rectStartRef.current
        fillRectSelection(rectStartRef.current, end)
        rectStartRef.current = null
        lastPosRef.current = null
        setRectPreviewActive(false)
        // Redraw draw canvas to show committed mask
        const draw = drawCanvasRef.current
        const mask = maskCanvasRef.current
        if (draw && mask) {
          const dc = draw.getContext('2d')
          dc.clearRect(0, 0, draw.width, draw.height)
          dc.save()
          dc.drawImage(mask, 0, 0)
          dc.globalCompositeOperation = 'source-in'
          dc.fillStyle = 'rgba(139, 92, 246, 0.4)'
          dc.fillRect(0, 0, draw.width, draw.height)
          dc.restore()
          dc.globalCompositeOperation = 'source-over'
        }
      } else {
        isDrawingRef.current = false
        lastPosRef.current = null
      }
    },
    [tool]
  )

  useEffect(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false })
    canvas.addEventListener('pointermove', handlePointerMove, { passive: true })
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerUp)
    }
  }, [handlePointerDown, handlePointerMove, handlePointerUp])

  /* ---- Clear ---- */
  const handleClear = () => {
    const draw = drawCanvasRef.current
    const mask = maskCanvasRef.current
    if (!draw || !mask) return
    draw.getContext('2d').clearRect(0, 0, draw.width, draw.height)
    const mc = mask.getContext('2d')
    mc.fillStyle = '#000'
    mc.fillRect(0, 0, mask.width, mask.height)
    setHasAnyStroke(false)
    rectStartRef.current = null
    setRectPreviewActive(false)
  }

  /* ---- Check if mask has any white pixels ---- */
  const hasSelection = () => {
    const mask = maskCanvasRef.current
    if (!mask) return false
    const ctx = mask.getContext('2d')
    const data = ctx.getImageData(0, 0, mask.width, mask.height)
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i] > 10) return true
    }
    return false
  }

  /* ---- Apply ---- */
  const handleApply = async () => {
    const prompt = editPrompt.trim()
    if (!prompt) {
      setError('Describe what to change in the selected area.')
      return
    }
    if (!hasSelection()) {
      setError('Select the area to edit first — draw or drag a rectangle.')
      return
    }
    setError(null)
    setApplying(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in to use AI edit')
      const mask = maskCanvasRef.current
      if (!mask) throw new Error('No mask canvas')
      const maskBase64 = extractBase64FromDataUrl(mask.toDataURL('image/png'))
      const imageBase64 = extractBase64FromDataUrl(imageUrl)
      if (!maskBase64) throw new Error('Could not export mask')
      const payload = {
        thumbnail_image_base64: imageBase64 || undefined,
        thumbnail_image_url: !imageBase64 ? imageUrl : undefined,
        mask_base64: maskBase64,
        edit_prompt: prompt,
      }
      const res = await thumbnailsApi.editRegion(token, payload)
      const newUrl = res?.image_url
      if (newUrl) {
        onApply?.(newUrl)
        onClose?.()
      } else throw new Error('No image in response')
    } catch (err) {
      setError(err?.message || 'Edit failed. Please try again.')
    } finally {
      setApplying(false)
    }
  }

  const canApply = !!editPrompt.trim() && hasAnyStroke

  const dialogContent = (
    <div className="etd-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className="etd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="etd-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="etd-header">
          <div className="etd-header-left">
            <span className="etd-header-icon" aria-hidden>
              <IconSparkle />
            </span>
            <div>
              <h2 id="etd-title" className="etd-title">
                AI Region Edit
              </h2>
              <p className="etd-subtitle">Select an area, then describe the change</p>
            </div>
          </div>
          <button type="button" className="etd-close" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </header>

        {/* Body: two-column */}
        <div className="etd-body">
          {/* Left: canvas */}
          <div className="etd-canvas-col">
            <div className="etd-canvas-wrap" ref={containerRef}>
              <img
                src={imageUrl}
                alt="Thumbnail"
                className="etd-img"
                crossOrigin="anonymous"
                draggable={false}
              />
              <canvas
                ref={drawCanvasRef}
                className="etd-canvas etd-canvas-draw"
                aria-hidden
                style={{ cursor: 'crosshair' }}
              />
              <canvas ref={maskCanvasRef} className="etd-canvas etd-canvas-mask" aria-hidden />
              {/* Hint overlay when nothing drawn yet */}
              {!hasAnyStroke && !rectPreviewActive && (
                <div className="etd-canvas-hint" aria-hidden>
                  <span className="etd-canvas-hint-text">
                    {tool === 'rect' ? 'Drag to select a region' : 'Paint the area to edit'}
                  </span>
                </div>
              )}
              {/* Applying overlay */}
              {applying && (
                <div className="etd-applying-overlay" aria-hidden>
                  <div className="etd-applying-inner">
                    <span className="etd-applying-orb" />
                    <span className="etd-applying-text">AI is editing…</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: controls */}
          <div className="etd-controls-col">
            {/* Tool picker */}
            <div className="etd-section">
              <p className="etd-section-label">Tool</p>
              <div className="etd-tools">
                {TOOLS.map((toolDef) => {
                  const ToolIcon = toolDef.Icon
                  return (
                    <button
                      key={toolDef.id}
                      type="button"
                      className={`etd-tool-btn${tool === toolDef.id ? ' active' : ''}`}
                      onClick={() => setTool(toolDef.id)}
                      title={`${toolDef.label} (${toolDef.shortcut})`}
                    >
                      <span className="etd-tool-icon" aria-hidden>
                        <ToolIcon />
                      </span>
                      <span className="etd-tool-label">{toolDef.label}</span>
                      <kbd className="etd-tool-kbd">{toolDef.shortcut}</kbd>
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="etd-tool-btn etd-tool-btn--clear"
                  onClick={handleClear}
                  title="Clear selection"
                  disabled={!hasAnyStroke}
                >
                  <span className="etd-tool-icon" aria-hidden>
                    <IconClear />
                  </span>
                  <span className="etd-tool-label">Clear</span>
                </button>
              </div>
            </div>

            {/* Brush size (hidden for rect) */}
            {tool !== 'rect' && (
              <div className="etd-section">
                <p className="etd-section-label">Brush size — {brushSize}px</p>
                <div className="etd-brush-row">
                  <div
                    className="etd-brush-preview"
                    style={{
                      width: Math.max(8, Math.min(32, brushSize)),
                      height: Math.max(8, Math.min(32, brushSize)),
                    }}
                    aria-hidden
                  />
                  <input
                    type="range"
                    className="etd-brush-slider"
                    min="8"
                    max="80"
                    step="2"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            {/* Prompt */}
            <div className="etd-section etd-section--prompt">
              <label htmlFor="etd-prompt" className="etd-section-label">
                What to change
              </label>
              <textarea
                id="etd-prompt"
                className="etd-prompt"
                placeholder="e.g. Brighten this region, Change text color to red, Replace background with mountain view, Add a glowing border…"
                value={editPrompt}
                onChange={(e) => {
                  setEditPrompt(e.target.value)
                  setError(null)
                }}
                rows={4}
                maxLength={400}
              />
              <p className="etd-prompt-count">{editPrompt.length} / 400</p>
            </div>

            {/* Error */}
            {error && (
              <div className="etd-error" role="alert">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M8 5v3.5M8 11h.01" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="etd-actions">
              <button type="button" className="etd-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="etd-apply"
                onClick={handleApply}
                disabled={applying || !canApply}
              >
                {applying ? (
                  <>
                    <span className="etd-spinner" aria-hidden />
                    <span>Applying…</span>
                  </>
                ) : (
                  <>
                    <span className="etd-apply-icon" aria-hidden>
                      <IconSparkle />
                    </span>
                    <span>Apply AI Edit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(dialogContent, document.body)
}
