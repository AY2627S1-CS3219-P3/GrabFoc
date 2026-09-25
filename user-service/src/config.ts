/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated environment loading and validation, including the base64 key checks.
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
/** A base64 secret that must decode to exactly `bytes` bytes. */
const base64Key = (bytes: number) =>
  z
    .string()
    .min(1, `required; generate one with: openssl rand -base64 ${bytes}`)
    .refine((value) => Buffer.from(value, 'base64').length === bytes, {
      message: `must be exactly ${bytes} bytes of base64 (openssl rand -base64 ${bytes})`,
    });

const EnvSchema = z.object({
  USER_PORT: z.coerce.number().int().positive().default(3001),
  USER_DATABASE_URL: z
    .string()
    .min(1, 'required, e.g. postgres://foc:<password>@localhost:5432/users'),
  LOG_LEVEL: z.enum(['debug', 'verbose', 'log', 'warn', 'error']).default('log'),

  // A separate key per purpose, so compromising one does not compromise the others
  // (AGENTS.md, "Credential and personal-data storage"). A wrong-length AES key would
  // otherwise only fail on the first registration, so it is checked here at boot.
  USER_AES_KEY: base64Key(32),
  USER_EMAIL_HMAC_KEY: base64Key(32),
  USER_OTP_HMAC_KEY: base64Key(32),

  // The RS256 signing key, as a PKCS#8 PEM that has been base64-encoded so it fits on one
  // line. A PEM pasted raw into a .env file spans many lines, which neither the .env parser
  // nor compose handles reliably. Decoded in src/auth/jwt.service.ts and nowhere else.
  USER_JWT_PRIVATE_KEY: z
    .string()
    .min(1, 'required; see the README for how to generate a key pair')
    .refine((v) => Buffer.from(v, 'base64').toString('utf8').includes('BEGIN PRIVATE KEY'), {
      message: 'must be a base64-encoded PKCS#8 PEM (openssl genpkey ... | base64)',
    }),
  // Names the key in the JWKS and in each token's `kid` header, so the key can be rotated
  // without every service rejecting tokens signed by the previous one.
  USER_JWT_KID: z.string().min(1, 'required; any stable identifier, e.g. a date like 2026-09'),
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
  // Decoded once. Nothing outside src/crypto should read these.
  aesKey: Buffer.from(parsed.data.USER_AES_KEY, 'base64'),
  emailHmacKey: Buffer.from(parsed.data.USER_EMAIL_HMAC_KEY, 'base64'),
  otpHmacKey: Buffer.from(parsed.data.USER_OTP_HMAC_KEY, 'base64'),
  jwtPrivateKeyPem: Buffer.from(parsed.data.USER_JWT_PRIVATE_KEY, 'base64').toString('utf8'),
  jwtKid: parsed.data.USER_JWT_KID,
};
