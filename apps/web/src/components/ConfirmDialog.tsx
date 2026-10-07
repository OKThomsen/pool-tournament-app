import { useEffect, useRef } from 'react';

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
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="panel confirm"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <p>{message}</p>
      <div className="confirm-buttons">
        <button type="button" className="primary" onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </dialog>
  );
}
