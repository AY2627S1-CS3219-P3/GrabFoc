/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-22
Scope: Added the Create Order / Edit Order modal (docs/orders/frontend-integration-plan.md §2 and §3).
Author review: Pending review by Deanson.
*/
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { FieldError } from "@/app/components/error-feedback";
import { Modal } from "@/app/components/modal";
import { activeLocations } from "@/lib/locations";
import { createOrder, editOrder, formatTime, isConflict, isUnauthorized, type Order, OrderError,
  type OrderEdit, orderKeys } from "@/lib/orders";
import { mapFieldErrors } from "@/lib/service-errors";

type Mode = { kind: "create" } | { kind: "edit"; order: Order };
type Fields = Record<string, string[]>;

const MAX_INT = 2147483647;

// AI-generated (pending review by Deanson)
export function OrderFormModal({ mode, onClose, onSaved }: { mode: Mode; onClose: () => void; onSaved: (order: Order) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const order = mode.kind === "edit" ? mode.order : undefined;
  const [description, setDescription] = useState(order?.orderDescription ?? "");
  const [pickup, setPickup] = useState(order ? String(order.pickupLocationId) : "");
  const [delivery, setDelivery] = useState(order ? String(order.deliveryLocationId) : "");
  const [credits, setCredits] = useState(order ? String(order.creditOffer) : "");
  const [fields, setFields] = useState<Fields>({});
  const [formError, setFormError] = useState("");

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
      onSaved(saved);
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
    setFields(next);
    setFormError("");
    if (Object.keys(next).length) return;

    if (!order) {
      save.mutate({ create: true, body: { orderDescription: description.trim(), pickupLocationId: Number(pickup),
        deliveryLocationId: Number(delivery), creditOffer: offer } });
      return;
    }
    // PATCH takes only the fields that changed.
    const edit: OrderEdit = {};
    if (description.trim() !== order.orderDescription) edit.orderDescription = description.trim();
    if (Number(pickup) !== order.pickupLocationId) edit.pickupLocationId = Number(pickup);
    if (Number(delivery) !== order.deliveryLocationId) edit.deliveryLocationId = Number(delivery);
    if (!Object.keys(edit).length) { setFormError("Change at least one field."); return; }
    save.mutate({ create: false, edit });
  }

  const busy = save.isPending;
  return <Modal title={order ? "Edit Order" : "Create Order"} onClose={onClose}>
    <form className="order-form" onSubmit={submit} noValidate>
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
        <input type="number" min={1} step={1} inputMode="numeric" value={credits} readOnly={Boolean(order)}
          aria-invalid={Boolean(fields.creditOffer)} aria-describedby="order-credits-error"
          onChange={(event) => setCredits(event.target.value)} />
        <FieldError id="order-credits-error" messages={fields.creditOffer} />
        {order && <span className="order-form-note">The credit offer can&apos;t be changed.</span>}
      </label>
      <div className="order-form-pair grid grid-cols-1 sm:grid-cols-2">
        <label>Window from<input value={order ? formatTime(order.windowStart) : "Now"} readOnly /></label>
        <label>Window to<input value={order ? formatTime(order.windowEnd) : "24 hours after creation"} readOnly /></label>
      </div>
      {formError && <p className="field-error" role="alert">{formError}</p>}
      <div className="order-modal-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Back</button>
        <button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving…" : order ? "Save Changes" : "Create Order"}</button>
      </div>
    </form>
  </Modal>;
}
