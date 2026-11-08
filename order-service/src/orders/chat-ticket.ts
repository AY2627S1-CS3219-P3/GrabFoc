/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated the chat ticket signer from the chat plan
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { SignJWT } from 'jose';
import { appConfig } from '../config';

let secret: Uint8Array | undefined;

/**
 * A 10-second HS256 ticket the chat service accepts for one order's room. The client fetches it
 * straight before connecting, so 10 seconds is enough; Order and chat share a host, so no clock skew.
 */
export function signChatTicket(userId: string, orderId: string): Promise<string> {
  secret ??= new TextEncoder().encode(appConfig().chatTicketSecret);
  return new SignJWT({ orderId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('chat')
    .setExpirationTime('10s')
    .sign(secret);
}
