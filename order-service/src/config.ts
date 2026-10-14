/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated HTTP server configuration (Phase A). Database settings stay in db/config.ts.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */

export interface AppConfig {
  port: number;
  /** User Service public keys, used to verify every bearer token. */
  jwksUrl: URL;
}

export function appConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const rawPort = env.ORDER_PORT?.trim() || '3005';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('Invalid ORDER_PORT');
  }
  const rawJwks = env.ORDER_JWKS_URL?.trim();
  if (!rawJwks) throw new Error('Missing ORDER_JWKS_URL');
  const jwksUrl = new URL(rawJwks);
  if (!['http:', 'https:'].includes(jwksUrl.protocol)) throw new Error('ORDER_JWKS_URL must use HTTP(S)');
  return { port: Number(rawPort), jwksUrl };
}
