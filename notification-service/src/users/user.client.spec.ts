/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the User client tests (#153), with fetch stubbed.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { config } from '../config';
import { UserClient, UserLookupError } from './user.client';

const USER = 'bbbbbbbb-0000-4000-8000-000000000002';
const client = new UserClient();
let fetchMock: jest.SpyInstance;

beforeEach(() => {
  fetchMock = jest.spyOn(global, 'fetch');
});
afterEach(() => {
  fetchMock.mockRestore();
});

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

async function category(): Promise<string> {
  const err = await client.contactEmail(USER).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(UserLookupError);
  return (err as UserLookupError).category;
}

it('asks User for the contact email with the service key', async () => {
  reply(200, { email: 'e0000000@u.nus.edu' });
  await expect(client.contactEmail(USER)).resolves.toBe('e0000000@u.nus.edu');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${config.userUrl}/internal/users/${USER}/contact`);
  expect(init.headers).toEqual({ 'x-service-key': config.userServiceKey });
});

it('reports an unknown user as USER_NOT_FOUND', async () => {
  reply(404, { code: 'NOT_FOUND' });
  expect(await category()).toBe('USER_NOT_FOUND');
});

it.each([401, 500, 503])('reports a %i as USER_UNAVAILABLE', async (status) => {
  reply(status, {});
  expect(await category()).toBe('USER_UNAVAILABLE');
});

it('reports a network failure as USER_UNAVAILABLE', async () => {
  fetchMock.mockRejectedValue(new TypeError('fetch failed'));
  expect(await category()).toBe('USER_UNAVAILABLE');
});

it('reports a 200 without an email as USER_BAD_RESPONSE', async () => {
  reply(200, { email: 'not an email' });
  expect(await category()).toBe('USER_BAD_RESPONSE');
});
