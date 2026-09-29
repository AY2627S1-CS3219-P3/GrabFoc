/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the tests for issuing, rotating and revoking a session, including reuse
 *        detection and the reload that makes a demotion take effect.
 * Author review: Read in full; the hash, reuse and reload assertions were each confirmed to
 *                fail against a deliberately broken version of the service.
 */
import { Pool, PoolClient } from 'pg';
import { hashRefreshToken } from '../crypto';
import { UserRecord, UserStatus, UsersRepository } from '../users/users.repository';
import { Role } from './caller';
import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { REFRESH_TOKEN_TTL_SECONDS, SessionService } from './session.service';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Alex Tan',
  role: Role.USER,
  status: UserStatus.ACTIVE,
} as UserRecord;

function build(user: UserRecord | null = USER) {
  const statements: string[] = [];
  const client = {
    query: jest.fn<Promise<unknown>, [string]>(async (sql: string) => {
      statements.push(sql);
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  const pool = { connect: jest.fn(async () => client) };

  const users = {
    findById: jest.fn<Promise<UserRecord | null>, [string, PoolClient?]>(async () => user),
  };

  const refreshTokens = {
    create: jest.fn<Promise<void>, [string, string, number, PoolClient?]>(async () => undefined),
    revokeLive: jest.fn<Promise<{ userId: string } | null>, [string, PoolClient?]>(
      async () => ({ userId: USER.id }),
    ),
    findRevoked: jest.fn<Promise<{ userId: string } | null>, [string, PoolClient?]>(
      async () => null,
    ),
    revokeAllForUser: jest.fn<Promise<number>, [string, PoolClient?]>(async () => 2),
    revokeOwned: jest.fn<Promise<void>, [string, string, PoolClient?]>(async () => undefined),
  };

  const service = new SessionService(
    new JwtService(),
    users as unknown as UsersRepository,
    refreshTokens as unknown as RefreshTokensRepository,
    pool as unknown as Pool,
  );

  return { service, users, refreshTokens, statements, client };
}

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
    const { service, refreshTokens } = build();

    const session = await service.issue(USER);

    const [, storedHash, ttl] = refreshTokens.create.mock.calls[0];
    expect(storedHash).toBe(hashRefreshToken(session.refreshToken));
    expect(storedHash).not.toBe(session.refreshToken);
    expect(ttl).toBe(REFRESH_TOKEN_TTL_SECONDS);
  });

  it('gives each session its own token', async () => {
    const { service } = build();

    const first = await service.issue(USER);
    const second = await service.issue(USER);

    expect(first.refreshToken).not.toBe(second.refreshToken);
  });
});

describe('refresh', () => {
  it('revokes the presented token and returns a new pair', async () => {
    const { service, refreshTokens } = build();

    const rotated = await service.refresh('old-token');

    expect(refreshTokens.revokeLive.mock.calls[0][0]).toBe(hashRefreshToken('old-token'));
    expect(rotated.refreshToken).not.toBe('old-token');
    expect(rotated.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('omits the user block, which only register and login return', async () => {
    const { service } = build();

    const rotated = await service.refresh('old-token');

    expect(rotated).not.toHaveProperty('user');
  });

  it('rotates inside one transaction, so a failure leaves neither token', async () => {
    const { service, statements, client } = build();

    await service.refresh('old-token');

    expect(statements).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalled();
  });

  it('reloads the user and carries the CURRENT role, not the old one', async () => {
    // The entire mechanism by which a demotion takes effect: the caller's previous token said
    // ADMIN, and the next one must not.
    const { service, users } = build({ ...USER, role: Role.ADMIN });
    const jwt = new JwtService();

    const rotated = await service.refresh('old-token');

    expect(users.findById).toHaveBeenCalledWith(USER.id, expect.anything());
    expect((await jwt.verifyAccessToken(rotated.accessToken)).role).toBe(Role.ADMIN);
  });

  it.each([[UserStatus.DEACTIVATED], [UserStatus.SUSPENDED]])(
    'refuses a %s user and issues nothing',
    async (status) => {
      const { service, refreshTokens, statements } = build({ ...USER, status });

      await expect(service.refresh('old-token')).rejects.toMatchObject({ status: 401 });
      expect(refreshTokens.create).not.toHaveBeenCalled();
      // The presented token stays revoked: it was used, and an inactive user keeps no session.
      expect(statements).toEqual(['BEGIN', 'COMMIT']);
    },
  );

  it('refuses a token that was never issued, and revokes nothing', async () => {
    const { service, refreshTokens } = build();
    refreshTokens.revokeLive.mockResolvedValueOnce(null);

    await expect(service.refresh('nonsense')).rejects.toMatchObject({ status: 401 });
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('answers identically for an unknown, an expired and a reused token', async () => {
    // Otherwise the response says which of the three happened, and a reused token in
    // particular would tell an attacker their stolen copy was the real thing.
    const unknown = await (async () => {
      const { service, refreshTokens } = build();
      refreshTokens.revokeLive.mockResolvedValueOnce(null);
      return service.refresh('a').catch((e) => e);
    })();
    const reused = await (async () => {
      const { service, refreshTokens } = build();
      refreshTokens.revokeLive.mockResolvedValueOnce(null);
      refreshTokens.findRevoked.mockResolvedValueOnce({ userId: USER.id });
      return service.refresh('b').catch((e) => e);
    })();
    const inactive = await (async () => {
      const { service } = build({ ...USER, status: UserStatus.DEACTIVATED });
      return service.refresh('c').catch((e) => e);
    })();

    for (const other of [reused, inactive]) {
      expect(other.getStatus()).toBe(unknown.getStatus());
      expect(other.code).toBe(unknown.code);
      expect(other.message).toBe(unknown.message);
    }
  });

  it('treats a token presented twice as theft and ends every session', async () => {
    const { service, refreshTokens } = build();
    refreshTokens.revokeLive.mockResolvedValueOnce(null);
    refreshTokens.findRevoked.mockResolvedValueOnce({ userId: USER.id });

    await expect(service.refresh('already-used')).rejects.toMatchObject({ status: 401 });

    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(USER.id, expect.anything());
  });

  it('commits the mass revoke rather than rolling it back with the rejection', async () => {
    // The throw happens inside the transaction, so the revoke must be committed separately or
    // it would be undone by the rollback and the stolen token would stay usable.
    const { service, statements, refreshTokens } = build();
    refreshTokens.revokeLive.mockResolvedValueOnce(null);
    refreshTokens.findRevoked.mockResolvedValueOnce({ userId: USER.id });

    await service.refresh('already-used').catch(() => undefined);

    expect(statements).toContain('COMMIT');
  });
});

describe('logout', () => {
  it('revokes the presented token, scoped to the caller', async () => {
    const { service, refreshTokens } = build();

    await service.logout('my-token', USER.id);

    expect(refreshTokens.revokeOwned).toHaveBeenCalledWith(hashRefreshToken('my-token'), USER.id);
  });

  it('never passes the token itself to the database layer', async () => {
    const { service, refreshTokens } = build();

    await service.logout('my-token', USER.id);

    expect(JSON.stringify(refreshTokens.revokeOwned.mock.calls)).not.toContain('my-token');
  });

  it('succeeds for a token that is unknown or already revoked', async () => {
    const { service } = build();

    await expect(service.logout('never-issued', USER.id)).resolves.toBeUndefined();
  });
});
