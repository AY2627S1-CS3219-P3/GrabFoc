-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
-- Scope: Transcribed the team's schema from user-service/AGENTS.md into the first migration.
-- Author review: Read in full; verified every column against AGENTS.md §Schema and applied the migration to PostgreSQL 17.
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
-- Scope: Updated the SUSPENDED comment (#72).
-- Author review: Reviewed by Zi Yi, 2026-10-20.
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
-- Scope: Suspension reason and time columns, the login_outcome enum and login_events (#180,
--   docs/admin-dashboard-plan.md §4.1). Edited in place: reset user-db once to apply it.
-- Author review: Reviewed and approved by Zi Yi (User Service owner), 2026-11-05.
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
-- Scope: Noted that 003_admin_dashboard.sql repeats #180's objects for older databases.
-- Author review: Pending review by Deanson / Zi Yi (User Service owners).
--
-- Keep in sync with the "Schema" section of user-service/AGENTS.md. #180's objects (the two
-- suspension columns, login_outcome and login_events) are repeated in 003_admin_dashboard.sql,
-- which adds them to a database created before #180: change both together.

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
    deactivated_at    TIMESTAMPTZ,                               -- cleared on reactivation
    suspension_reason TEXT,                                      -- set by suspend, cleared on reactivation
    suspended_at      TIMESTAMPTZ                                -- same
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

-- One row per login attempt on an existing account (#180). Unknown emails and attempts while
-- the address is already locked are not recorded.
CREATE TYPE login_outcome AS ENUM ('SUCCESS', 'WRONG_PASSWORD', 'LOCKED', 'SUSPENDED', 'DEACTIVATED');

CREATE TABLE login_events (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID          NOT NULL REFERENCES users(id),
    outcome     login_outcome NOT NULL,                        -- LOCKED = the wrong password that started a lock
    occurred_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_events_time      ON login_events (occurred_at);
CREATE INDEX idx_login_events_user_time ON login_events (user_id, occurred_at);
