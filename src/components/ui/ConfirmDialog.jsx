import { Dialog } from './Dialog'

/**
 * Small confirmation dialog. Built on the unified <Dialog> chrome —
 * only the title / description / action buttons live here.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      size="sm"
      ariaLabelledBy="confirm-dialog-title"
      className="confirm-dialog"
    >
      <div className="confirm-dialog-body">
        <h3 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h3>
        {description && <p className="confirm-dialog__desc">{description}</p>}
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog__btn ${danger ? 'confirm-dialog__btn--danger' : 'confirm-dialog__btn--confirm'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
