-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
-- Scope: Transcribed the team's schema from user-service/AGENTS.md into the first migration.
-- Author review: Read in full; verified every column against AGENTS.md §Schema and applied the migration to PostgreSQL 17.
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
-- Scope: Added the user_events outbox table and its partial index (issue #72). Zi Yi chose an outbox
--        table, added to this migration instead of a new one.
-- Author review: Reviewed by Zi Yi, 2026-10-20.
--
-- Keep in sync with the "Schema" section of user-service/AGENTS.md.

CREATE TYPE user_role   AS ENUM ('USER', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'DEACTIVATED', 'SUSPENDED');
-- SUSPENDED is set only by POST /admin/users/:userId/suspend.

CREATE TABLE users (
    id                UUID         PRIMARY KEY,                  -- generated at register, before the row exists
    display_name      VARCHAR(100) NOT NULL,
    email_hash        CHAR(64)     NOT NULL UNIQUE,              -- HMAC-SHA256 of the normalised email (U1.1.3)
    email_encrypted   BYTEA        NOT NULL,                     -- AES-256-GCM: iv + tag + ciphertext (U1.2.2)
    country_code      VARCHAR(5),                                -- e.g. '+65'; NULL only for the bootstrap admin
    mobile_encrypted  BYTEA,                                     -- AES-256-GCM (U1.2.3); NULL only for the bootstrap admin
    password_hash     VARCHAR(100),                              -- bcrypt (U1.2.1); NULL only for the bootstrap admin before activation
    role              user_role    NOT NULL DEFAULT 'USER',
    status            user_status  NOT NULL DEFAULT 'ACTIVE',
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deactivated_at    TIMESTAMPTZ                                -- cleared on reactivation
);

CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id),
    token_hash  CHAR(64)    NOT NULL UNIQUE,                     -- SHA-256 of the token
    expires_at  TIMESTAMPTZ NOT NULL,                            -- created + REFRESH_TOKEN_TTL_SECONDS
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);

-- Outbox for the user.events topic: a row is written in the same transaction as the change it
-- reports, and UserEventsPublisher sends it to Kafka and sets published_at. id is the event's
-- eventId, so a resend after a crash carries the same id.
CREATE TABLE user_events (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type          TEXT        NOT NULL,                          -- e.g. 'UserSuspended'
    user_id       UUID        NOT NULL REFERENCES users(id),     -- also the Kafka message key
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at  TIMESTAMPTZ                                    -- NULL until Kafka has stored it
);

-- Serves the publisher's "oldest unpublished first" query.
CREATE INDEX idx_user_events_unpublished ON user_events (occurred_at) WHERE published_at IS NULL;
