/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated a stub User Service JWKS endpoint and token signer for tests.
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type KeyLike } from 'jose';

export interface JwksStub {
  url: string;
  /** Status the endpoint returns; set to 500 to simulate an outage. */
  status: number;
  sign(claims?: Record<string, unknown>, options?: { expiresIn?: string; key?: KeyLike }): Promise<string>;
  stop(): Promise<void>;
}

export async function startJwksStub(): Promise<JwksStub> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const server = createServer((_req, res) => {
    res.writeHead(stub.status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const stub: JwksStub = {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/.well-known/jwks.json`,
    status: 200,
    sign: ({ sub, ...claims } = {}, { expiresIn = '10m', key = privateKey } = {}) =>
      new SignJWT({ role: 'USER', ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject(String(sub ?? '00000000-0000-4000-8000-000000000001'))
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key),
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
  return stub;
}
