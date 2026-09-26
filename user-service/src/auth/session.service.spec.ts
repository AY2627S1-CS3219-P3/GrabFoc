/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the session-issuance tests, including the assertion that the refresh token
 *        reaches the database only as a hash.
 * Author review: Read in full; the hash assertion was confirmed to fail when the plaintext
 *                token is written instead.
 */
import { Pool } from 'pg';
import { hashRefreshToken } from '../crypto';
import { UserRecord } from '../users/users.repository';
import { Role } from './caller';
import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service';
import { REFRESH_TOKEN_TTL_SECONDS, SessionService } from './session.service';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Alex Tan',
  role: Role.USER,
} as Pick<UserRecord, 'id' | 'displayName' | 'role'>;

function build() {
  const query = jest.fn<Promise<unknown>, [string, unknown[]]>(async () => ({ rows: [] }));
  const service = new SessionService(new JwtService(), { query } as unknown as Pool);
  return { service, query };
}

/** The parameters of the INSERT, i.e. everything that reaches `refresh_tokens`. */
const insertedParams = (query: ReturnType<typeof build>['query']) => query.mock.calls[0][1];

describe('issue', () => {
  it('returns a signed access token, a refresh token and the access token lifetime', async () => {
    const { service } = build();

    const session = await service.issue(USER);

    expect(session.accessToken.split('.')).toHaveLength(3);
    expect(session.refreshToken).toMatch(/^[\w-]{43}$/); // 32 bytes, base64url
    expect(session.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(session.user).toEqual({
      userId: USER.id,
      displayName: USER.displayName,
      role: Role.USER,
    });
  });

  it('carries the user id and role into the token, so other services need no callback', async () => {
    const { service } = build();
    const jwt = new JwtService();

    const session = await service.issue({ ...USER, role: Role.ADMIN });

    const claims = await jwt.verifyAccessToken(session.accessToken);
    expect(claims.sub).toBe(USER.id);
    expect(claims.role).toBe(Role.ADMIN);
  });

  it('stores only the SHA-256 of the refresh token, never the token itself', async () => {
    const { service, query } = build();

    const session = await service.issue(USER);

    const params = insertedParams(query);
    expect(params).not.toContain(session.refreshToken);
    expect(params).toContain(hashRefreshToken(session.refreshToken));
    // Anything that leaked the whole statement would leak the token with it.
    expect(JSON.stringify(query.mock.calls[0])).not.toContain(session.refreshToken);
  });

  it('gives each session its own row and its own token', async () => {
    const { service, query } = build();

    const first = await service.issue(USER);
    const second = await service.issue(USER);

    expect(first.refreshToken).not.toBe(second.refreshToken);
    expect(insertedParams(query)[0]).not.toBe(query.mock.calls[1][1][0]);
  });

  it('dates the row seven days out, computed by the database rather than by us', async () => {
    const { service, query } = build();

    await service.issue(USER);

    // `now() + make_interval(...)`: the expiry is measured against the database clock, so a
    // service container with a skewed clock cannot mint a token that outlives the policy.
    expect(query.mock.calls[0][0]).toContain('now() + make_interval');
    expect(insertedParams(query)).toContain(REFRESH_TOKEN_TTL_SECONDS);
  });
});
