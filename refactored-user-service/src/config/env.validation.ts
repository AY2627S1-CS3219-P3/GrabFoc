/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/config.ts (original disclosure: Claude Code, Claude Opus 5,
 *   2026-09-25) into a validate() for @nestjs/config's ConfigModule. Same schema and env names.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { z } from 'zod';

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
  USER_DATABASE_URL: z.string().min(1, 'required, e.g. postgres://foc:<password>@localhost:5432/users'),
  LOG_LEVEL: z.enum(['debug', 'verbose', 'log', 'warn', 'error']).default('log'),

  // One key per purpose, so leaking one does not leak the others. Checked at boot, so a
  // wrong-length key fails here and not on the first registration.
  USER_AES_KEY: base64Key(32),
  USER_EMAIL_HMAC_KEY: base64Key(32),
  USER_OTP_HMAC_KEY: base64Key(32),

  // RS256 signing key: a PKCS#8 PEM, base64-encoded so it fits on one .env line.
  USER_JWT_PRIVATE_KEY: z
    .string()
    .min(1, 'required; see the README for how to generate a key pair')
    .refine((v) => Buffer.from(v, 'base64').toString('utf8').includes('BEGIN PRIVATE KEY'), {
      message: 'must be a base64-encoded PKCS#8 PEM (openssl genpkey ... | base64)',
    }),
  // Names the key in the JWKS and in each token's `kid` header, so the key can be rotated.
  USER_JWT_KID: z.string().min(1, 'required; any stable identifier, e.g. a date like 2026-09'),

  USER_REDIS_URL: z.string().min(1, 'required, e.g. redis://localhost:6379'),

  // Mailpit in development accepts anything, so the credentials are optional.
  USER_SMTP_HOST: z.string().min(1, 'required, e.g. mailpit in compose or localhost'),
  USER_SMTP_PORT: z.coerce.number().int().positive().default(1025),
  USER_SMTP_USER: z.string().optional(),
  USER_SMTP_PASS: z.string().optional(),
  USER_SMTP_FROM: z.string().min(1).default('FoC <no-reply@foc.local>'),

  // Becomes the first ADMIN while `users` is empty. Validated as an NUS address by
  // UsersService at startup, with the same EmailSchema the endpoints use.
  USER_BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
});

export type LogLevelName = z.infer<typeof EnvSchema>['LOG_LEVEL'];

/** The decoded config, read with `ConfigService<AppConfig, true>`. */
export interface AppConfig {
  port: number;
  databaseUrl: string;
  logLevel: LogLevelName;
  aesKey: Buffer;
  emailHmacKey: Buffer;
  otpHmacKey: Buffer;
  jwtPrivateKeyPem: string;
  jwtKid: string;
  redisUrl: string;
  smtp: { host: string; port: number; user?: string; pass?: string; from: string };
  bootstrapAdminEmail?: string;
}

/**
 * Passed to `ConfigModule.forRoot({ validate })`, and called directly by migrate-cli.ts.
 * Throws at startup, naming every bad variable, rather than failing on the first request.
 */
export function validate(raw: Record<string, unknown>): AppConfig {
  // `.env.example` ships every variable empty, so treat "" as unset and let defaults apply.
  const present = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''),
  );

  const parsed = EnvSchema.safeParse(present);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment (see .env.example):\n${problems.join('\n')}`);
  }

  const env = parsed.data;
  return {
    port: env.USER_PORT,
    databaseUrl: env.USER_DATABASE_URL,
    logLevel: env.LOG_LEVEL,
    aesKey: Buffer.from(env.USER_AES_KEY, 'base64'),
    emailHmacKey: Buffer.from(env.USER_EMAIL_HMAC_KEY, 'base64'),
    otpHmacKey: Buffer.from(env.USER_OTP_HMAC_KEY, 'base64'),
    jwtPrivateKeyPem: Buffer.from(env.USER_JWT_PRIVATE_KEY, 'base64').toString('utf8'),
    jwtKid: env.USER_JWT_KID,
    redisUrl: env.USER_REDIS_URL,
    smtp: {
      host: env.USER_SMTP_HOST,
      port: env.USER_SMTP_PORT,
      user: env.USER_SMTP_USER,
      pass: env.USER_SMTP_PASS,
      from: env.USER_SMTP_FROM,
    },
    bootstrapAdminEmail: env.USER_BOOTSTRAP_ADMIN_EMAIL,
  };
}
