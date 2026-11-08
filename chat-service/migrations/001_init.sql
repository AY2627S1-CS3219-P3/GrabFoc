-- AI Assistance Disclosure:
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
-- Scope: Copied the messages table from the chat plan
-- Author review: Reviewed by Deanson, 2026-11-09.

-- No foreign keys: orders and users live in other services.
CREATE TABLE messages (
  id            BIGSERIAL PRIMARY KEY,
  order_id      UUID NOT NULL,
  sender_id     UUID NOT NULL,
  client_msg_id TEXT NOT NULL,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON messages (order_id, id);

-- A retried send can't create a second row
CREATE UNIQUE INDEX ON messages (order_id, sender_id, client_msg_id);
