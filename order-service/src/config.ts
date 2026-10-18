/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated HTTP server configuration (Phase A). Database settings stay in db/config.ts.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Added Supplier and Credit Service settings (Phase B).
 * Author review: Reviewed in full.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
 * Scope: Added the Kafka broker list (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Added ORDER_SERVICE_KEY for Order's own /internal routes (Phase D).
 * Author review: Pending review by Zi Yi.
 */

export interface AppConfig {
  port: number;
  /** User Service public keys, used to verify every bearer token. */
  jwksUrl: URL;
  supplierUrl: string;
  creditUrl: string;
  /** Shared secret for Credit's /internal routes (Credit's CREDIT_SERVICE_KEY). */
  creditServiceKey: string;
  /** Kafka bootstrap servers, for credit.commands and order.events. */
  kafkaBrokers: string[];
  /** Shared secret other services send to Order's /internal routes. */
  serviceKey: string;
}

/** As for Credit's key: long enough that guessing it is hopeless. */
const MIN_SERVICE_KEY_LENGTH = 32;

function httpUrl(env: NodeJS.ProcessEnv, name: string): URL {
  const raw = env[name]?.trim();
  if (!raw) throw new Error(`Missing ${name}`);
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use HTTP(S)`);
  return url;
}

export function appConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.ORDER_PORT?.trim() || '3005';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('Invalid ORDER_PORT');
  }
  const creditServiceKey = env.ORDER_CREDIT_SERVICE_KEY?.trim();
  if (!creditServiceKey) throw new Error('Missing ORDER_CREDIT_SERVICE_KEY');
  const kafkaBrokers = (env.ORDER_KAFKA_BROKERS ?? '').split(',').map((b) => b.trim()).filter(Boolean);
  if (kafkaBrokers.length === 0) throw new Error('Missing ORDER_KAFKA_BROKERS');
  const serviceKey = env.ORDER_SERVICE_KEY?.trim() ?? '';
  if (serviceKey.length < MIN_SERVICE_KEY_LENGTH) {
    throw new Error(`ORDER_SERVICE_KEY must be at least ${MIN_SERVICE_KEY_LENGTH} characters`);
  }
  // Base URLs without a trailing slash, so clients can append paths.
  const base = (name: string) => httpUrl(env, name).href.replace(/\/$/, '');
  return {
    port: Number(rawPort),
    jwksUrl: httpUrl(env, 'ORDER_JWKS_URL'),
    supplierUrl: base('ORDER_SUPPLIER_URL'),
    creditUrl: base('ORDER_CREDIT_URL'),
    creditServiceKey,
    kafkaBrokers,
    serviceKey,
  };
}
