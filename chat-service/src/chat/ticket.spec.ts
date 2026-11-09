/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated the ticket check tests listed in the chat plan
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { randomUUID } from 'crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyTicket } from './ticket';

const secret = new TextEncoder().encode('test-chat-ticket-secret-at-least-32-chars');
const userId = randomUUID();
const orderId = randomUUID();

function ticket(
  claims: Record<string, unknown> = { orderId },
  { sub = userId as string, aud = 'chat', exp = '10s' as string | number, key = secret } = {},
) {
  const jwt = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setAudience(aud).setExpirationTime(exp);
  if (sub) jwt.setSubject(sub);
  return jwt.sign(key);
}

describe('verifyTicket', () => {
  it('accepts a valid ticket and returns its user and order', async () => {
    await expect(verifyTicket(await ticket(), secret)).resolves.toEqual({ userId, orderId });
  });

  it.each([
    ['expired', () => ticket({ orderId }, { exp: Math.floor(Date.now() / 1000) - 1 })],
    ['edited', async () => (await ticket()).slice(0, -2) + 'xx'],
    ['wrong audience', () => ticket({ orderId }, { aud: 'order' })],
    ['missing orderId', () => ticket({})],
    ['non-UUID orderId', () => ticket({ orderId: 'abc' })],
    ['missing sub', () => ticket({ orderId }, { sub: '' })],
    ['signed with another secret', () => ticket({ orderId }, { key: new TextEncoder().encode('x'.repeat(40)) })],
  ])('rejects a %s ticket', async (_name, make) => {
    await expect(verifyTicket(await make(), secret)).rejects.toThrow('unauthorized');
  });

  it('rejects a missing ticket and non-strings', async () => {
    for (const value of [undefined, null, 42, {}]) {
      await expect(verifyTicket(value, secret)).rejects.toThrow('unauthorized');
    }
  });

  it("rejects a user's RS256 login token", async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const jwt = await new SignJWT({ role: 'USER', orderId })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(userId)
      .setAudience('chat')
      .setExpirationTime('15m')
      .sign(privateKey);
    await expect(verifyTicket(jwt, secret)).rejects.toThrow('unauthorized');
  });
});
