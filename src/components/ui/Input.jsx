/**
 * Input / TextArea primitives.
 *
 * Use `<Input>` for single-line text/search/email/number fields and
 * `<TextArea>` for multi-line. Both apply the canonical focus ring,
 * border, padding, and typography so every form in the app feels the
 * same.
 *
 * Props match the native element plus:
 *   - `size`: 'sm' | 'md' (default) | 'lg'
 *   - `pill`: true → fully-rounded pill shape (search bars)
 *   - `label`: optional label that renders above the input
 *   - `resizable`: textarea only, default true
 */
import { forwardRef, useId } from 'react'
import './Input.css'

const cn = (...parts) => parts.filter(Boolean).join(' ')

export const Input = forwardRef(function Input(
  { label, size = 'md', pill = false, className, id, ...rest },
  ref
) {
  const reactId = useId()
  const inputId = id || `ui-input-${reactId}`
  const classes = cn(
    'ui-input',
    size !== 'md' && `ui-input--${size}`,
    pill && 'ui-input--pill',
    className
  )
  const input = <input ref={ref} id={inputId} className={classes} {...rest} />
  if (!label) return input
  return (
    <label className="ui-field" htmlFor={inputId}>
      <span className="ui-field-label">{label}</span>
      {input}
    </label>
  )
})

export const TextArea = forwardRef(function TextArea(
  { label, className, id, resizable = true, rows = 3, ...rest },
  ref
) {
  const reactId = useId()
  const textareaId = id || `ui-textarea-${reactId}`
  const classes = cn('ui-textarea', !resizable && 'ui-textarea--resize-none', className)
  const textarea = <textarea ref={ref} id={textareaId} rows={rows} className={classes} {...rest} />
  if (!label) return textarea
  return (
    <label className="ui-field" htmlFor={textareaId}>
      <span className="ui-field-label">{label}</span>
      {textarea}
    </label>
  )
})
