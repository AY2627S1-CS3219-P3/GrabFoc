<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-12
Scope: Documented the schema draft; replaced separate items with user-confirmed order_description.
Author review: User approved PostgreSQL, snapshots, minimum credit and a single order description and requested a schema/PR; remaining proposals pending team review.
-->

# Order Service — schema review draft

This is a design draft for #50, under parent #64, not an implemented service or executable migration. Read [AGENTS.md](AGENTS.md) for requirements.

## Confirmed decisions

_Origin: Team (confirmed in chat on 2026-10-12)_

- PostgreSQL for Order.
- Save pickup details as a snapshot; later Supplier edits do not silently replace the saved pickup details.
- Whole-number credit offer of at least 1.
- One free-text `order_description` on `orders` represents the requested items; no separate item table.

## Proposed schema

_Origin: AI design, requested after the AI-policy warning; pending team review_

Types match the documented external identifiers: User UUID and Supplier INTEGER. External references have no cross-service foreign keys. Local order references below use foreign keys to `orders.id`.

| Table | Proposed columns |
|---|---|
| `orders` | `id UUID PK`; `order_description TEXT NOT NULL`; `requester_id UUID NOT NULL`; `courier_id UUID NULL`; `pickup_location_id INTEGER NOT NULL`; `pickup_name TEXT NOT NULL`; `pickup_lat NUMERIC NOT NULL`; `pickup_lon NUMERIC NOT NULL`; `delivery_description TEXT NOT NULL`; `delivery_lat NUMERIC NOT NULL`; `delivery_lon NUMERIC NOT NULL`; `credit_offer INTEGER NOT NULL CHECK >= 1`; `status TEXT NOT NULL`; `window_start TIMESTAMPTZ NOT NULL`; `window_end TIMESTAMPTZ NOT NULL`; `created_at TIMESTAMPTZ NOT NULL`; `updated_at TIMESTAMPTZ NOT NULL`; `version INTEGER NOT NULL` |
| `order_history` | `id UUID PK`; `order_id UUID NOT NULL FK`; `actor_id UUID NULL`; `action TEXT NOT NULL`; `previous_status TEXT NULL`; `new_status TEXT NULL`; `change_details JSONB NULL`; `occurred_at TIMESTAMPTZ NOT NULL` |
| `order_confirmations` | `id UUID PK`; `order_id UUID NOT NULL FK`; `kind TEXT NOT NULL`; `proposed_by UUID NOT NULL`; `proposed_window_start TIMESTAMPTZ NULL`; `proposed_window_end TIMESTAMPTZ NULL`; `requester_response TEXT NOT NULL`; `courier_response TEXT NOT NULL`; `status TEXT NOT NULL`; `created_at TIMESTAMPTZ NOT NULL`; `resolved_at TIMESTAMPTZ NULL` |

`status` on orders is restricted to PENDING, ACCEPTED, PICKED_UP, IN_PROGRESS, ARRIVED, COMPLETED and CANCELLED. Require end after start, positive version and distinct requester/courier. Courier is null before assignment; new orders start PENDING. The exact status/assignment constraints and generated ID/default strategy remain proposals for implementation planning.

Confirmation kinds: TIMING_CHANGE, CANCELLATION, COMPLETION. Party responses: PENDING, ACCEPTED, REJECTED. Proposal states: PENDING, APPROVED, REJECTED, EXPIRED, SUPERSEDED. Only timing-change proposals carry proposed window fields. Keep resolved proposals for traceability. A history entry with null actor can represent a system action; creation can have null previous status, and edits need not change state.

## Proposed indexes and transactions

_Origin: AI design; pending team review_

- `(status, created_at)` for available listings; `(requester_id, created_at)` and `(courier_id, created_at)` for user orders.
- Partial unique index on non-null courier for ACCEPTED, PICKED_UP, IN_PROGRESS and ARRIVED to enforce one active assignment.
- Partial index on window end for PENDING, ACCEPTED, PICKED_UP and IN_PROGRESS timeout scans.
- History `(order_id, occurred_at)` and confirmations `(order_id, status)`.
- Change the order and its local history in one transaction, following the root rule. PostgreSQL transactions do not span Credit's database. Concurrent acceptance must check current state atomically; the partial courier index alone does not prevent replacing an order's courier.

## Referenced information changes

_Origin: Team (snapshot decision); AI design (remaining proposed handling)_

- Preserve the original Supplier ID plus pickup name/coordinates. Confirm additional snapshot fields and what happens when the requester explicitly edits pickup.
- User profile changes leave stable requester/courier IDs intact; resolve current display data through an approved contract. Do not copy credentials or unnecessary personal data.
- Keep order history when a location becomes inactive or a user is suspended/deactivated. Rules for continuing active orders, editing or further actions remain open.
- Store delivery details locally. Credit balances/holds remain in Credit Service.

## Decisions needed before implementation

_Origin: AI doc, restating unresolved chat and AGENTS.md items_

- Delivery field structure and coordinate precision; complete pickup snapshot fields.
- Timing default, duration/expiry boundaries and PENDING timing acknowledgement without a courier.
- Confirmation initiators, whether initiation counts as approval, proposal expiry and concurrent proposals.
- Account/location status effects; requester active-order limit if any.
- Final approval of tables, constraints and indexes.
- Credit communication/recovery contract: root currently records synchronous reserve/transfer/release; meeting's asynchronous proposal is not yet approved.
- Broker/event payload and reliable publication mechanism. No outbox pattern is selected here.

Approve an implementation plan before adding migrations, APIs or integration code.
