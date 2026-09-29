/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Moved implemented User Service route definitions out of the gateway request handler.
Author review: Jie Yang reviewed this file.
*/
import type { GatewayRoute } from './types.js';

function exact(path: string): RegExp {
  return new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

// AI-generated (pending human review)
export function userRoutes(authPrefix: string): GatewayRoute[] {
  const publicAuthPaths = [
    'register', 'register/verify', 'register/resend-otp', 'login', 'refresh',
    'password/forgot', 'password/reset',
  ];
  return [
    { method: 'GET', pattern: exact('/.well-known/jwks.json'), service: 'user', auth: 'public' },
    ...publicAuthPaths.map((suffix): GatewayRoute => ({
      method: 'POST', pattern: exact(`${authPrefix}/${suffix}`), service: 'user', auth: 'public',
    })),
    { method: 'POST', pattern: exact(`${authPrefix}/logout`), service: 'user', auth: 'authenticated' },
    { method: 'GET', pattern: exact('/users/me'), service: 'user', auth: 'authenticated' },
    { method: 'PATCH', pattern: exact('/users/me'), service: 'user', auth: 'authenticated' },
    { method: 'GET', pattern: exact('/admin/users'), service: 'user', auth: 'authenticated' },
    { method: 'PATCH', pattern: /^\/admin\/users\/[^/]+\/role$/, service: 'user', auth: 'authenticated' },
  ];
}
