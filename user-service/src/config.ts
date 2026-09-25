/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated environment loading and validation.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import * as path from 'path';
import { z } from 'zod';

// Load the repo-root .env if it exists (it is git-ignored). Real env vars take precedence,
// which is what lets compose.yaml point the service at the containers.
try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch {
  // no .env file: rely on the environment
}

/**
 * Only the variables this service reads TODAY are listed. Later Phase 0 steps add their own
 * (JWT keys in step 3; Redis and SMTP in step 4), so the service still starts while the
 * foundation is half-built. Every variable here also appears in the repo-root `.env.example`.
 */
const EnvSchema = z.object({
  USER_PORT: z.coerce.number().int().positive().default(3001),
  USER_DATABASE_URL: z
    .string()
    .min(1, 'required, e.g. postgres://foc:<password>@localhost:5432/users'),
  LOG_LEVEL: z.enum(['debug', 'verbose', 'log', 'warn', 'error']).default('log'),
});

// `.env.example` ships every variable with an empty value, so a half-filled `.env` would
// otherwise fail as `""` rather than fall back to the default. Treat empty as unset.
const present = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''),
);

const parsed = EnvSchema.safeParse(present);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  // Fail at startup, not on the first request that needs the value.
  throw new Error(`Invalid environment (see .env.example):\n${problems.join('\n')}`);
}

export const config = {
  port: parsed.data.USER_PORT,
  databaseUrl: parsed.data.USER_DATABASE_URL,
  logLevel: parsed.data.LOG_LEVEL,
};
