/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-28
 * Scope: Generated JWKS fetching/caching and RS256/ES256 token verification with node:crypto,
 *        following the same checks as api-gateway/src/auth.ts (team decision: every service
 *        verifies the forwarded token itself).
 * Author review (Cole Lin): Read in full; ran it with Postman and checked the 401 cases: expired token, unknown key and untrusted signature.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
 * Scope: Fixed PR #30 review findings: malformed or null JWKS bodies now raise
 *        JwksUnavailableError (503), concurrent refreshes share one fetch, and an unset
 *        SUPPLIER_JWKS_URL (dev-auth mode only) raises JwksUnavailableError.
 * Author review (Jian Bing): Approved the fix plan, then checked with Claude Code that the review
 *        threads were resolved and CI passed before approving and merging PR #30. The fixes were
 *        tested by Claude Code against a stub JWKS server (invalid and null bodies, 20 concurrent
 *        requests making one fetch).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Refuse an empty or malformed JWKS key set as unavailable, after the PR #129 review
 *        found it in the Logging Service's copy of this file.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: A key has to carry the fields this service reads, not merely be an object
 *        (PR #145 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: Apply the restrictions verifyToken applies when the key set is filtered, and give the
 *        unknown-kid refetch its own clock, recorded only after the endpoint answers.
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
// Separate from cachedAt: gating the unknown-kid refetch on the ordinary fetch time meant a key
// rotation seconds after a normal fetch was answered with 401 until that cache aged out.
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
 * A key this service can actually use: looked up by `kid` and imported by `createPublicKey`, which
 * needs `kty`. `{}` satisfies isObject, so an object-shaped but empty key set used to be cached -
 * and then a valid caller's kid was never found, so they got 401 instead of the 503 that says the
 * key service is unusable (PR #145 review).
 *
 * It also applies the two restrictions verifyToken applies, and tries the import rather than
 * inferring it from the fields: a key published for encryption, or for an alg we do not accept, is
 * importable and so passed this filter, and the set was cached as usable - and then verifyToken
 * refused the same key, answering 401 to a cryptographically valid administrator token. The filter
 * and the verifier cannot disagree about a key now (swept from the PR #129 review).
 */
function isUsableKey(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const { kid, kty, use, alg } = value as { kid?: unknown; kty?: unknown; use?: unknown; alg?: unknown };
  if (typeof kid !== 'string' || kid === '') return false;
  if (typeof kty !== 'string' || kty === '') return false;
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
  if (!url) throw new JwksUnavailableError('SUPPLIER_JWKS_URL is not set');
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
  // cannot use. Accepting it answers 401 to a valid caller - saying their token is bad when the
  // truth is that we cannot check it - and leaves the cache empty, so every later request
  // refetches. A non-object entry is worse: reading it produces a 500. 503 is the honest answer,
  // and it matches the gateway (api-gateway/envoy/behaviour-differences.md). Found by the PR #129
  // review of the Logging Service's copy of this file.
  // AI-generated (reviewed by Cole Lin).
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
  if (!fresh || !cachedKeys.length) await refreshKeys();

  let key = cachedKeys.find((k) => k.kid === kid);
  // Unknown kid: the User Service may have rotated its key, so refetch (rate-limited).
  if (!key && Date.now() - lastMissAt > MIN_REFETCH_MS) {
    await refreshKeys();
    // Recorded only once the endpoint has answered. Recorded before the call, one failed refresh
    // answered 401 from the stale cache for the next MIN_REFETCH_MS even after the endpoint came
    // back. A refresh that throws propagates as 503 instead, and refreshKeys() already shares one
    // in-flight fetch between concurrent callers, so this cannot become a storm.
    lastMissAt = Date.now();
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
  lastMissAt = 0;
  inflight = undefined;
}
