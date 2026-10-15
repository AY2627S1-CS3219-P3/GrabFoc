-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
-- Scope: Generated the AWAITING_CREDIT state, CREDIT_RESERVED history action and
--        credit_released_at column for the revised creation flow (Phase B).
-- Author review: Reviewed.

-- New orders wait in AWAITING_CREDIT (invisible to couriers) until Credit confirms the hold.
ALTER TABLE orders
    DROP CONSTRAINT orders_status_check,
    ADD CONSTRAINT orders_status_check CHECK (status IN
        ('AWAITING_CREDIT','PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')),
    DROP CONSTRAINT order_assignment_consistent,
    ADD CONSTRAINT order_assignment_consistent CHECK (
        (status IN ('AWAITING_CREDIT','PENDING') AND courier_id IS NULL)
        OR (status IN ('ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED') AND courier_id IS NOT NULL)
        OR status = 'CANCELLED'
    ),
    -- Set once Credit confirms the release; CANCELLED orders with NULL here are retried.
    ADD COLUMN credit_released_at TIMESTAMPTZ;

ALTER TABLE order_history
    DROP CONSTRAINT order_history_action_check,
    ADD CONSTRAINT order_history_action_check CHECK (action IN
        ('CREATED','CREDIT_RESERVED','EDITED','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')),
    DROP CONSTRAINT order_history_previous_status_check,
    ADD CONSTRAINT order_history_previous_status_check CHECK (previous_status IN
        ('AWAITING_CREDIT','PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED')),
    DROP CONSTRAINT order_history_new_status_check,
    ADD CONSTRAINT order_history_new_status_check CHECK (new_status IN
        ('AWAITING_CREDIT','PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED'));
