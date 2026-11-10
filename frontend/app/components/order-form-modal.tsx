/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the Create Order / Edit Order modal (docs/orders/frontend-integration-plan.md §2 and §3).
Author review: Pending review by Deanson.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Redesign: route preview of the chosen pickup and drop-off, coin icon on the credit field, optional pickup prefilled from a location card, and a "dispatched" success view with an animation after an order is created.
Author review: Pending review by Jie Yang.

AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-09
Scope: Editable timing window (datetime-local inputs) on create and edit, sent as toISOString(), with a start-before-end check.
Author review: Pending review by Deanson.
*/
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { FieldError } from "@/app/components/error-feedback";
import { CoinIcon, DispatchedArt, RoutePreview } from "@/app/components/icons";
import { Modal } from "@/app/components/modal";
import { activeLocations } from "@/lib/locations";
import { createOrder, editOrder, isConflict, isUnauthorized, type Order, OrderError,
  type OrderEdit, orderKeys } from "@/lib/orders";
import { mapFieldErrors } from "@/lib/service-errors";

type Mode = { kind: "create"; pickupId?: number } | { kind: "edit"; order: Order };
type Fields = Record<string, string[]>;

const MAX_INT = 2147483647;

// AI-generated (pending review by Deanson)
/** ISO timestamp → the browser's local "YYYY-MM-DDTHH:mm", the value a datetime-local input takes. */
function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// AI-generated (pending review by Deanson)
export function OrderFormModal({ mode, onClose, onSaved }: { mode: Mode; onClose: () => void; onSaved: (order: Order) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const order = mode.kind === "edit" ? mode.order : undefined;
  const [description, setDescription] = useState(order?.orderDescription ?? "");
  const [pickup, setPickup] = useState(order ? String(order.pickupLocationId) : mode.kind === "create" && mode.pickupId ? String(mode.pickupId) : "");
  const [delivery, setDelivery] = useState(order ? String(order.deliveryLocationId) : "");
  const [credits, setCredits] = useState(order ? String(order.creditOffer) : "");
  // Local "YYYY-MM-DDTHH:mm" strings; blank on create means the server's default window.
  const initialStart = order ? toLocalInput(order.windowStart) : "";
  const initialEnd = order ? toLocalInput(order.windowEnd) : "";
  const [windowStart, setWindowStart] = useState(initialStart);
  const [windowEnd, setWindowEnd] = useState(initialEnd);
  const [fields, setFields] = useState<Fields>({});
  const [formError, setFormError] = useState("");
  // Set after a create succeeds, to show the dispatched view before closing.
  const [created, setCreated] = useState<Order | null>(null);

  const locations = useQuery({ queryKey: ["locations", "active"], queryFn: activeLocations, staleTime: 60_000 });
  const options = [...(locations.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    .map((location) => ({ value: String(location.id), label: `${location.name}, ${location.building}` }));
  // An edited order may point at a location that has since become inactive.
  const withCurrent = (id: number | undefined, name: string | undefined) =>
    id !== undefined && !options.some((option) => option.value === String(id))
      ? [{ value: String(id), label: `${name} (current)` }, ...options] : options;
  const pickupOptions = withCurrent(order?.pickupLocationId, order?.pickupName);
  const deliveryOptions = withCurrent(order?.deliveryLocationId, order?.deliveryName);

  const save = useMutation({
    mutationFn: (input: { create: true; body: Parameters<typeof createOrder>[0] } | { create: false; edit: OrderEdit }) =>
      input.create ? createOrder(input.body) : editOrder(order!.id, order!.version, input.edit),
    onSuccess: (saved) => {
      queryClient.setQueryData(orderKeys.order(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      if (order) onSaved(saved); else setCreated(saved);
    },
    onError: (error) => {
      if (isUnauthorized(error)) { router.replace("/signin"); return; }
      if (error instanceof OrderError) setFields(mapFieldErrors(error.fields));
      setFormError(error.message);
      if (isConflict(error) && order) void queryClient.invalidateQueries({ queryKey: orderKeys.order(order.id) });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Fields = {};
    if (!description.trim()) next.orderDescription = ["Describe your order."];
    if (!pickup) next.pickupLocationId = ["Choose a pickup location."];
    if (!delivery) next.deliveryLocationId = ["Choose a delivery location."];
    const offer = Number(credits);
    if (!order && (!/^\d+$/.test(credits.trim()) || offer < 1 || offer > MAX_INT)) next.creditOffer = ["Offer a whole number of credits, at least 1."];
    // On edit a cleared field keeps the order's current time, so compare against that.
    const start = windowStart || initialStart;
    const end = windowEnd || initialEnd;
    if (start && end && new Date(start) >= new Date(end)) next.windowEnd = ["End time must be after the start time."];
    setFields(next);
    setFormError("");
    if (Object.keys(next).length) return;

    if (!order) {
      save.mutate({ create: true, body: { orderDescription: description.trim(), pickupLocationId: Number(pickup),
        deliveryLocationId: Number(delivery), creditOffer: offer,
        ...(windowStart && { windowStart: new Date(windowStart).toISOString() }),
        ...(windowEnd && { windowEnd: new Date(windowEnd).toISOString() }) } });
      return;
    }
    // PATCH takes only the fields that changed.
    const edit: OrderEdit = {};
    if (description.trim() !== order.orderDescription) edit.orderDescription = description.trim();
    if (Number(pickup) !== order.pickupLocationId) edit.pickupLocationId = Number(pickup);
    if (Number(delivery) !== order.deliveryLocationId) edit.deliveryLocationId = Number(delivery);
    if (windowStart && windowStart !== initialStart) edit.windowStart = new Date(windowStart).toISOString();
    if (windowEnd && windowEnd !== initialEnd) edit.windowEnd = new Date(windowEnd).toISOString();
    if (!Object.keys(edit).length) { setFormError("Change at least one field."); return; }
    save.mutate({ create: false, edit });
  }

  const busy = save.isPending;
  const labelOf = (id: string, list: typeof options) => list.find((option) => option.value === id)?.label.split(",")[0];

  // AI-generated (pending review by Jie Yang)
  if (created) return <Modal title="Order placed" onClose={() => onSaved(created)}>
    <div className="dispatched" role="status">
      <DispatchedArt />
      <h3>Your order is on the board</h3>
      <p>Couriers can see it now. {created.creditOffer} {created.creditOffer === 1 ? "credit is" : "credits are"} held until it&apos;s delivered.</p>
      <span className="dispatched-route">{created.pickupName} to {created.deliveryName}</span>
      <div className="order-modal-actions">
        <button type="button" className="secondary-button" onClick={() => onSaved(created)}>Done</button>
        <button type="button" className="primary-button" onClick={() => router.push(`/orders/${created.id}`)}>View order</button>
      </div>
    </div>
  </Modal>;

  return <Modal title={order ? "Edit Order" : "Create Order"} onClose={onClose}>
    <form className="order-form" onSubmit={submit} noValidate>
      <RoutePreview from={labelOf(pickup, pickupOptions)} to={labelOf(delivery, deliveryOptions)} />
      <label>Order description
        <textarea value={description} placeholder="Describe your order" aria-invalid={Boolean(fields.orderDescription)}
          aria-describedby="order-description-error" onChange={(event) => setDescription(event.target.value)} />
        <FieldError id="order-description-error" messages={fields.orderDescription} />
      </label>
      {locations.isError && <div className="load-error" role="alert"><p>Could not load locations.</p>
        <button type="button" onClick={() => void locations.refetch()}>Retry</button></div>}
      <label>Pickup location
        <select value={pickup} disabled={locations.isPending} aria-invalid={Boolean(fields.pickupLocationId)}
          aria-describedby="order-pickup-error" onChange={(event) => setPickup(event.target.value)}>
          <option value="">{locations.isPending ? "Loading locations…" : "Choose a location"}</option>
          {pickupOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <FieldError id="order-pickup-error" messages={fields.pickupLocationId} />
      </label>
      <label>Delivery location
        <select value={delivery} disabled={locations.isPending} aria-invalid={Boolean(fields.deliveryLocationId)}
          aria-describedby="order-delivery-error" onChange={(event) => setDelivery(event.target.value)}>
          <option value="">{locations.isPending ? "Loading locations…" : "Choose a location"}</option>
          {deliveryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <FieldError id="order-delivery-error" messages={fields.deliveryLocationId} />
      </label>
      <label>Credit offer
        <span className="order-credit-field"><CoinIcon size={20} /><input type="number" min={1} step={1} inputMode="numeric" value={credits} readOnly={Boolean(order)}
          aria-invalid={Boolean(fields.creditOffer)} aria-describedby="order-credits-error"
          onChange={(event) => setCredits(event.target.value)} /></span>
        <FieldError id="order-credits-error" messages={fields.creditOffer} />
        {order && <span className="order-form-note">The credit offer can&apos;t be changed.</span>}
      </label>
      <div className="order-form-pair grid grid-cols-1 sm:grid-cols-2">
        <label>Window from
          <input type="datetime-local" value={windowStart} aria-invalid={Boolean(fields.windowStart)}
            aria-describedby="order-window-start-error" onChange={(event) => setWindowStart(event.target.value)} />
          <FieldError id="order-window-start-error" messages={fields.windowStart} />
        </label>
        <label>Window to
          <input type="datetime-local" value={windowEnd} aria-invalid={Boolean(fields.windowEnd)}
            aria-describedby="order-window-end-error" onChange={(event) => setWindowEnd(event.target.value)} />
          <FieldError id="order-window-end-error" messages={fields.windowEnd} />
        </label>
      </div>
      {!order && <span className="order-form-note">Leave the times blank to start now and end 24 hours later.</span>}
      {formError && <p className="field-error" role="alert">{formError}</p>}
      <div className="order-modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Back</button>
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : order ? "Save Changes" : "Create Order"}</button>
      </div>
    </form>
  </Modal>;
}
