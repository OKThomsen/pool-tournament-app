import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A yes/no question in a modal. Escape or clicking outside it cancels. */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} className="confirm">
      <p>{message}</p>
      <div className="confirm-buttons">
        <button type="button" className="primary" onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
  );
}
