/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Transcribed the team's schema from supplier-service/AGENTS.md into SQL run at startup;
 *        added IF NOT EXISTS / ON CONFLICT DO NOTHING so it can run on every start.
 * Author review: pending — to be completed by the reviewing team member.
 */

// Keep in sync with the "Schema" section of supplier-service/AGENTS.md.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS location_types (
    type  TEXT PRIMARY KEY
);
INSERT INTO location_types (type) VALUES ('Food'), ('Food/Coffee'), ('Printing'), ('Shopping')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS locations (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           TEXT NOT NULL CHECK (char_length(name) <= 100),
    type           TEXT NOT NULL REFERENCES location_types(type),
    building       TEXT NOT NULL,
    floor          INTEGER NOT NULL,
    location_desc  TEXT NOT NULL,
    lat            NUMERIC(11,9) NOT NULL,
    lon            NUMERIC(12,9) NOT NULL,
    open_min       SMALLINT CHECK (open_min BETWEEN 0 AND 1439),
    close_min      SMALLINT CHECK (close_min BETWEEN 0 AND 1439),
    image_url      TEXT CHECK (image_url IS NULL OR image_url ~* '^https?://'),
    status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    version        INT  NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_active_name
    ON locations (lower(name)) WHERE status = 'ACTIVE';
`;
