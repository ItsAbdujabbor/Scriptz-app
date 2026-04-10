import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Canvas as FabricCanvas, FabricImage } from 'fabric'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { thumbnailsApi } from '../api/thumbnails'
import './EditThumbnailDialog.css'

/* ---- SVG icons ---- */
const IcoSparkle = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.2 4.2l2.1 2.1M13.7 13.7l2.1 2.1M4.2 15.8l2.1-2.1M13.7 6.3l2.1-2.1" />
    <circle cx="10" cy="10" r="3" />
  </svg>
)
const IcoRect = () => (
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
const IcoBrush = () => (
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
const IcoEraser = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m14 6-7.5 7.5M4 16h12" />
    <path d="M4.5 13.5 10 8l4.5 4.5-3.5 3.5H7.5L4.5 13.5Z" />
  </svg>
)
const IcoMove = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 2v16M2 10h16M6 6l-4 4 4 4M14 6l4 4-4 4" />
  </svg>
)
const IcoUpload = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
    <path d="M10 3v10M6 7l4-4 4 4" />
  </svg>
)
const IcoClear = () => (
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
const IcoUndo = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 8H13a4 4 0 0 1 0 8H7" />
    <path d="M4 8l3-3M4 8l3 3" />
  </svg>
)
const IcoClose = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M5 5l10 10M15 5 5 15" />
  </svg>
)
const IcoWarn = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
  >
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 5v3.5M8 11h.01" />
  </svg>
)

/* ---- Helpers ---- */
function extractBase64(dataUrl) {
  if (!dataUrl?.startsWith('data:')) return null
  const i = dataUrl.indexOf(';base64,')
  return i >= 0 ? dataUrl.slice(i + 8) : null
}

const TOOLS = [
  { id: 'rect', label: 'Rectangle', shortcut: 'R', Ico: IcoRect },
  { id: 'brush', label: 'Brush', shortcut: 'B', Ico: IcoBrush },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', Ico: IcoEraser },
  { id: 'image', label: 'Move images', shortcut: 'I', Ico: IcoMove },
]

/* ================================================================
   Component
   ================================================================ */
export function EditThumbnailDialog({ imageUrl, onClose, onApply }) {
  const [tool, setTool] = useState('rect')
  const [brushSize, setBrushSize] = useState(28)
  const [editPrompt, setEditPrompt] = useState('')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState(null)
  const [hasStroke, setHasStroke] = useState(false)
  const [rectPreviewActive, setRectPreviewActive] = useState(false)
  const [placedImages, setPlacedImages] = useState([])
  const [undoCount, setUndoCount] = useState(0)

  const containerRef = useRef(null)
  const fabricElRef = useRef(null)
  const fabricRef = useRef(null)
  const bgImgRef = useRef(null)
  const drawElRef = useRef(null)
  const maskElRef = useRef(null)
  const fileInputRef = useRef(null)
  const placedFabRef = useRef([])

  const isDrawingRef = useRef(false)
  const lastPosRef = useRef(null)
  const rectStartRef = useRef(null)
  const dashOffRef = useRef(0)
  const animFrameRef = useRef(null)
  const undoStackRef = useRef([])

  /* ---- canvas sizing ---- */
  const resizeCanvases = useCallback(() => {
    const container = containerRef.current
    const drawEl = drawElRef.current
    const maskEl = maskElRef.current
    const fc = fabricRef.current
    if (!container || !drawEl || !maskEl) return

    const { width, height } = container.getBoundingClientRect()
    if (!width || !height) return
    const dpr = window.devicePixelRatio || 1

    // Draw canvas — DPR aware
    const wp = Math.round(width * dpr)
    const hp = Math.round(height * dpr)
    if (drawEl.width !== wp || drawEl.height !== hp) {
      drawEl.width = wp
      drawEl.height = hp
      drawEl.style.width = `${width}px`
      drawEl.style.height = `${height}px`
    }

    // Mask canvas — same logical size (no DPR needed for mask export)
    if (maskEl.width !== wp || maskEl.height !== hp) {
      maskEl.width = wp
      maskEl.height = hp
      const mc = maskEl.getContext('2d')
      mc.fillStyle = '#000'
      mc.fillRect(0, 0, wp, hp)
    }

    // Fabric canvas
    if (fc) {
      fc.setDimensions({ width, height })
      const img = bgImgRef.current
      if (img) {
        const scale = Math.min(width / img.width, height / img.height)
        img.set({
          scaleX: scale,
          scaleY: scale,
          left: (width - img.width * scale) / 2,
          top: (height - img.height * scale) / 2,
        })
        img.setCoords()
        fc.renderAll()
      }
    }
  }, [])

  /* ---- init fabric ---- */
  useEffect(() => {
    const el = fabricElRef.current
    if (!el) return

    const fc = new FabricCanvas(el, {
      selection: false,
      isDrawingMode: false,
      enableRetinaScaling: true,
    })
    fabricRef.current = fc

    FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })
      .then((img) => {
        img.set({ selectable: false, evented: false })
        fc.add(img)
        fc.sendObjectToBack(img)
        bgImgRef.current = img
        resizeCanvases()
      })
      .catch(() => {})

    return () => {
      fc.dispose()
      fabricRef.current = null
      bgImgRef.current = null
    }
  }, [imageUrl, resizeCanvases])

  /* ---- resize observer ---- */
  useEffect(() => {
    resizeCanvases()
    const ro = new ResizeObserver(() => resizeCanvases())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [resizeCanvases])

  /* ---- tool → fabric interactivity ---- */
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    const img = tool === 'image'
    fc.selection = img
    fc.getObjects().forEach((obj) => {
      if (obj !== bgImgRef.current) {
        obj.set({ selectable: img, evented: img })
      }
    })
    fc.renderAll()
  }, [tool])

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      const map = {
        b: 'brush',
        B: 'brush',
        e: 'eraser',
        E: 'eraser',
        r: 'rect',
        R: 'rect',
        i: 'image',
        I: 'image',
      }
      if (map[e.key]) setTool(map[e.key])
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') handleUndo()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- coord helper ---- */
  const getPos = useCallback((e) => {
    const rect = drawElRef.current?.getBoundingClientRect()
    if (!rect) return null
    const dpr = window.devicePixelRatio || 1
    const cx = e.touches?.[0]?.clientX ?? e.clientX
    const cy = e.touches?.[0]?.clientY ?? e.clientY
    return { x: (cx - rect.left) * dpr, y: (cy - rect.top) * dpr }
  }, [])

  /* ---- drawing ---- */
  const drawStroke = useCallback(
    (from, to) => {
      const drawEl = drawElRef.current
      const maskEl = maskElRef.current
      if (!drawEl || !maskEl) return
      const dc = drawEl.getContext('2d')
      const mc = maskEl.getContext('2d')
      const size = brushSize * (window.devicePixelRatio || 1)

      if (tool === 'eraser') {
        dc.globalCompositeOperation = 'destination-out'
        dc.strokeStyle = 'rgba(255,255,255,1)'
        dc.fillStyle = 'rgba(255,255,255,1)'
        mc.strokeStyle = '#000'
        mc.fillStyle = '#000'
      } else {
        dc.globalCompositeOperation = 'source-over'
        dc.strokeStyle = 'rgba(139,92,246,0.55)'
        dc.fillStyle = 'rgba(139,92,246,0.55)'
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
      setHasStroke(true)
    },
    [tool, brushSize]
  )

  /* ---- rect fill (commit) ---- */
  const commitRect = (start, end) => {
    const drawEl = drawElRef.current
    const maskEl = maskElRef.current
    if (!drawEl || !maskEl) return
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const w = Math.max(4, Math.abs(end.x - start.x))
    const h = Math.max(4, Math.abs(end.y - start.y))
    drawEl.getContext('2d').fillStyle = 'rgba(139,92,246,0.4)'
    drawEl.getContext('2d').fillRect(x, y, w, h)
    maskEl.getContext('2d').fillStyle = '#fff'
    maskEl.getContext('2d').fillRect(x, y, w, h)
    setHasStroke(true)
  }

  /* ---- animated rect preview ---- */
  const drawRectPreview = useCallback((start, cur) => {
    const drawEl = drawElRef.current
    const maskEl = maskElRef.current
    if (!drawEl) return
    const dc = drawEl.getContext('2d')
    dc.clearRect(0, 0, drawEl.width, drawEl.height)
    if (maskEl) {
      dc.save()
      dc.drawImage(maskEl, 0, 0)
      dc.globalCompositeOperation = 'source-in'
      dc.fillStyle = 'rgba(139,92,246,0.4)'
      dc.fillRect(0, 0, drawEl.width, drawEl.height)
      dc.restore()
      dc.globalCompositeOperation = 'source-over'
    }
    const x = Math.min(start.x, cur.x)
    const y = Math.min(start.y, cur.y)
    const w = Math.max(2, Math.abs(cur.x - start.x))
    const h = Math.max(2, Math.abs(cur.y - start.y))
    dc.fillStyle = 'rgba(139,92,246,0.18)'
    dc.fillRect(x, y, w, h)
    const dpr = window.devicePixelRatio || 1
    dc.strokeStyle = 'rgba(167,139,250,0.9)'
    dc.lineWidth = 1.5 * dpr
    dc.setLineDash([6 * dpr, 3 * dpr])
    dc.lineDashOffset = -dashOffRef.current
    dc.strokeRect(x, y, w, h)
    dc.setLineDash([])
  }, [])

  useEffect(() => {
    if (!rectPreviewActive) return
    const tick = () => {
      dashOffRef.current = (dashOffRef.current + 0.5) % 20
      if (rectStartRef.current && lastPosRef.current) {
        drawRectPreview(rectStartRef.current, lastPosRef.current)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [rectPreviewActive, drawRectPreview])

  /* ---- undo ---- */
  const saveUndoSnapshot = () => {
    const drawEl = drawElRef.current
    const maskEl = maskElRef.current
    if (!drawEl || !maskEl) return
    undoStackRef.current.push({ draw: drawEl.toDataURL(), mask: maskEl.toDataURL() })
    if (undoStackRef.current.length > 20) undoStackRef.current.shift()
    setUndoCount(undoStackRef.current.length)
  }

  const handleUndo = useCallback(() => {
    const snap = undoStackRef.current.pop()
    setUndoCount(undoStackRef.current.length)
    if (!snap) return
    const restore = (canvas, src) => {
      const img = new Image()
      img.onload = () => {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
      }
      img.src = src
    }
    restore(drawElRef.current, snap.draw)
    restore(maskElRef.current, snap.mask)
    setTimeout(() => {
      const maskEl = maskElRef.current
      if (!maskEl) return
      const d = maskEl.getContext('2d').getImageData(0, 0, maskEl.width, maskEl.height).data
      setHasStroke([...d].some((v, i) => i % 4 === 0 && v > 10))
    }, 60)
  }, [])

  /* ---- pointer events ---- */
  const handlePointerDown = useCallback(
    (e) => {
      if (tool === 'image') return
      e.preventDefault()
      saveUndoSnapshot()
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
    [tool, getPos, drawStroke]
  )  

  const handlePointerMove = useCallback(
    (e) => {
      if (tool === 'image') return
      const pos = getPos(e)
      if (!pos) return
      if (tool === 'rect' && rectStartRef.current) {
        lastPosRef.current = pos
      } else if (isDrawingRef.current) {
        drawStroke(lastPosRef.current, pos)
        lastPosRef.current = pos
      }
    },
    [tool, getPos, drawStroke]
  )

  const handlePointerUp = useCallback(
    (e) => {
      if (tool === 'image') return
      if (tool === 'rect' && rectStartRef.current) {
        const end = lastPosRef.current || getPos(e) || rectStartRef.current
        commitRect(rectStartRef.current, end)
        rectStartRef.current = null
        lastPosRef.current = null
        setRectPreviewActive(false)
        // Redraw draw canvas from committed mask
        const drawEl = drawElRef.current
        const maskEl = maskElRef.current
        if (drawEl && maskEl) {
          const dc = drawEl.getContext('2d')
          dc.clearRect(0, 0, drawEl.width, drawEl.height)
          dc.save()
          dc.drawImage(maskEl, 0, 0)
          dc.globalCompositeOperation = 'source-in'
          dc.fillStyle = 'rgba(139,92,246,0.4)'
          dc.fillRect(0, 0, drawEl.width, drawEl.height)
          dc.restore()
          dc.globalCompositeOperation = 'source-over'
        }
      } else {
        isDrawingRef.current = false
        lastPosRef.current = null
      }
    },
    [tool, getPos]
  )  

  useEffect(() => {
    const el = drawElRef.current
    if (!el) return
    el.addEventListener('pointerdown', handlePointerDown, { passive: false })
    el.addEventListener('pointermove', handlePointerMove, { passive: true })
    el.addEventListener('pointerup', handlePointerUp)
    el.addEventListener('pointerleave', handlePointerUp)
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('pointerup', handlePointerUp)
      el.removeEventListener('pointerleave', handlePointerUp)
    }
  }, [handlePointerDown, handlePointerMove, handlePointerUp])

  /* ---- clear ---- */
  const handleClear = () => {
    const drawEl = drawElRef.current
    const maskEl = maskElRef.current
    if (!drawEl || !maskEl) return
    saveUndoSnapshot()
    drawEl.getContext('2d').clearRect(0, 0, drawEl.width, drawEl.height)
    const mc = maskEl.getContext('2d')
    mc.fillStyle = '#000'
    mc.fillRect(0, 0, maskEl.width, maskEl.height)
    setHasStroke(false)
    rectStartRef.current = null
    setRectPreviewActive(false)
  }

  /* ---- image upload ---- */
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = (ev) => res(ev.target.result)
      r.onerror = rej
      r.readAsDataURL(file)
    })
    const fc = fabricRef.current
    if (!fc) return
    const img = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })
    const maxW = fc.width * 0.55
    const maxH = fc.height * 0.55
    const scale = Math.min(maxW / img.width, maxH / img.height, 1)
    img.set({
      left: (fc.width - img.width * scale) / 2,
      top: (fc.height - img.height * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      selectable: true,
      evented: true,
      borderColor: 'rgba(139,92,246,0.8)',
      cornerColor: '#8b5cf6',
      cornerStyle: 'circle',
      transparentCorners: false,
    })
    fc.add(img)
    fc.setActiveObject(img)
    fc.renderAll()
    const id = Date.now()
    placedFabRef.current.push({ id, obj: img })
    setPlacedImages((prev) => [...prev, { id, name: file.name, dataUrl }])
    setTool('image')
  }

  const removePlacedImage = (id) => {
    const fc = fabricRef.current
    if (!fc) return
    const idx = placedFabRef.current.findIndex((i) => i.id === id)
    if (idx >= 0) {
      fc.remove(placedFabRef.current[idx].obj)
      fc.renderAll()
      placedFabRef.current.splice(idx, 1)
    }
    setPlacedImages((prev) => prev.filter((i) => i.id !== id))
  }

  /* ---- check mask ---- */
  const hasMaskSelection = () => {
    const maskEl = maskElRef.current
    if (!maskEl) return false
    const d = maskEl.getContext('2d').getImageData(0, 0, maskEl.width, maskEl.height).data
    for (let i = 0; i < d.length; i += 4) if (d[i] > 10) return true
    return false
  }

  /* ---- apply ---- */
  const handleApply = async () => {
    const prompt = editPrompt.trim()
    if (!prompt) {
      setError('Describe what to change.')
      return
    }
    if (!hasMaskSelection()) {
      setError('Draw or drag a rectangle to select the area to edit.')
      return
    }
    setError(null)
    setApplying(true)
    try {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Sign in to use AI edit')
      const fc = fabricRef.current
      if (!fc) throw new Error('Canvas not ready')

      // Deselect objects for clean export
      fc.discardActiveObject()
      fc.renderAll()

      // Export composite (thumbnail + placed images)
      const compositeB64 = extractBase64(fc.toDataURL({ format: 'png', quality: 1 }))

      // Export mask
      const maskEl = maskElRef.current
      if (!maskEl) throw new Error('Mask not ready')
      const maskB64 = extractBase64(maskEl.toDataURL('image/png'))
      if (!maskB64) throw new Error('Could not export mask')

      const payload = {
        thumbnail_image_base64: compositeB64 || undefined,
        thumbnail_image_url: !compositeB64 ? imageUrl : undefined,
        mask_base64: maskB64,
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

  const canApply = !!editPrompt.trim() && hasStroke

  /* ================================================================
     Render
     ================================================================ */
  return createPortal(
    <div className="etd-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className="etd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="etd-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <header className="etd-header">
          <div className="etd-brand">
            <span className="etd-brand-orb" aria-hidden>
              <IcoSparkle />
            </span>
            <div className="etd-brand-text">
              <h2 id="etd-title" className="etd-title">
                AI Region Edit
              </h2>
              <p className="etd-subtitle">Select an area · describe the change · AI applies it</p>
            </div>
          </div>

          {/* Tool pills */}
          <nav className="etd-tools" aria-label="Drawing tools">
            {TOOLS.map((toolDef) => {
              const ToolIco = toolDef.Ico
              return (
                <button
                  key={toolDef.id}
                  type="button"
                  className={`etd-tool${tool === toolDef.id ? ' etd-tool--active' : ''}`}
                  onClick={() => setTool(toolDef.id)}
                  title={`${toolDef.label} — press ${toolDef.shortcut}`}
                >
                  <span className="etd-tool-ico" aria-hidden>
                    <ToolIco />
                  </span>
                  <span>{toolDef.label}</span>
                  <kbd className="etd-kbd">{toolDef.shortcut}</kbd>
                </button>
              )
            })}

            <span className="etd-tools-sep" aria-hidden />

            {/* Brush size inline — only when brush or eraser */}
            {(tool === 'brush' || tool === 'eraser') && (
              <div className="etd-brush-ctrl">
                <span
                  className="etd-brush-dot"
                  style={{
                    width: `${Math.max(8, Math.min(26, brushSize))}px`,
                    height: `${Math.max(8, Math.min(26, brushSize))}px`,
                  }}
                  aria-hidden
                />
                <input
                  type="range"
                  className="etd-brush-range"
                  min="8"
                  max="80"
                  step="2"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  aria-label="Brush size"
                  title={`${brushSize}px`}
                />
              </div>
            )}

            <button
              type="button"
              className="etd-tool etd-tool--danger"
              onClick={handleClear}
              disabled={!hasStroke}
              title="Clear all strokes"
            >
              <span className="etd-tool-ico" aria-hidden>
                <IcoClear />
              </span>
              <span>Clear</span>
            </button>
          </nav>

          {/* Right actions */}
          <div className="etd-header-end">
            <button
              type="button"
              className="etd-icon-btn"
              onClick={handleUndo}
              disabled={undoCount === 0}
              title="Undo (⌘Z)"
            >
              <IcoUndo />
            </button>
            <button
              type="button"
              className="etd-icon-btn etd-icon-btn--close"
              onClick={onClose}
              aria-label="Close"
            >
              <IcoClose />
            </button>
          </div>
        </header>

        {/* ── Canvas area ── */}
        <div className="etd-canvas-area">
          <div className="etd-canvas-sizer" ref={containerRef}>
            {/* Fabric layer — background + placed images */}
            <canvas ref={fabricElRef} className="etd-layer" style={{ zIndex: 1 }} aria-hidden />

            {/* Draw layer — brush / eraser / rect strokes */}
            <canvas
              ref={drawElRef}
              className="etd-layer"
              style={{
                zIndex: 2,
                cursor: tool === 'image' ? 'default' : 'crosshair',
                pointerEvents: tool === 'image' ? 'none' : 'auto',
              }}
              aria-hidden
            />

            {/* Mask canvas — hidden, used for export only */}
            <canvas ref={maskElRef} className="etd-mask-canvas" aria-hidden />

            {/* Canvas hint */}
            {!hasStroke && !rectPreviewActive && tool !== 'image' && (
              <div className="etd-canvas-hint" aria-hidden>
                <span className="etd-hint-pill">
                  {tool === 'rect' ? 'Drag to select an area' : 'Paint the area to edit'}
                </span>
              </div>
            )}

            {/* Applying overlay */}
            {applying && (
              <div className="etd-applying" aria-hidden>
                <span className="etd-applying-orb" />
                <span className="etd-applying-label">AI is editing…</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="etd-footer">
          {/* Upload section */}
          <div className="etd-uploads">
            <button
              type="button"
              className="etd-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload a reference image and place it on the canvas"
            >
              <IcoUpload />
              <span>Add image</span>
            </button>
            {placedImages.map((img) => (
              <div key={img.id} className="etd-thumb-chip">
                <img src={img.dataUrl} alt={img.name} className="etd-thumb-chip-img" />
                <button
                  type="button"
                  className="etd-thumb-chip-remove"
                  onClick={() => removePlacedImage(img.id)}
                  aria-label={`Remove ${img.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="etd-file-input"
              onChange={handleFileChange}
            />
          </div>

          {/* Prompt */}
          <div className="etd-prompt-area">
            {error && (
              <div className="etd-error" role="alert">
                <IcoWarn />
                <span>{error}</span>
              </div>
            )}
            <div className="etd-prompt-row">
              <textarea
                id="etd-prompt"
                className="etd-prompt"
                placeholder="e.g. Add a glowing border, change text to red, replace background with mountain view…"
                value={editPrompt}
                onChange={(e) => {
                  setEditPrompt(e.target.value)
                  setError(null)
                }}
                rows={2}
                maxLength={400}
              />
              <span className="etd-prompt-count">{editPrompt.length}/400</span>
            </div>
          </div>

          {/* Action buttons */}
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
                  <IcoSparkle />
                  <span>Apply AI Edit</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  )
}
