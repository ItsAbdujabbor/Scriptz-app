/**
 * LiquidMetalButton — animated metallic pill button.
 *
 * Ported from topone-microservices (see docs/LiquidMetalButton.md). Four
 * stacked layers — WebGL shader canvas, metallic plate, text+icon row,
 * transparent click target — wrapped in a single rounded-pill container.
 * Idle shader speed bumps to 1 on hover and surges to 2.4 on click; a
 * CSS ripple spawns at the click point.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export function LiquidMetalButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  loading = false,
  viewMode = 'text',
  dark = false,
  width: customWidth,
  height: customHeight,
  className,
  style: externalStyle,
  'aria-label': ariaLabel,
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [ripples, setRipples] = useState([])
  const shaderMount = useRef(null)
  const buttonRef = useRef(null)
  const containerRef = useRef(null)
  const rippleId = useRef(0)

  const h = customHeight ?? 48
  const w = customWidth ?? (viewMode === 'icon' ? 48 : 142)
  const isFlexible = typeof w === 'string'
  const numW = typeof w === 'number' ? w : 142

  /* Inject the ripple keyframes once per page (idempotent). */
  useEffect(() => {
    const styleId = 'shader-canvas-style-liquid-metal'
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style')
      s.id = styleId
      s.textContent = `
        @keyframes lm-ripple {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `
      document.head.appendChild(s)
    }
  }, [])

  /* Mount the WebGL shader directly on the outer container div. */
  useEffect(() => {
    if (!containerRef.current) return

    let mounted = true

    const loadShader = async () => {
      try {
        const { liquidMetalFragmentShader, ShaderMount } = await import(
          '@paper-design/shaders'
        )
        if (!mounted || !containerRef.current) return

        if (shaderMount.current?.dispose) {
          shaderMount.current.dispose()
          shaderMount.current = null
        }

        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
        const minPixelRatio = isMobile ? 1 : 2

        shaderMount.current = new ShaderMount(
          containerRef.current,
          liquidMetalFragmentShader,
          {
            u_repetition: 4,
            u_softness: 0.5,
            u_shiftRed: 0.3,
            u_shiftBlue: 0.3,
            u_distortion: 0,
            u_contour: 0,
            u_angle: 45,
            u_scale: 8,
            u_shape: 1,
            u_offsetX: 0.1,
            u_offsetY: -0.1,
          },
          undefined,
          0.6,
          0,
          minPixelRatio
        )

        const canvas = shaderMount.current.canvasElement
        if (canvas) {
          canvas.style.height = '100%'
          canvas.style.position = 'absolute'
          canvas.style.inset = '0'
          canvas.style.display = 'block'

          const applyCanvasWidth = (cw) => {
            canvas.style.width = cw > 200 ? '1256px' : '100%'
          }
          applyCanvasWidth(containerRef.current?.offsetWidth ?? 0)

          const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
              applyCanvasWidth(entry.contentRect.width)
            }
          })
          if (containerRef.current) ro.observe(containerRef.current)
          shaderMount.current._ro = ro
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load liquid-metal shader:', error)
      }
    }

    loadShader()

    return () => {
      mounted = false
      if (shaderMount.current) {
        shaderMount.current._ro?.disconnect()
        shaderMount.current.dispose?.()
        shaderMount.current = null
      }
    }
  }, [])

  /* Hide canvas while disabled — saves a frame budget. */
  useEffect(() => {
    const canvas = shaderMount.current?.canvasElement
    if (canvas) canvas.style.display = disabled ? 'none' : 'block'
  }, [disabled])

  const handlePointerEnter = () => {
    if (disabled) return
    setIsHovered(true)
    shaderMount.current?.setSpeed?.(1)
  }
  const handlePointerLeave = () => {
    setIsHovered(false)
    setIsPressed(false)
    shaderMount.current?.setSpeed?.(0.6)
  }
  const handlePointerDown = useCallback(() => {
    if (!disabled) setIsPressed(true)
  }, [disabled])
  const handlePointerUp = useCallback(() => {
    setIsPressed(false)
  }, [])

  const handleClick = useCallback(
    (e) => {
      if (disabled || loading) return

      if (shaderMount.current?.setSpeed) {
        shaderMount.current.setSpeed(2.4)
        setTimeout(() => {
          shaderMount.current?.setSpeed?.(0.6)
        }, 300)
      }

      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const ripple = { x, y, id: rippleId.current++ }
        setRipples((prev) => [...prev, ripple])
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== ripple.id))
        }, 600)
      }

      onClick?.(e)
    },
    [disabled, loading, onClick]
  )

  const outerSize = isFlexible
    ? { width: '100%', height: h }
    : { width: numW, height: h }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        display: 'block',
        borderRadius: 100,
        overflow: 'hidden',
        background: disabled ? 'rgba(180,180,180,0.5)' : undefined,
        transform:
          isPressed && !disabled
            ? 'translateY(1px) scale(0.98)'
            : 'translateY(0) scale(1)',
        transition:
          'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        willChange: 'transform, box-shadow',
        WebkitTapHighlightColor: 'transparent',
        boxShadow: disabled
          ? 'none'
          : isPressed
            ? '0px 0px 0px 1px rgba(0, 0, 0, 0.5), 0px 1px 2px 0px rgba(0, 0, 0, 0.3)'
            : isHovered
              ? '0px 0px 0px 1px rgba(0, 0, 0, 0.4), 0px 12px 6px 0px rgba(0, 0, 0, 0.05), 0px 8px 5px 0px rgba(0, 0, 0, 0.1), 0px 4px 4px 0px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.2)'
              : '0px 0px 0px 1px rgba(0, 0, 0, 0.3), 0px 36px 14px 0px rgba(0, 0, 0, 0.02), 0px 20px 12px 0px rgba(0, 0, 0, 0.08), 0px 9px 9px 0px rgba(0, 0, 0, 0.12), 0px 2px 5px 0px rgba(0, 0, 0, 0.15)',
        ...outerSize,
        ...externalStyle,
      }}
    >
      {/* ShaderMount's canvas is prepended here automatically (z-index: -1) */}

      {/* Inner metallic plate — 2px inset on all sides */}
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          right: 2,
          bottom: 2,
          zIndex: 0,
          borderRadius: 100,
          background: disabled
            ? 'linear-gradient(180deg, #e0e0e0 0%, #ccc 100%)'
            : dark
              ? 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)'
              : 'linear-gradient(180deg, #ffffff 0%, #f0f0f0 100%)',
          boxShadow:
            isPressed && !disabled
              ? 'inset 0px 2px 4px rgba(0, 0, 0, 0.4), inset 0px 1px 2px rgba(0, 0, 0, 0.3)'
              : 'none',
          transition: 'box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* Text/icon layer — display only, never the click target */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        {loading ? (
          <svg
            className="animate-spin"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke={dark ? '#fff' : '#000'}
            strokeWidth={2.5}
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <>
            {Icon && (
              <Icon
                size={viewMode === 'icon' ? 20 : 16}
                style={{
                  color: dark ? '#ffffff' : '#000000',
                  filter: dark
                    ? 'drop-shadow(0px 1px 2px rgba(255, 255, 255, 0.3))'
                    : 'drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.5))',
                }}
                strokeWidth={2.5}
              />
            )}
            {viewMode === 'text' && label && (
              <span
                style={{
                  fontSize: 14,
                  color: dark ? '#ffffff' : '#000000',
                  fontWeight: 600,
                  textShadow: dark
                    ? '0px 1px 2px rgba(255, 255, 255, 0.3)'
                    : '0px 1px 2px rgba(0, 0, 0, 0.5)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.01em',
                }}
              >
                {label}
              </span>
            )}
          </>
        )}
      </div>

      {/* Clickable layer + ripple host */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          outline: 'none',
          zIndex: 2,
          overflow: 'hidden',
          borderRadius: 100,
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
        aria-label={ariaLabel ?? label}
        aria-disabled={disabled}
      >
        {ripples.map((r) => (
          <span
            key={r.id}
            style={{
              position: 'absolute',
              left: r.x,
              top: r.y,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 70%)',
              pointerEvents: 'none',
              animation: 'lm-ripple 0.6s ease-out',
            }}
          />
        ))}
      </button>
    </div>
  )
}
