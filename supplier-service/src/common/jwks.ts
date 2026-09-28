/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-28
 * Scope: Generated JWKS fetching/caching and RS256/ES256 token verification with node:crypto,
 *        following the same checks as api-gateway/src/auth.ts (team decision: every service
 *        verifies the forwarded token itself).
 * Author review: pending — to be completed by the reviewing team member.
 */
import { createPublicKey, verify as verifySignature, type JsonWebKey, type KeyObject } from 'crypto';
import { config } from '../config';

/** Thrown when the User Service's JWKS cannot be reached, so a token can't be judged either way. */
export class JwksUnavailableError extends Error {}

export interface TokenClaims {
  sub: string;
  role: string;
}

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string; kty?: string };

const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_REFETCH_MS = 30 * 1000; // don't hammer the User Service when a kid is unknown

let cachedKeys: Jwk[] = [];
let cachedAt = 0;

function decodePart(part: string): unknown {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function fetchKeys(): Promise<Jwk[]> {
  if (!config.jwksUrl) {
    // Only reachable in dev-auth mode: a token arrived but there is nowhere to check it.
    throw new JwksUnavailableError('SUPPLIER_JWKS_URL is not set, so tokens cannot be verified');
  }
  let response: Response;
  try {
    response = await fetch(config.jwksUrl, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new JwksUnavailableError(`Could not reach ${config.jwksUrl}: ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new JwksUnavailableError(`${config.jwksUrl} returned ${response.status}`);
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  if (!Array.isArray(body.keys)) throw new JwksUnavailableError('JWKS response has no keys array');
  cachedKeys = body.keys;
  cachedAt = Date.now();
  return cachedKeys;
}

async function keysFor(kid: string): Promise<Jwk | undefined> {
  const fresh = Date.now() - cachedAt < CACHE_TTL_MS;
  if (!fresh || !cachedKeys.length) await fetchKeys();

  let key = cachedKeys.find((k) => k.kid === kid);
  // Unknown kid: the User Service may have rotated its key, so refetch (rate-limited).
  if (!key && Date.now() - cachedAt > MIN_REFETCH_MS) {
    await fetchKeys();
    key = cachedKeys.find((k) => k.kid === kid);
  }
  return key;
}

/**
 * Verify a bearer token and return its claims, or null if it is missing, malformed, expired,
 * signed with an unknown key or fails any configured issuer/audience check.
 * Throws JwksUnavailableError when the keys cannot be fetched at all.
 */
export async function verifyToken(authorization: string | undefined): Promise<TokenClaims | null> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : undefined;
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (!isObject(header) || !isObject(claims) || typeof header.kid !== 'string') return null;

  const alg = header.alg;
  if (alg !== 'RS256' && alg !== 'ES256') return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
  if (typeof claims.nbf === 'number' && claims.nbf > now) return null;
  // Checked only when configured, matching the gateway.
  if (config.jwtIssuer && claims.iss !== config.jwtIssuer) return null;
  if (config.jwtAudience) {
    const aud = claims.aud;
    const ok = aud === config.jwtAudience || (Array.isArray(aud) && aud.includes(config.jwtAudience));
    if (!ok) return null;
  }

  const jwk = await keysFor(header.kid);
  if (!jwk || (jwk.alg && jwk.alg !== alg) || (jwk.use && jwk.use !== 'sig')) return null;

  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return null;
  }

  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], 'base64url');
  const valid = verifySignature(
    'sha256',
    signed,
    alg === 'ES256' ? { key: publicKey, dsaEncoding: 'ieee-p1363' } : publicKey,
    signature,
  );
  if (!valid) return null;

  if (typeof claims.sub !== 'string' || typeof claims.role !== 'string') return null;
  return { sub: claims.sub, role: claims.role };
}

/** Test seam: forget cached keys. */
export function resetJwksCache(): void {
  cachedKeys = [];
  cachedAt = 0;
}
