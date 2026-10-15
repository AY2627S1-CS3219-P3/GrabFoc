-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-10-13
-- Scope: Implemented the user-approved Order database-only plan.
-- Author review: Design and plan approved by user; implementation review pending.
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
-- Scope: Added AWAITING_CREDIT, the CREDIT_RESERVED history action and
--        orders.credit_released_at for the revised creation flow (Phase B).
-- Author review: Reviewed
-- AI-generated; human review pending.

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_description TEXT NOT NULL,
    requester_id UUID NOT NULL,
    courier_id UUID,
    pickup_location_id INTEGER NOT NULL,
    pickup_name TEXT NOT NULL,
    pickup_lat NUMERIC(11,9) NOT NULL,
    pickup_lon NUMERIC(12,9) NOT NULL,
    delivery_location_id INTEGER NOT NULL,
    delivery_name TEXT NOT NULL,
    delivery_lat NUMERIC(11,9) NOT NULL,
    delivery_lon NUMERIC(12,9) NOT NULL,
    credit_offer INTEGER NOT NULL CHECK (credit_offer >= 1),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('AWAITING_CREDIT','PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')),
    window_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    window_end TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    -- Set once Credit confirms the release; CANCELLED orders with NULL here are retried.
    credit_released_at TIMESTAMPTZ,
    CONSTRAINT order_window_ordered CHECK (window_end > window_start),
    CONSTRAINT order_distinct_parties CHECK (courier_id IS NULL OR courier_id <> requester_id),
    CONSTRAINT order_assignment_consistent CHECK (
        (status IN ('AWAITING_CREDIT','PENDING') AND courier_id IS NULL)
        OR (status IN ('ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED') AND courier_id IS NOT NULL)
        OR status = 'CANCELLED'
    )
);

CREATE TABLE order_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    actor_id UUID,
    action TEXT NOT NULL CHECK (action IN ('CREATED','CREDIT_RESERVED','EDITED','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')),
    previous_status TEXT CHECK (previous_status IN ('AWAITING_CREDIT','PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')),
    new_status TEXT CHECK (new_status IN ('AWAITING_CREDIT','PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')),
    change_details JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    kind TEXT NOT NULL CHECK (kind IN ('TIMING_CHANGE','CANCELLATION','COMPLETION')),
    proposed_by UUID NOT NULL,
    proposed_window_start TIMESTAMPTZ,
    proposed_window_end TIMESTAMPTZ,
    requester_response TEXT NOT NULL CHECK (requester_response IN ('PENDING','ACCEPTED','REJECTED')),
    courier_response TEXT NOT NULL CHECK (courier_response IN ('PENDING','ACCEPTED','REJECTED')),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED','SUPERSEDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    CONSTRAINT confirmation_window_consistent CHECK (
        (kind = 'TIMING_CHANGE' AND proposed_window_start IS NOT NULL
         AND proposed_window_end IS NOT NULL AND proposed_window_end > proposed_window_start)
        OR (kind IN ('CANCELLATION','COMPLETION')
            AND proposed_window_start IS NULL AND proposed_window_end IS NULL)
    ),
    CONSTRAINT confirmation_resolution_consistent CHECK (
        (status = 'PENDING' AND resolved_at IS NULL)
        OR (status <> 'PENDING' AND resolved_at IS NOT NULL)
    ),
    CONSTRAINT confirmation_approval_consistent CHECK (
        status <> 'APPROVED' OR (requester_response = 'ACCEPTED' AND courier_response = 'ACCEPTED')
    ),
    CONSTRAINT confirmation_rejection_consistent CHECK (
        (status = 'REJECTED') = (requester_response = 'REJECTED' OR courier_response = 'REJECTED')
    )
);

CREATE INDEX orders_status_created_idx ON orders(status, created_at);
CREATE INDEX orders_requester_created_idx ON orders(requester_id, created_at);
CREATE INDEX orders_courier_created_idx ON orders(courier_id, created_at);
CREATE UNIQUE INDEX orders_one_active_courier_idx ON orders(courier_id)
    WHERE courier_id IS NOT NULL AND status IN ('ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED');
CREATE INDEX orders_expiry_idx ON orders(window_end)
    WHERE status IN ('PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS');
CREATE INDEX order_history_order_time_idx ON order_history(order_id, occurred_at);
CREATE INDEX order_confirmations_order_status_idx ON order_confirmations(order_id, status);
CREATE UNIQUE INDEX order_confirmations_one_pending_idx ON order_confirmations(order_id)
    WHERE status = 'PENDING';
