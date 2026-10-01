/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated this test helper: a stub JWKS server and a token signer.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { generateKeyPairSync, KeyObject, sign } from 'crypto';

export type Alg = 'RS256' | 'ES256';

export interface SigningKey {
  kid: string;
  alg: Alg;
  privateKey: KeyObject;
  /** The public JWK as the User Service would publish it. */
  jwk: Record<string, unknown>;
}

export function makeKey(kid: string, alg: Alg = 'RS256'): SigningKey {
  const { privateKey, publicKey } =
    alg === 'RS256'
      ? generateKeyPairSync('rsa', { modulusLength: 2048 })
      : generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { kid, alg, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg, use: 'sig' } };
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A signed JWT. `header` and `claims` override the defaults, e.g. { alg: 'none' } or { exp: 0 }. */
export function signToken(
  key: SigningKey,
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: key.alg, kid: key.kid, ...header });
  const p = b64({ sub: 'user-1', role: 'USER', iat: now, exp: now + 600, ...claims });
  const signingInput = Buffer.from(`${h}.${p}`);
  const signature =
    key.alg === 'ES256'
      ? sign('sha256', signingInput, { key: key.privateKey, dsaEncoding: 'ieee-p1363' })
      : sign('sha256', signingInput, key.privateKey);
  return `${h}.${p}.${signature.toString('base64url')}`;
}

/** Stub JWKS endpoint. Set `respond` to change what it returns; `fetches` counts requests. */
export class JwksStub {
  fetches = 0;
  keys: SigningKey[] = [];
  respond: (() => { status: number; body: string }) | undefined;
  private server!: Server;

  get url(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/.well-known/jwks.json`;
  }

  async start(): Promise<void> {
    this.server = createServer((_req, res) => {
      this.fetches++;
      const reply = this.respond?.() ?? {
        status: 200,
        body: JSON.stringify({ keys: this.keys.map((k) => k.jwk) }),
      };
      res.writeHead(reply.status, { 'Content-Type': 'application/json' }).end(reply.body);
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
  }

  reset(keys: SigningKey[]): void {
    this.fetches = 0;
    this.keys = keys;
    this.respond = undefined;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
