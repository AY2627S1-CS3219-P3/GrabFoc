/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added validated runtime configuration for gateway routing and JWKS verification; aligned default port with service defaults on 2026-09-27.
Author review: Pending gateway owner review.
*/

// AI-generated (pending human review)
export type Config = {
  port: number;
  userServiceUrl: URL;
  supplierServiceUrl: URL;
  jwksUrl: URL;
  authPrefix: string;
  locationsPrefix: string;
  jwtIssuer?: string;
  jwtAudience?: string;
};

function serviceUrl(name: string, value: string | undefined): URL {
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use HTTP(S)`);
  if (url.search || url.hash || url.pathname !== '/') throw new Error(`${name} must be an origin`);
  return url;
}

function prefix(name: string, value: string): string {
  if (!/^\/[a-z0-9/-]+$/i.test(value) || (value.length > 1 && value.endsWith('/')))
    throw new Error(`${name} must be a path prefix without a trailing slash`);
  return value;
}

// AI-generated (pending human review)
export function loadConfig(env = process.env): Config {
  const port = Number(env.GATEWAY_PORT ?? '3003');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('GATEWAY_PORT is invalid');
  const userServiceUrl = serviceUrl('USER_SERVICE_URL', env.USER_SERVICE_URL);
  const supplierServiceUrl = serviceUrl('SUPPLIER_SERVICE_URL', env.SUPPLIER_SERVICE_URL);
  const jwksUrl = new URL(env.USER_SERVICE_JWKS_URL ?? '/.well-known/jwks.json', userServiceUrl);
  if (!['http:', 'https:'].includes(jwksUrl.protocol)) throw new Error('USER_SERVICE_JWKS_URL must use HTTP(S)');
  const authPrefix = prefix('GATEWAY_AUTH_PREFIX', env.GATEWAY_AUTH_PREFIX ?? '/auth');
  const locationsPrefix = prefix('GATEWAY_LOCATIONS_PREFIX', env.GATEWAY_LOCATIONS_PREFIX ?? '/locations');
  if (authPrefix === locationsPrefix || authPrefix.startsWith(`${locationsPrefix}/`) || locationsPrefix.startsWith(`${authPrefix}/`))
    throw new Error('Gateway route prefixes must not overlap');
  return {
    port, userServiceUrl, supplierServiceUrl, jwksUrl, authPrefix, locationsPrefix,
    jwtIssuer: env.GATEWAY_JWT_ISSUER || undefined,
    jwtAudience: env.GATEWAY_JWT_AUDIENCE || undefined,
  };
}
