/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the schema SQL from the table Cole Lin approved in chat on 2026-10-16, run at
 *        startup like supplier-service/src/db/schema.ts.
 * Author review: Cole Lin, read and approved.
 */

// AI-generated (reviewed by Cole Lin).

// Keep in sync with the "Schema" section of logging-service/AGENTS.md.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS log_lines (
    -- Minted once by the producer and shared by the stdout line and the Kafka message. Kafka is
    -- at-least-once, so the primary key is what makes a redelivered line a no-op instead of a
    -- second row (INSERT ... ON CONFLICT DO NOTHING).
    line_id      UUID PRIMARY KEY,
    -- When the event happened, as the emitting service saw it.
    ts           TIMESTAMPTZ NOT NULL,
    -- When this store received it. The gap is broker lag; a negative gap is clock skew.
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    service      TEXT NOT NULL,
    level        TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    event        TEXT NOT NULL,
    request_id   TEXT,
    user_id      TEXT,
    role         TEXT CHECK (role IS NULL OR role IN ('ADMIN', 'USER')),
    method       TEXT,
    path         TEXT,
    status       SMALLINT CHECK (status IS NULL OR status BETWEEN 100 AND 599),
    duration_ms  INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    -- Whatever else the event carried. Never credentials or personal data (root AGENTS.md).
    extra        JSONB
);

-- Following one request across services is the whole point, so this is the index that matters.
CREATE INDEX IF NOT EXISTS ix_log_lines_request ON log_lines (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_log_lines_ts ON log_lines (ts DESC);
CREATE INDEX IF NOT EXISTS ix_log_lines_service_event ON log_lines (service, event, ts DESC);
CREATE INDEX IF NOT EXISTS ix_log_lines_user ON log_lines (user_id, ts DESC) WHERE user_id IS NOT NULL;
`;
