/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Wrote the SQL for the schema in credit-service/AGENTS.md (one hold per order, available
 *        and reserved balances with CHECK >= 0), run with IF NOT EXISTS on every start.
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
`;
