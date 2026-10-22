-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
-- Scope: Wrote the outbox table from Deanson's design (columns, partial index, no failure columns).
-- Author review: pending — Deanson to record what he checked.
--
-- Transactional outbox: an event is written here in the same transaction as the change it
-- describes, and OutboxRelay publishes it to Kafka afterwards (user-service/AGENTS.md, "Events").
-- No backfill: users created before this migration get no UserRegistered.

CREATE TABLE outbox (
    id            UUID        PRIMARY KEY,                 -- also the event's eventId
    aggregate_id  UUID        NOT NULL,                    -- the user the event is about; the Kafka key
    event_type    TEXT        NOT NULL,                    -- e.g. 'UserRegistered'
    topic         TEXT        NOT NULL,                    -- e.g. 'user.events'
    payload       JSONB       NOT NULL,                    -- the message value, as sent
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at  TIMESTAMPTZ                              -- NULL = still to send
);

-- Keeps the relay's poll cheap however many published rows pile up.
CREATE INDEX idx_outbox_pending ON outbox (created_at) WHERE published_at IS NULL;
