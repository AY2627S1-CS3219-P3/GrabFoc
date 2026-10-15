/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Wrote the SQL for the schema in credit-service/AGENTS.md (one hold per order, available
 *        and reserved balances with CHECK >= 0), run with IF NOT EXISTS on every start.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added credit_dead_letters (redesign spec §9.2; columns confirmed by Jian Bing).
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Added source_partition / source_offset and their unique key (PR #85 review; approved by
 *        Jian Bing).
 * Author review: pending — Jian Bing to record what he checked.
 */

/** Every new account starts with this many available credits (Backlog C1.1.1). */
export const STARTING_CREDITS = 10;

// Keep in sync with the "Schema" section of credit-service/AGENTS.md.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS credit_accounts (
    user_id     UUID PRIMARY KEY,
    available   INTEGER NOT NULL DEFAULT ${STARTING_CREDITS} CHECK (available >= 0),
    reserved    INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_holds (
    order_id      UUID PRIMARY KEY,
    requester_id  UUID NOT NULL REFERENCES credit_accounts(user_id),
    courier_id    UUID REFERENCES credit_accounts(user_id),
    amount        INTEGER NOT NULL CHECK (amount > 0),
    state         TEXT NOT NULL DEFAULT 'RESERVED'
                  CHECK (state IN ('RESERVED', 'TRANSFERRED', 'RELEASED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A courier is recorded exactly when the credits went to one.
    CHECK ((state = 'TRANSFERRED') = (courier_id IS NOT NULL))
);

-- Messages from Credit's dead-letter topics (spec §9.2, K3 and K11), copied here so admins can
-- inspect them and replay credit commands.
CREATE TABLE IF NOT EXISTS credit_dead_letters (
    id                BIGSERIAL PRIMARY KEY,
    event_id          UUID,                   -- null when the message was too malformed to read
    order_id          UUID,
    source_topic      TEXT NOT NULL,          -- where it came from: credit.commands or user.events
    source_partition  INTEGER,                -- where the original message sat in source_topic,
    source_offset     BIGINT,                 -- which never changes, so a redelivery is one row
    command_type      TEXT,                   -- the message's type field
    payload           TEXT NOT NULL,
    error             TEXT NOT NULL,
    error_code        TEXT,
    attempts          INTEGER NOT NULL CHECK (attempts > 0),
    dead_lettered_at  TIMESTAMPTZ NOT NULL,
    replayed_at       TIMESTAMPTZ,
    -- One row per message per source: a dead letter from user.events can never overwrite a
    -- credit command's row, even with the same event id (security review).
    UNIQUE (source_topic, event_id),
    -- A message with no readable event id is still the same message at the same position.
    UNIQUE (source_topic, source_partition, source_offset)
);
`;
