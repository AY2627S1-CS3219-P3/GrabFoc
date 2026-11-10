/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
Scope: Added the "Propose new time" modal (#186): a TIMING_CHANGE proposal through the existing POST /orders/:id/confirmations, with the order form's window fields.
Author review: Pending review by Jie Yang.
*/
"use client";

// AI-generated (pending review by Jie Yang)
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { FieldError } from "@/app/components/error-feedback";
import { Modal } from "@/app/components/modal";
import { isConflict, isUnauthorized, type Order, OrderError, proposeTimingChange, toLocalInput } from "@/lib/orders";
import { mapFieldErrors } from "@/lib/service-errors";

type Fields = Record<string, string[]>;

/**
 * Either participant proposes a new window. The Order Service checks the rest (pickup hours while ACCEPTED,
 * one pending proposal per order); its message is shown in the form. A 409 means the order or its proposals
 * changed, so the page closes this and refreshes.
 */
export function TimingChangeModal({ order, other, onClose, onSent, onStale }: {
  order: Order;
  other: "requester" | "courier";
  onClose: () => void;
  onSent: () => void;
  onStale: (error: Error) => void;
}) {
  const [windowStart, setWindowStart] = useState(toLocalInput(order.windowStart));
  const [windowEnd, setWindowEnd] = useState(toLocalInput(order.windowEnd));
  const [fields, setFields] = useState<Fields>({});
  const [formError, setFormError] = useState("");

  const send = useMutation({
    mutationFn: ({ start, end }: { start: string; end: string }) => proposeTimingChange(order.id, start, end),
    onSuccess: onSent,
    onError: (error) => {
      if (isUnauthorized(error) || isConflict(error)) { onStale(error); return; }
      if (error instanceof OrderError && error.fields.length) setFields(mapFieldErrors(error.fields));
      setFormError(error.message);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Fields = {};
    if (!windowStart) next.windowStart = ["Choose a start time."];
    if (!windowEnd) next.windowEnd = ["Choose an end time."];
    if (windowStart && windowEnd && new Date(windowStart) >= new Date(windowEnd)) next.windowEnd = ["End time must be after the start time."];
    else if (windowEnd && new Date(windowEnd) <= new Date()) next.windowEnd = ["End time must be in the future."];
    if (!next.windowStart && !next.windowEnd && windowStart === toLocalInput(order.windowStart) && windowEnd === toLocalInput(order.windowEnd)) {
      next.windowEnd = ["That's the current window. Change the start or end time."];
    }
    setFields(next);
    setFormError("");
    if (Object.keys(next).length) return;
    send.mutate({ start: new Date(windowStart).toISOString(), end: new Date(windowEnd).toISOString() });
  }

  return <Modal title="Propose a new time" onClose={onClose}>
    <form className="order-form" onSubmit={submit} noValidate>
      <p className="order-modal-text">
        The {other} gets an email and must accept before the window changes. If the current window ends first, the proposal expires.
      </p>
      <div className="order-form-pair grid grid-cols-1 sm:grid-cols-2">
        <label>Window from
          <input type="datetime-local" value={windowStart} aria-invalid={Boolean(fields.windowStart)}
            aria-describedby="timing-window-start-error" onChange={(event) => setWindowStart(event.target.value)} />
          <FieldError id="timing-window-start-error" messages={fields.windowStart} />
        </label>
        <label>Window to
          <input type="datetime-local" value={windowEnd} aria-invalid={Boolean(fields.windowEnd)}
            aria-describedby="timing-window-end-error" onChange={(event) => setWindowEnd(event.target.value)} />
          <FieldError id="timing-window-end-error" messages={fields.windowEnd} />
        </label>
      </div>
      {order.status === "ACCEPTED" && <span className="order-form-note">Until the items are picked up, the window must overlap the pickup location&apos;s opening hours.</span>}
      {formError && <p className="field-error" role="alert">{formError}</p>}
      <div className="order-modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={send.isPending}>Back</button>
        <button type="submit" className="primary-button" disabled={send.isPending}>{send.isPending ? "Sending…" : "Send proposal"}</button>
      </div>
    </form>
  </Modal>;
}
