/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Moved implemented User Service route definitions out of the gateway request handler; added the documented self-service and reactivation routes on 2026-09-29.
Author review: Jie Yang reviewed the earlier route list; the new allowlist entries await his review.
*/
import type { GatewayRoute } from './types.js';

function exact(path: string): RegExp {
  return new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

// AI-generated (earlier version reviewed by Jie Yang; latest edits pending review)
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
    { method: 'POST', pattern: exact('/users/me/otp'), service: 'user', auth: 'authenticated' },
    { method: 'POST', pattern: exact('/users/me/email'), service: 'user', auth: 'authenticated' },
    { method: 'POST', pattern: exact('/users/me/email/verify'), service: 'user', auth: 'authenticated' },
    { method: 'PATCH', pattern: exact('/users/me/mobile'), service: 'user', auth: 'authenticated' },
    { method: 'POST', pattern: exact('/users/me/password'), service: 'user', auth: 'authenticated' },
    { method: 'POST', pattern: exact('/users/me/deactivate'), service: 'user', auth: 'authenticated' },
    { method: 'GET', pattern: exact('/admin/users'), service: 'user', auth: 'authenticated' },
    { method: 'PATCH', pattern: /^\/admin\/users\/[^/]+\/role$/, service: 'user', auth: 'authenticated' },
    { method: 'POST', pattern: /^\/admin\/users\/[^/]+\/reactivate$/, service: 'user', auth: 'authenticated' },
  ];
}
