import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check as LucideCheck } from 'lucide-react'
import { useFloatingPosition } from '../../lib/useFloatingPosition'
import { PrimaryPill } from '../../components/ui'
import { IconArrowUp, IconUploadCloud } from './icons'

/**
 * Thin wrapper around the shared <PrimaryPill> primitive that keeps the
 * old ThumbSendPill call sites working without change, while routing the
 * visual spec to the canonical component. The credit chip is shown for
 * every user so the cost is always visible alongside the send arrow.
 */
export function ThumbSendPill({
  featureKey = null,
  count = 1,
  disabled = false,
  ariaLabel,
  icon,
  label,
  type = 'submit',
  className,
  size = 'sm',
  ...buttonProps
}) {
  return (
    <PrimaryPill
      type={type}
      featureKey={featureKey || undefined}
      count={count}
      showCost
      disabled={disabled}
      ariaLabel={ariaLabel}
      icon={icon ?? <IconArrowUp />}
      label={label}
      className={className}
      size={size}
      {...buttonProps}
    />
  )
}

export function ThumbBatchCirclePicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const triggerRef = useRef(null)
  const { popoverRef, style: popoverStyle } = useFloatingPosition({
    triggerRef,
    open,
    placement: 'top-center',
    offset: 10,
  })

  useEffect(() => {
    const onDoc = (e) => {
      // Popover is portaled to <body>, so the trigger wrapper `ref` doesn't
      // contain it. Treat clicks inside either the trigger or the popover
      // as "inside" so they don't dismiss.
      const inTrigger = ref.current?.contains(e.target)
      const inPopover = popoverRef.current?.contains(e.target)
      if (!inTrigger && !inPopover) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', onDoc)
      return () => document.removeEventListener('click', onDoc)
    }
  }, [open, popoverRef])

  return (
    <div ref={ref} className={`thumb-batch-circle-picker ${disabled ? 'is-disabled' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="thumb-batch-circle-trigger"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Concepts: ${value}`}
        title={disabled ? 'Batch size' : 'How many concepts to generate'}
      >
        <span className="thumb-batch-circle-trigger-badge thumb-batch-circle-trigger-badge--solo">
          {value}×
        </span>
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={popoverRef}
            className="thumb-batch-circle-popover thumb-batch-circle-popover--floating"
            role="listbox"
            aria-label="Concept count"
            style={popoverStyle}
          >
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                className={`thumb-batch-circle-option ${n === value ? 'is-active' : ''}`}
                aria-selected={n === value}
                aria-label={`${n} concept${n === 1 ? '' : 's'} per run`}
                onClick={() => {
                  onChange(n)
                  setOpen(false)
                }}
              >
                <span className="thumb-batch-circle-option-n">{n}</span>
                {n === value && (
                  <span className="thumb-picker-check" aria-hidden>
                    <LucideCheck strokeWidth={2.6} />
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}

/**
 * ThumbTitleCountPicker — glassCircle-styled chooser for the Titles
 * tab. Same silhouette as `ThumbBatchCirclePicker` (single circle
 * trigger + portaled popover) so the toolbar reads identically across
 * modes; only the option set differs (10 / 20 instead of 1-4).
 */
export function ThumbTitleCountPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const triggerRef = useRef(null)
  const { popoverRef, style: popoverStyle } = useFloatingPosition({
    triggerRef,
    open,
    placement: 'top-center',
    offset: 10,
  })
  useEffect(() => {
    const onDoc = (e) => {
      const inTrigger = ref.current?.contains(e.target)
      const inPopover = popoverRef.current?.contains(e.target)
      if (!inTrigger && !inPopover) setOpen(false)
    }
    if (open) {
      document.addEventListener('click', onDoc)
      return () => document.removeEventListener('click', onDoc)
    }
  }, [open, popoverRef])
  return (
    <div ref={ref} className={`thumb-batch-circle-picker ${disabled ? 'is-disabled' : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className="thumb-batch-circle-trigger"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Title ideas: ${value}`}
        title={disabled ? 'Title count' : 'How many titles to generate'}
      >
        <span className="thumb-batch-circle-trigger-badge thumb-batch-circle-trigger-badge--solo">
          {value}
        </span>
      </button>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={popoverRef}
            className="thumb-batch-circle-popover thumb-batch-circle-popover--floating"
            role="listbox"
            aria-label="Title count"
            style={popoverStyle}
          >
            {[4, 8, 12].map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                className={`thumb-batch-circle-option ${n === value ? 'is-active' : ''}`}
                aria-selected={n === value}
                aria-label={`${n} title ideas per run`}
                onClick={() => {
                  onChange(n)
                  setOpen(false)
                }}
              >
                <span className="thumb-batch-circle-option-n">{n}</span>
                {n === value && (
                  <span className="thumb-picker-check" aria-hidden>
                    <LucideCheck strokeWidth={2.6} />
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}

export function ThumbDropZone({
  fileInputRef,
  imageDataUrl,
  onFileChange,
  onRemove,
  label = 'Drop image or click to upload',
}) {
  const [dragging, setDragging] = useState(false)

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragging(true)
  }
  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
  }
  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      onFileChange({ target: { files: [file] } })
    }
  }

  return (
    <div
      className={`thumb-drop-zone ${dragging ? 'is-dragging' : ''} ${imageDataUrl ? 'has-image' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !imageDataUrl && fileInputRef.current?.click()}
      role={imageDataUrl ? undefined : 'button'}
      tabIndex={imageDataUrl ? undefined : 0}
      onKeyDown={(e) => !imageDataUrl && e.key === 'Enter' && fileInputRef.current?.click()}
      aria-label={imageDataUrl ? undefined : label}
    >
      {imageDataUrl ? (
        <div className="thumb-drop-zone-file-strip">
          <img src={imageDataUrl} alt="" className="thumb-drop-zone-file-thumb" />
          <span className="thumb-drop-zone-file-info">Image ready</span>
          <button
            type="button"
            className="thumb-drop-zone-clear"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label="Remove image"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="thumb-drop-zone-empty">
          <span className="thumb-drop-zone-icon">
            <IconUploadCloud />
          </span>
          <span className="thumb-drop-zone-label">{label}</span>
          <span className="thumb-drop-zone-hint">PNG, JPG, WEBP</span>
        </div>
      )}
    </div>
  )
}
