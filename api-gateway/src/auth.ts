/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added gateway verification of User Service bearer JWTs; distinguished JWKS outages from invalid tokens on 2026-09-28.
Author review: Jie Yang reviewed this file; User Service signing contract confirmation remains pending.
*/
import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';
import type { Config } from './config.js';

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string; kty?: string };

export class JwksUnavailableError extends Error {}

function decodePart(value: string): unknown {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// AI-generated (reviewed by Jie Yang)
export function createTokenVerifier(config: Config, get = fetch) {
  let cached: { keys: Jwk[]; expiresAt: number } | undefined;

  async function keys(): Promise<Jwk[]> {
    if (cached && cached.expiresAt > Date.now()) return cached.keys;
    const response = await get(config.jwksUrl, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error('JWKS unavailable');
    const body: unknown = await response.json();
    if (!object(body) || !Array.isArray(body.keys)) throw new Error('Invalid JWKS');
    const result = body.keys.filter(object) as Jwk[];
    cached = { keys: result, expiresAt: Date.now() + 60_000 };
    return result;
  }

  return async (authorization: string | undefined): Promise<boolean> => {
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization ?? '');
    if (!match) return false;
    const parts = match[1].split('.');
    if (parts.length !== 3) return false;
    try {
      const header = decodePart(parts[0]);
      const claims = decodePart(parts[1]);
      if (!object(header) || !object(claims) || typeof header.kid !== 'string') return false;
      const alg = header.alg;
      if (alg !== 'RS256' && alg !== 'ES256') return false;
      if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) return false;
      if (typeof claims.nbf === 'number' && claims.nbf > Math.floor(Date.now() / 1000)) return false;
      if (config.jwtIssuer && claims.iss !== config.jwtIssuer) return false;
      if (config.jwtAudience && claims.aud !== config.jwtAudience && !(Array.isArray(claims.aud) && claims.aud.includes(config.jwtAudience))) return false;
      let availableKeys: Jwk[];
      try {
        availableKeys = await keys();
      } catch {
        throw new JwksUnavailableError('JWKS unavailable');
      }
      const key = availableKeys.find((entry) => entry.kid === header.kid && (!entry.alg || entry.alg === alg) && (!entry.use || entry.use === 'sig') && entry.kty === (alg === 'RS256' ? 'RSA' : 'EC'));
      if (!key) return false;
      const publicKey = createPublicKey({ key, format: 'jwk' });
      return verifySignature('sha256', Buffer.from(`${parts[0]}.${parts[1]}`),
        alg === 'ES256' ? { key: publicKey, dsaEncoding: 'ieee-p1363' } : publicKey,
        Buffer.from(parts[2], 'base64url'));
    } catch (error) {
      if (error instanceof JwksUnavailableError) throw error;
      return false;
    }
  };
}
