import { useEffect, useId, useRef, type ReactNode } from 'react';

export function ConfirmDialog({ open, title, children, confirm, cancel, onConfirm, onCancel, busy = false }: {
  open: boolean; title: string; children: ReactNode; confirm: string; cancel: string;
  onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id={`${id}-title`}>{title}</h2><div id={`${id}-description`} className="muted dialog-description">{children}</div>
    <div className="dialog-actions"><button autoFocus className="button secondary" disabled={busy} onClick={onCancel}>{cancel}</button><button className="button primary" disabled={busy} onClick={onConfirm}>{confirm}</button></div>
  </dialog>;
}
