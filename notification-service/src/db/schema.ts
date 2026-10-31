/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-01
 * Scope: Wrote the schema from the design agreed in #148 (#150). notification_dead_letters copies
 *        credit_dead_letters (credit-service/src/db/schema.ts).
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

-- Messages from notification.order-events.dlt, copied here so admins can inspect and replay them.
-- Same columns and keys as credit_dead_letters.
CREATE TABLE IF NOT EXISTS notification_dead_letters (
    id                BIGSERIAL PRIMARY KEY,
    event_id          UUID,                   -- null when the message was too malformed to read
    message_key       TEXT,                   -- the Kafka key: the orderId
    source_topic      TEXT NOT NULL,          -- where it came from: order.events
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
