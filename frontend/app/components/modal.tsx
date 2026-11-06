/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added a small modal built on the native <dialog> element, and a confirmation modal.
Author review: Pending review by Deanson.
*/
"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

// AI-generated (pending review by Deanson)
// showModal() gives Esc handling, an inert background and focus containment for free.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="order-modal" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="order-modal-heading">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="order-modal-close" onClick={onClose} aria-label="Close">×</button>
    </div>
    {children}
  </dialog>;
}

export function ConfirmModal({ title, message, confirmLabel, busy, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return <Modal title={title} onClose={onClose}>
    <p className="order-modal-text">{message}</p>
    <div className="order-modal-actions">
      <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Back</button>
      <button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
    </div>
  </Modal>;
}
