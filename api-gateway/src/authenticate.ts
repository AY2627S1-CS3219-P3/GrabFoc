/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Centralized gateway authentication outcomes without adding service authorization.
Author review: Jie Yang reviewed this file.
*/
import type { GatewayRoute } from './routing/types.js';
import { JwksUnavailableError } from './auth.js';

export type TokenVerifier = (authorization: string | undefined) => Promise<boolean>;
export type AuthResult = 'ok' | 'unauthorized' | 'unavailable';

// AI-generated (pending human review)
export async function authenticate(route: GatewayRoute, authorization: string | undefined, verify: TokenVerifier): Promise<AuthResult> {
  if (route.auth === 'public') return 'ok';
  try {
    return await verify(authorization) ? 'ok' : 'unauthorized';
  } catch (error) {
    if (error instanceof JwksUnavailableError) return 'unavailable';
    throw error;
  }
}
