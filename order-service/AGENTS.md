# AGENTS.md — Order Service

Service-specific context for `order-service/`. Read the root [`AGENTS.md`](../AGENTS.md) first: it has the product, terminology, roles, the auth model, cross-cutting rules and the plan-first rule.

Status legend: **[Decided]** · **[Proposed]** · **[Open]** (defined in the root `AGENTS.md`).

**Lifecycle [Decided]**

```
PENDING → ACCEPTED → PICKED_UP → IN_PROGRESS → ARRIVED → COMPLETED
```

- `PENDING → CANCELLED`: by the requester, or automatically when the timing window closes.
- `ACCEPTED / PICKED_UP / IN_PROGRESS → CANCELLED`: only when **both** parties confirm, or automatically on timeout.
- `ARRIVED → COMPLETED` and `ARRIVED → CANCELLED`: only when **both** parties confirm.
- `COMPLETED` and `CANCELLED` are final.

**Rules**

- Only `PENDING` orders can be accepted.
- A requester can't accept their own order.
- At most one courier per order; a courier may hold at most one active order.
- Requester may edit pickup, drop-off, description and timing window only while `PENDING`. The credit offer can't be edited.
- Timing window may change in later states only when both parties acknowledge.
- System-assigned fields (order ID, requester ID, timestamps) are never taken from the request body. The requester ID comes from the authenticated token.
- Creation requires the credit reservation to succeed **and** the pickup location to be `ACTIVE`.

**Events [Decided]**

- Event names: `OrderAccepted`, `OrderPickedUp`, `OrderInProgress`, `OrderArrived`, `OrderCompleted`, `OrderCancelled`.
- Payload: **event ID** (unique, e.g. UUID), event type, order ID, **new state**, requester ID, courier ID (`null` until assigned), timestamp.
  - Event ID: Notification deduplicates on it (N1.2.1).
  - New state: Notification's N2.1.1 requires it and uses it to discard stale events (N1.3.2).
  - **[Open fix]** Backlog O6.1.1 lists only event type, order ID, requester ID, courier ID and timestamp; add event ID and new state there.
- Publish only after the state change is committed. The transactional outbox pattern is the robust option.

## Edge cases

- Two couriers accept the same order at the same moment → exactly one succeeds.
- A location is deactivated after the requester selects it but before the order is submitted → order creation is rejected.
