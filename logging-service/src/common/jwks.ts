/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Copied from supplier-service/src/common/jwks.ts, with the environment prefix changed to
 *        LOGGING_. This repository has no shared package, so common code is copied, not imported;
 *        a fix to token verification has to be applied in every copy.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Treat an empty or malformed key set as unavailable (PR #129 review).
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: A key has to carry the fields this service reads, not merely be an object
 *        (PR #145 review).
 * Author review: Cole Lin, read and approved.
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
// When an unknown kid last triggered a refetch. Separate from cachedAt: a rotation seconds after
// an ordinary fetch would otherwise be blocked by the rate limit and answer 401 until it expired
// (PR #129 review).
let lastMissAt = 0;
// The fetch in progress, shared so concurrent requests trigger one JWKS request, not one each.
let inflight: Promise<Jwk[]> | undefined;

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

/**
 * A key this service can actually use: it must have a `kid` to be found by, and it must **import**.
 *
 * Checking the identifiers is not enough. `{ "kid": "active", "kty": "RSA" }` has no `n` or `e`, so
 * it passes any shape test, gets cached, and then fails in `createPublicKey` at verify time — which
 * returns null, so the guard says 401 and blames a valid caller's token for a broken key service
 * (PR #129 review). Importing here, once per fetch and behind a five-minute cache, is the only
 * check that means anything.
 */
function isUsableKey(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const { kid, use, alg } = value as { kid?: unknown; use?: unknown; alg?: unknown };
  if (typeof kid !== 'string' || kid === '') return false;
  // The same restrictions verifyToken applies when it picks a key. Without them a set holding only
  // an encryption key, or one for an algorithm we do not accept, counted as "usable" - so the
  // service started happily and then answered 401 to a cryptographically valid admin token, which
  // is the opposite of what the 503 is for (PR #129 review).
  if (use !== undefined && use !== 'sig') return false;
  if (alg !== undefined && alg !== 'RS256' && alg !== 'ES256') return false;
  try {
    createPublicKey({ key: value as JsonWebKey, format: 'jwk' });
    return true;
  } catch {
    return false;
  }
}

async function fetchKeys(): Promise<Jwk[]> {
  const url = config.jwksUrl;
  // Unset only in dev-auth mode, where a bearer token still can't be accepted unverified.
  if (!url) throw new JwksUnavailableError('LOGGING_JWKS_URL is not set');
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new JwksUnavailableError(`Could not reach ${url}: ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new JwksUnavailableError(`${url} returned ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new JwksUnavailableError(`${url} did not return valid JSON`);
  }
  if (!isObject(body) || !Array.isArray(body.keys)) {
    throw new JwksUnavailableError('JWKS response has no keys array');
  }
  // An empty array, or one holding anything that is not an object, is a key set this service
  // cannot use. Accepting it answers 401 to a valid administrator - saying their token is bad when
  // the truth is that we cannot check it - and leaves the cache empty, so every later request
  // refetches. A non-object entry is worse: reading it produces a 500. 503 is the honest answer,
  // and it matches the gateway (api-gateway/envoy/behaviour-differences.md). PR #129 review.
  // Filtered, not rejected: a key set with one good key and one junk entry should keep
  // working. Same approach as credit-service/src/common/jwks.ts, which got here first. A 200
  // with nothing usable in it is as unusable as an error, so 503 rather than blaming a valid
  // caller's token with a 401 (PR #145 review).
  const usable = body.keys.filter(isUsableKey);
  if (!usable.length) {
    throw new JwksUnavailableError(`${url} returned no usable keys`);
  }
  cachedKeys = usable as Jwk[];
  cachedAt = Date.now();
  return cachedKeys;
}

// AI-generated by Claude Code (plan approved by Jian Bing)
function refreshKeys(): Promise<Jwk[]> {
  inflight ??= fetchKeys().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

async function keysFor(kid: string): Promise<Jwk | undefined> {
  const fresh = Date.now() - cachedAt < CACHE_TTL_MS;
  // Whether this call has already been to the endpoint. Without it, a cold or expired cache
  // fetched here and then, on an unknown kid, fetched the identical set again - double the JWKS
  // traffic on exactly the requests that are already failing, and a second fetch that happens to
  // fail turns an honest 401 into a 503 (PR #157 review).
  let justRefreshed = false;
  if (!fresh || !cachedKeys.length) {
    await refreshKeys();
    justRefreshed = true;
  }

  let key = cachedKeys.find((k) => k.kid === kid);
  if (!key) {
    if (justRefreshed) {
      // The fetch above is the endpoint's own answer about this kid, so it spends the allowance
      // too. Skipping the branch without recording the miss left the gate open on the *next*
      // request: a cold cache plus an unknown kid meant one JWKS request per incoming request for
      // as long as the invalid tokens kept arriving - the opposite of the limit this constant
      // documents (PR #157 review, same code as the Supplier Service's copy).
      lastMissAt = Date.now();
    } else if (Date.now() - lastMissAt > MIN_REFETCH_MS) {
      // Unknown kid: the User Service may have rotated its key, so refetch (rate-limited).
      await refreshKeys();
      // Recorded only once the endpoint has answered. Set before the call, one failed refresh
      // turned into 401s from the stale cache for the next MIN_REFETCH_MS even after the
      // endpoint came back - and a 401 says the administrator's token is bad, which is a lie.
      // A refresh that throws propagates as 503 instead, and concurrent requests share one
      // in-flight fetch, so not recording the miss here cannot become a storm (PR #129 review).
      lastMissAt = Date.now();
      key = cachedKeys.find((k) => k.kid === kid);
    }
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
  lastMissAt = 0;
  inflight = undefined;
}
