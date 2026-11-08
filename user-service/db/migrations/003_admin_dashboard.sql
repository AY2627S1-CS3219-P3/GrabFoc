-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
-- Scope: Adds #180's schema (written into 001_init.sql in place) to a database created before
--   #180, such as staging's user-db, so it no longer needs a reset.
-- Author review: Pending review by Deanson / Zi Yi (User Service owners).
--
-- #180 added these objects to 001_init.sql, which an existing database never re-runs. Each
-- statement adds only what is missing, so a database created after #180 is left unchanged.
-- Keep in step with 001_init.sql.

ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;        -- set by suspend, cleared on reactivation
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ;  -- same

-- CREATE TYPE has no IF NOT EXISTS form.
DO $$
BEGIN
    CREATE TYPE login_outcome AS ENUM ('SUCCESS', 'WRONG_PASSWORD', 'LOCKED', 'SUSPENDED', 'DEACTIVATED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS login_events (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID          NOT NULL REFERENCES users(id),
    outcome     login_outcome NOT NULL,                        -- LOCKED = the wrong password that started a lock
    occurred_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_events_time      ON login_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_login_events_user_time ON login_events (user_id, occurred_at);
