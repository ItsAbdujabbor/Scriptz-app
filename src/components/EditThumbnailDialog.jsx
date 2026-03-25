import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import './EditThumbnailDialog.css'

function extractBase64FromDataUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null
  const i = dataUrl.indexOf(';base64,')
  return i >= 0 ? dataUrl.slice(i + 8) : null
}


export function EditThumbnailDialog({
  imageUrl,
  onClose,
  onApply,
}) {
  const [editPrompt, setEditPrompt] = useState('')
  const [tool, setTool] = useState('brush') // 'brush' | 'eraser' | 'rect'
  const [brushSize, setBrushSize] = useState(24)
  const rectStartRef = useRef(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState(null)
  const containerRef = useRef(null)
  const drawCanvasRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef(null)

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
          ctx.fillStyle = '#000000'
          ctx.fillRect(0, 0, w, h)
        } else if (c === draw) {
          ctx.clearRect(0, 0, w, h)
        }
      }
    })
    return { w, h, rect, dpr }
  }, [])


  useEffect(() => {
    resizeCanvases()
    const ro = new ResizeObserver(() => resizeCanvases())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [resizeCanvases])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [onClose])


  const getPos = (e) => {
    const rect = drawCanvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const dpr = window.devicePixelRatio || 1
    const x = (e.clientX - rect.left) * dpr
    const y = (e.clientY - rect.top) * dpr
    return { x, y }
  }

  const drawStroke = (from, to) => {
    const draw = drawCanvasRef.current
    const mask = maskCanvasRef.current
    if (!draw || !mask) return
    const dc = draw.getContext('2d')
    const mc = mask.getContext('2d')
    const size = brushSize * (window.devicePixelRatio || 1)
    if (tool === 'brush') {
      dc.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      dc.fillStyle = 'rgba(255, 255, 255, 0.5)'
      mc.strokeStyle = '#fff'
      mc.fillStyle = '#fff'
    } else if (tool === 'eraser') {
      dc.globalCompositeOperation = 'destination-out'
      dc.strokeStyle = 'rgba(255,255,255,0.8)'
      dc.fillStyle = 'rgba(255,255,255,0.8)'
      mc.strokeStyle = '#000'
      mc.fillStyle = '#000'
    }
    dc.lineWidth = size
    dc.lineCap = 'round'
    if (tool !== 'eraser') dc.globalCompositeOperation = 'source-over'
    mc.lineWidth = size
    mc.lineCap = 'round'
    if (from) {
      dc.beginPath()
      dc.moveTo(from.x, from.y)
      dc.lineTo(to.x, to.y)
      dc.stroke()
      mc.beginPath()
      mc.moveTo(from.x, from.y)
      mc.lineTo(to.x, to.y)
      mc.stroke()
    } else {
      dc.beginPath()
      dc.arc(to.x, to.y, size / 2, 0, Math.PI * 2)
      dc.fill()
      mc.beginPath()
      mc.arc(to.x, to.y, size / 2, 0, Math.PI * 2)
      mc.fill()
    }
    dc.globalCompositeOperation = 'source-over'
  }

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
    dc.fillStyle = 'rgba(255, 255, 255, 0.5)'
    dc.fillRect(x, y, w, h)
    mc.fillStyle = '#fff'
    mc.fillRect(x, y, w, h)
  }

  const drawRectPreview = (start, end) => {
    const draw = drawCanvasRef.current
    const mask = maskCanvasRef.current
    if (!draw || !mask) return
    const dc = draw.getContext('2d')
    dc.clearRect(0, 0, draw.width, draw.height)
    dc.drawImage(mask, 0, 0)
    dc.globalCompositeOperation = 'source-in'
    dc.fillStyle = 'rgba(255,255,255,0.5)'
    dc.fillRect(0, 0, draw.width, draw.height)
    dc.globalCompositeOperation = 'source-over'
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const w = Math.max(2, Math.abs(end.x - start.x))
    const h = Math.max(2, Math.abs(end.y - start.y))
    dc.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    dc.lineWidth = 2
    dc.strokeRect(x, y, w, h)
    dc.fillStyle = 'rgba(255, 255, 255, 0.3)'
    dc.fillRect(x, y, w, h)
  }

  const handlePointerDown = (e) => {
    e.preventDefault()
    const pos = getPos(e)
    if (!pos) return
    if (tool === 'rect') {
      rectStartRef.current = pos
    } else {
      isDrawingRef.current = true
      lastPosRef.current = pos
      drawStroke(null, pos)
    }
  }

  const handlePointerMove = (e) => {
    const pos = getPos(e)
    if (tool === 'rect' && rectStartRef.current && pos) {
      lastPosRef.current = pos
      drawRectPreview(rectStartRef.current, pos)
    } else if (isDrawingRef.current && pos) {
      drawStroke(lastPosRef.current, pos)
      lastPosRef.current = pos
    }
  }

  const handlePointerUp = (e) => {
    if (tool === 'rect' && rectStartRef.current) {
      const start = rectStartRef.current
      const end = lastPosRef.current || getPos(e) || start
      fillRectSelection(start, end)
      rectStartRef.current = null
      lastPosRef.current = null
    } else {
      isDrawingRef.current = false
      lastPosRef.current = null
    }
  }

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
  }, [tool, brushSize])

  const handleClear = () => {
    const draw = drawCanvasRef.current
    const mask = maskCanvasRef.current
    if (!draw || !mask) return
    const rect = draw.getBoundingClientRect()
    draw.getContext('2d').clearRect(0, 0, draw.width, draw.height)
    const mc = mask.getContext('2d')
    mc.fillStyle = '#000'
    mc.fillRect(0, 0, mask.width, mask.height)
  }

  const hasSelection = () => {
    const mask = maskCanvasRef.current
    if (!mask) return false
    const ctx = mask.getContext('2d')
    const data = ctx.getImageData(0, 0, mask.width, mask.height)
    for (let i = 0; i < data.data.length; i += 4) {
      if (data.data[i] > 0 || data.data[i + 1] > 0 || data.data[i + 2] > 0) return true
    }
    return false
  }

  const handleApply = async () => {
    const prompt = editPrompt.trim()
    if (!prompt) {
      setError('Describe what to change in the selected area.')
      return
    }
    if (!hasSelection()) {
      setError('Draw or highlight the area to edit first.')
      return
    }
    setError(null)
    setApplying(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in to use AI edit')
      const mask = maskCanvasRef.current
      if (!mask) throw new Error('No mask')
      const maskDataUrl = mask.toDataURL('image/png')
      const maskBase64 = extractBase64FromDataUrl(maskDataUrl)
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
      setError(err?.message || 'Edit failed')
    } finally {
      setApplying(false)
    }
  }

  const dialogContent = (
    <div className="edit-thumb-dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="edit-thumb-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-thumb-title">
        <header className="edit-thumb-dialog-header">
          <h2 id="edit-thumb-title" className="edit-thumb-dialog-title">AI Edit – Select Region</h2>
          <button type="button" className="edit-thumb-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="edit-thumb-dialog-hint">
          Select the area: use <strong>rectangle</strong> to select regions or <strong>brush</strong> to draw freehand. Describe what to change and AI will edit only that part.
        </p>
        <div className="edit-thumb-dialog-body">
          <div className="edit-thumb-canvas-wrap" ref={containerRef}>
            <img src={imageUrl} alt="Thumbnail" className="edit-thumb-img" crossOrigin="anonymous" />
            <canvas
              ref={drawCanvasRef}
              className="edit-thumb-canvas edit-thumb-canvas-draw"
              aria-hidden
              style={{ cursor: ['brush', 'eraser', 'rect'].includes(tool) ? 'crosshair' : 'default' }}
            />
            <canvas ref={maskCanvasRef} className="edit-thumb-canvas edit-thumb-canvas-mask" aria-hidden />
          </div>
          <div className="edit-thumb-toolbar">
            <div className="edit-thumb-tools">
              <button
                type="button"
                className={`edit-thumb-tool-btn ${tool === 'rect' ? 'active' : ''}`}
                onClick={() => setTool('rect')}
                title="Rectangular selection"
              >
                ▭ Rectangle
              </button>
              <button
                type="button"
                className={`edit-thumb-tool-btn ${tool === 'brush' ? 'active' : ''}`}
                onClick={() => setTool('brush')}
                title="Draw selection freehand"
              >
                ✎ Brush
              </button>
              <button
                type="button"
                className={`edit-thumb-tool-btn ${tool === 'eraser' ? 'active' : ''}`}
                onClick={() => setTool('eraser')}
                title="Erase from selection"
              >
                ◻ Eraser
              </button>
              <button type="button" className="edit-thumb-tool-btn" onClick={handleClear} title="Clear selection">
                Clear
              </button>
            </div>
            {tool !== 'rect' && (
              <div className="edit-thumb-brush-size">
                <label>Size:</label>
                <input
                  type="range"
                  min="8"
                  max="64"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
                <span>{brushSize}px</span>
              </div>
            )}
          </div>
          <div className="edit-thumb-prompt-wrap">
            <label htmlFor="edit-thumb-prompt">What to change in the selected area</label>
            <textarea
              id="edit-thumb-prompt"
              className="edit-thumb-prompt"
              placeholder="e.g. Brighten this area, Add a smile here, Change to red, Remove background..."
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={2}
            />
          </div>
          {error && <div className="edit-thumb-error">{error}</div>}
        </div>
        <footer className="edit-thumb-dialog-footer">
          <button type="button" className="edit-thumb-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="edit-thumb-apply"
            onClick={handleApply}
            disabled={applying || !editPrompt.trim()}
          >
            {applying ? (
              <>
                <span className="edit-thumb-spinner" aria-hidden />
                Applying…
              </>
            ) : (
              'Apply AI Edit'
            )}
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(dialogContent, document.body)
}
