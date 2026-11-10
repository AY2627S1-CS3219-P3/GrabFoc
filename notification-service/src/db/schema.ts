/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Wrote the schema from the design agreed in #148 (#150). notification_dead_letters copies
 *        credit_dead_letters (credit-service/src/db/schema.ts).
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Added notification_account_emails for UserSuspended and UserReactivated (#183), as
 *        approved by Jie Yang on 2026-11-04.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added the OrderChangeRequest columns to notification_events (#186), as approved by
 *        Jie Yang on 2026-11-10.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added notification_events.confirmation_id and its partial index, so a proposal's
 *        resolution can supersede its unsent CREATED email (#186); asked for by Jie Yang in review.
 * Author review: pending — Jie Yang to record the review.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Added proposal_moot(): proposal emails follow the proposal's lifetime, not every state
 *        change (#186), as Jie Yang asked.
 * Author review: pending — Jie Yang to record the review.
 */

/**
 * Applied on every start (DatabaseLifecycle), as Credit does, so every statement is safe to run
 * again on an existing database.
 */
export const SCHEMA_SQL = `
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status' AND typnamespace = current_schema()::regnamespace) THEN
        CREATE TYPE order_status AS ENUM ('PENDING','ACCEPTED','PICKED_UP','IN_PROGRESS','ARRIVED','COMPLETED','CANCELLED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recipient_role' AND typnamespace = current_schema()::regnamespace) THEN
        CREATE TYPE recipient_role AS ENUM ('REQUESTER','COURIER');
    END IF;
END $$;

-- Position in the order lifecycle. Both final states rank 6, so neither counts as later than the
-- other: once one is handled, every later event for the order is stale (#148).
CREATE OR REPLACE FUNCTION order_status_rank(s order_status) RETURNS INT IMMUTABLE LANGUAGE SQL AS $fn$
    SELECT CASE s
        WHEN 'PENDING' THEN 0 WHEN 'ACCEPTED' THEN 1 WHEN 'PICKED_UP' THEN 2
        WHEN 'IN_PROGRESS' THEN 3 WHEN 'ARRIVED' THEN 4 ELSE 6
    END
$fn$;

-- Whether a proposal of this kind can no longer be answered once the order is in state s (#186):
-- the order has finished, or, for a timing change, the order has arrived (no window changes after
-- that). Moving through PICKED_UP or IN_PROGRESS leaves a proposal open, so its emails still matter.
CREATE OR REPLACE FUNCTION proposal_moot(s order_status, kind TEXT) RETURNS BOOLEAN IMMUTABLE LANGUAGE SQL AS $fn$
    SELECT order_status_rank(s) = 6 OR (kind = 'TIMING_CHANGE' AND order_status_rank(s) >= 4)
$fn$;

-- One row per order.events event. The insert (ON CONFLICT DO NOTHING) is the deduplication.
CREATE TABLE IF NOT EXISTS notification_events (
    event_id     UUID PRIMARY KEY,
    event_type   TEXT NOT NULL,
    order_id     UUID NOT NULL,
    requester_id UUID NOT NULL,
    courier_id   UUID,
    status       order_status NOT NULL,
    reason       TEXT,                    -- the cancellation reason code, shown in the CANCELLED email
    occurred_at  TIMESTAMPTZ NOT NULL,
    outcome      TEXT NOT NULL CHECK (outcome IN ('PROCESSING','HANDLED','DISCARDED_STALE','DISCARDED_NO_AUDIENCE')),
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at   TIMESTAMPTZ
);

-- OrderChangeRequest only (#186): what happened to the proposal, so its email can say what was
-- proposed. Added with ALTER so an existing database gets them on its next start.
ALTER TABLE notification_events
    ADD COLUMN IF NOT EXISTS change_outcome TEXT CHECK (change_outcome IN ('CREATED','APPROVED','REJECTED','EXPIRED')),
    ADD COLUMN IF NOT EXISTS change_kind TEXT CHECK (change_kind IN ('TIMING_CHANGE','CANCELLATION','COMPLETION')),
    ADD COLUMN IF NOT EXISTS proposed_by UUID,
    ADD COLUMN IF NOT EXISTS proposed_window_start TIMESTAMPTZ,  -- TIMING_CHANGE only
    ADD COLUMN IF NOT EXISTS proposed_window_end TIMESTAMPTZ,
    -- The proposal both of its events belong to, so its resolution can supersede the CREATED email
    -- (a resolution doesn't change the order's state, so the rank check can't see it).
    ADD COLUMN IF NOT EXISTS confirmation_id UUID;
CREATE INDEX IF NOT EXISTS notification_events_confirmation
    ON notification_events (confirmation_id) WHERE confirmation_id IS NOT NULL;

-- The last state handled for each order, for the stale check.
CREATE TABLE IF NOT EXISTS notification_order_states (
    order_id      UUID PRIMARY KEY,
    last_status   order_status NOT NULL,
    last_event_id UUID NOT NULL REFERENCES notification_events(event_id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per recipient per event, holding the send result. No email address or rendered body is
-- stored (AGENTS.md: "stores almost nothing").
CREATE TABLE IF NOT EXISTS notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES notification_events(event_id),
    role                recipient_role NOT NULL,
    recipient_id        UUID NOT NULL,
    delivery_status     TEXT NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING','SENT','FAILED')),
    attempts            INT NOT NULL DEFAULT 0,
    last_error          TEXT,
    provider_message_id TEXT,
    sent_at             TIMESTAMPTZ,
    UNIQUE (event_id, role)
);

-- One row per user.events event Notification emails about (#183), which is also the one email it
-- sends: to that user. The insert (ON CONFLICT DO NOTHING) is the deduplication. Same delivery columns
-- as notifications; no email address or rendered body.
CREATE TABLE IF NOT EXISTS notification_account_emails (
    event_id            UUID PRIMARY KEY,
    event_type          TEXT NOT NULL CHECK (event_type IN ('UserSuspended','UserReactivated')),
    user_id             UUID NOT NULL,
    previous_status     TEXT CHECK (previous_status IN ('SUSPENDED','DEACTIVATED')),  -- UserReactivated only
    occurred_at         TIMESTAMPTZ NOT NULL,
    delivery_status     TEXT NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING','SENT','FAILED')),
    attempts            INT NOT NULL DEFAULT 0,
    last_error          TEXT,                 -- also DISCARDED_OLD or SUPERSEDED, never sent
    provider_message_id TEXT,
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at             TIMESTAMPTZ
);
-- For "has a later account event for this user been handled?" (the superseded check).
CREATE INDEX IF NOT EXISTS notification_account_emails_user ON notification_account_emails (user_id, occurred_at);
-- Messages from the dead-letter topics (notification.order-events.dlt, notification.user-events.dlt), copied here so admins can inspect and replay them.
-- Same columns and keys as credit_dead_letters.
CREATE TABLE IF NOT EXISTS notification_dead_letters (
    id                BIGSERIAL PRIMARY KEY,
    event_id          UUID,                   -- null when the message was too malformed to read
    message_key       TEXT,                   -- the Kafka key: the orderId or userId
    source_topic      TEXT NOT NULL,          -- where it came from: order.events or user.events
    source_partition  INTEGER,                -- where the original message sat in source_topic,
    source_offset     BIGINT,                 -- which never changes, so a redelivery is one row
    message_type      TEXT,                   -- the event's eventType
    payload           BYTEA NOT NULL,         -- the exact bytes, which TEXT can't always hold (e.g. NUL)
    error             TEXT NOT NULL,
    error_code        TEXT,
    attempts          INTEGER NOT NULL CHECK (attempts > 0),
    dead_lettered_at  TIMESTAMPTZ NOT NULL,
    replay_claimed_at TIMESTAMPTZ,            -- a replay in progress (#154)
    replayed_at       TIMESTAMPTZ,            -- set once Kafka has accepted the replay (#154)
    UNIQUE (source_topic, event_id)
);

-- A message with no readable event id is recognised on redelivery by where it sat and what it said.
CREATE UNIQUE INDEX IF NOT EXISTS notification_dead_letters_source_message
    ON notification_dead_letters (source_topic, source_partition, source_offset, md5(payload));
`;
