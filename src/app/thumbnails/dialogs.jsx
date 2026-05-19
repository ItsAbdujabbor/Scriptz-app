import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion'
import { DISLIKE_REASONS, IOS_EASE } from './constants'

export function DislikeReasonDialog({ onSubmit, onCancel, submitting, reasons = DISLIKE_REASONS }) {
  const [selected, setSelected] = useState([])
  const [note, setNote] = useState('')
  const showNote = selected.includes('other')
  const isOnlyOther = selected.length === 1 && selected[0] === 'other'
  const isValid = selected.length > 0 && (!isOnlyOther || note.trim().length > 0)

  const toggle = useCallback((id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]))
  }, [])

  const handleSubmit = useCallback(() => {
    if (!isValid || submitting) return
    const ids = selected.filter((r) => r !== 'other')
    const reason = [...ids, ...(showNote ? ['other'] : [])].join(',') || null
    onSubmit({ reason, note: note.trim() || null })
  }, [isValid, submitting, selected, showNote, note, onSubmit])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <motion.div
      className="thumb-dislike-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onCancel}
    >
      <motion.div
        className="thumb-dislike-dialog"
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.96 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Rate thumbnail"
      >
        <p className="thumb-dislike-title">What didn&apos;t work?</p>
        <p className="thumb-dislike-sub">Select all that apply</p>

        <div className="thumb-dislike-chips" role="group" aria-label="Dislike reasons">
          {reasons.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`thumb-dislike-chip${selected.includes(id) ? ' thumb-dislike-chip--on' : ''}`}
              onClick={() => toggle(id)}
              aria-pressed={selected.includes(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {showNote && (
            <motion.div
              key="note"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.2, ease: IOS_EASE }}
              style={{ overflow: 'hidden' }}
            >
              <textarea
                className="thumb-dislike-note"
                placeholder="Tell us more…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={300}
                autoFocus
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="thumb-dislike-actions">
          <button type="button" className="thumb-dislike-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="thumb-dislike-submit"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
          >
            {submitting ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

export function CancelGenerationDialog({ onConfirm, onDismiss }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return createPortal(
    <motion.div
      className="thumb-cancel-gen-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onDismiss}
    >
      <motion.div
        className="thumb-cancel-gen-dialog"
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.96 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-gen-title"
      >
        <div className="thumb-cancel-gen-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="thumb-cancel-gen-title" id="cancel-gen-title">
          Stop current generation?
        </p>
        <p className="thumb-cancel-gen-body">
          Opening a new chat will stop the thumbnail that&apos;s currently being generated. Any
          credits used will be refunded.
        </p>
        <div className="thumb-cancel-gen-actions">
          <button type="button" className="thumb-cancel-gen-keep" onClick={onDismiss}>
            Keep generating
          </button>
          <button type="button" className="thumb-cancel-gen-stop" onClick={onConfirm}>
            Stop &amp; open new chat
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}
