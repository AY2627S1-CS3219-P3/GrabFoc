/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated unit tests for the active-order deactivation guard (#71) and suspension with
 *        the UserSuspended outbox (#72), with the database, Redis, Kafka and Order stubbed.
 * Author review: Reviewed by Zi Yi, 2026-10-20.
 */
// AI-generated (reviewed by Zi Yi)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { OrderClient } from './order.client';
import { UserEventsPublisher, toUserEvent } from './user-events.publisher';
import { UsersService } from './users.service';

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const TARGET = 'bbbbbbbb-0000-4000-8000-000000000002';
const tx = { tag: 'tx' };

function user(id: string, role: Role, status = UserStatus.ACTIVE) {
  return { id, role, status, emailEncrypted: Buffer.from(''), mobileEncrypted: null, createdAt: new Date() };
}

function makeService(opts: { hasActiveOrders?: boolean; target?: ReturnType<typeof user> | null } = {}) {
  const rows = new Map<string, ReturnType<typeof user>>([[ADMIN, user(ADMIN, Role.ADMIN)]]);
  if (opts.target !== null) rows.set(TARGET, opts.target ?? user(TARGET, Role.USER));
  const users = {
    findById: vi.fn(async (id: string) => rows.get(id) ?? null),
    findByIdForUpdate: vi.fn(async (id: string) => rows.get(id) ?? null),
    selectActiveAdminIdsForUpdate: vi.fn(async () => [ADMIN]),
    listUsers: vi.fn(async () => [rows.get(ADMIN)]),
    suspend: vi.fn(),
    deactivate: vi.fn(),
    insertEvent: vi.fn(),
  };
  const db = { transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const redis = { verifyOtp: vi.fn(async () => ({ status: 'OK', record: {} })) };
  const otp = { decrypt: () => 'x@u.nus.edu', hash: () => 'h' };
  const tokens = { revokeAll: vi.fn() };
  const orders = { hasActiveOrders: vi.fn(async () => opts.hasActiveOrders ?? false) };
  const service = new UsersService(
    users as never,
    db as never,
    redis as never,
    {} as never,
    otp as never,
    tokens as never,
    orders as never,
    {} as never,
  );
  return { service, users, redis, tokens, orders };
}

describe('deactivation guard (#71)', () => {
  it('refuses a user with active orders before spending the code', async () => {
    const { service, redis, users } = makeService({ hasActiveOrders: true });
    await expect(service.deactivateSelf(TARGET, '123456')).rejects.toMatchObject({ code: 'HAS_ACTIVE_ORDERS' });
    expect(redis.verifyOtp).not.toHaveBeenCalled();
    expect(users.deactivate).not.toHaveBeenCalled();
  });

  it('refuses before mailing a DEACTIVATION code', async () => {
    const { service } = makeService({ hasActiveOrders: true });
    await expect(service.requestOtp(TARGET, 'DEACTIVATION' as never)).rejects.toMatchObject({
      code: 'HAS_ACTIVE_ORDERS',
    });
  });

  it('deactivates a user with no active orders', async () => {
    const { service, users, tokens } = makeService();
    await service.deactivateSelf(TARGET, '123456');
    expect(users.deactivate).toHaveBeenCalledWith(TARGET, tx);
    expect(tokens.revokeAll).toHaveBeenCalledWith(TARGET, tx);
  });
});

describe('OrderClient (#71)', () => {
  const config = { get: () => ({ url: 'http://order:3005', serviceKey: 'k'.repeat(32) }) };
  const client = new OrderClient(config as never);
  afterEach(() => vi.unstubAllGlobals());

  it('sends the service key and reads hasActiveOrders', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ userId: TARGET, hasActiveOrders: true })));
    vi.stubGlobal('fetch', fetch);
    expect(await client.hasActiveOrders(TARGET)).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      `http://order:3005/internal/orders/users/${TARGET}/active`,
      expect.objectContaining({ headers: { 'X-Service-Key': 'k'.repeat(32) } }),
    );
  });

  it.each([
    ['unreachable', () => Promise.reject(new TypeError('fetch failed'))],
    ['a 401', async () => new Response('{}', { status: 401 })],
    ['a malformed body', async () => new Response('{"hasActiveOrders":"no"}')],
  ])('fails closed with 503 when Order is %s', async (_, impl) => {
    vi.stubGlobal('fetch', vi.fn(impl));
    await expect(client.hasActiveOrders(TARGET)).rejects.toMatchObject({ status: 503 });
  });
});

describe('suspension (#72)', () => {
  it('suspends, revokes sessions and writes UserSuspended in one transaction', async () => {
    const { service, users, tokens } = makeService();
    await service.suspend(ADMIN, TARGET);
    expect(users.suspend).toHaveBeenCalledWith(TARGET, tx);
    expect(tokens.revokeAll).toHaveBeenCalledWith(TARGET, tx);
    expect(users.insertEvent).toHaveBeenCalledWith('UserSuspended', TARGET, tx);
  });

  it.each([
    ['yourself', ADMIN, undefined, 'CANNOT_MODIFY_SELF'],
    ['an unknown user', TARGET, null, 'NOT_FOUND'],
    ['a deactivated user', TARGET, user(TARGET, Role.USER, UserStatus.DEACTIVATED), 'USER_NOT_ACTIVE'],
  ] as const)('refuses %s with no event', async (_, targetId, target, code) => {
    const { service, users } = makeService({ target });
    await expect(service.suspend(ADMIN, targetId)).rejects.toMatchObject({ code });
    expect(users.insertEvent).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not an active admin', async () => {
    const { service } = makeService();
    await expect(service.suspend(TARGET, ADMIN)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('UserEventsPublisher (#72)', () => {
  const rows = [
    { id: 'e1', type: 'UserSuspended', userId: TARGET, occurredAt: new Date('2026-10-19T00:00:00Z') },
    { id: 'e2', type: 'UserSuspended', userId: ADMIN, occurredAt: new Date('2026-10-19T00:00:01Z') },
  ];

  it('publishes the flat shape keyed by userId and marks each row', async () => {
    const kafka = { send: vi.fn() };
    const repo = { unpublishedEvents: vi.fn(async () => rows), markEventPublished: vi.fn() };
    await new UserEventsPublisher(kafka as never, repo as never).publishPending();
    expect(kafka.send).toHaveBeenNthCalledWith(1, 'user.events', TARGET, {
      type: 'UserSuspended',
      eventId: 'e1',
      occurredAt: '2026-10-19T00:00:00.000Z',
      userId: TARGET,
    });
    expect(repo.markEventPublished.mock.calls).toEqual([['e1'], ['e2']]);
    expect(toUserEvent(rows[1]).userId).toBe(ADMIN);
  });

  it('stops at the first failure and leaves the row unpublished', async () => {
    const kafka = { send: vi.fn().mockRejectedValue(new Error('broker down')) };
    const repo = { unpublishedEvents: vi.fn(async () => rows), markEventPublished: vi.fn() };
    await new UserEventsPublisher(kafka as never, repo as never).publishPending();
    expect(kafka.send).toHaveBeenCalledTimes(1);
    expect(repo.markEventPublished).not.toHaveBeenCalled();
  });
});
