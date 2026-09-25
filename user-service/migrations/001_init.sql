-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
-- Scope: Transcribed the team's schema from user-service/AGENTS.md into the first migration.
-- Author review: Read in full; verified every column against AGENTS.md §Schema and applied the migration to PostgreSQL 17.
--
-- Keep in sync with the "Schema" section of user-service/AGENTS.md.

CREATE TYPE user_role   AS ENUM ('USER', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'DEACTIVATED', 'SUSPENDED');
-- Nothing sets SUSPENDED until the deferred status endpoint exists.

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
    expires_at  TIMESTAMPTZ NOT NULL,                            -- created + 7 days
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
