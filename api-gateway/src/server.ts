/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added health route and structured access logs; mapped implemented User and Supplier Service routes on 2026-09-28.
Author review: Pending gateway owner review.
*/
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createTokenVerifier } from './auth.js';
import { loadConfig, type Config } from './config.js';
import { proxy } from './proxy.js';

function userRoute(method: string | undefined, path: string, authPrefix: string): 'public' | 'protected' | undefined {
  if (method === 'GET' && path === '/.well-known/jwks.json') return 'public';
  if (method === 'POST') {
    if (path === `${authPrefix}/logout`) return 'protected';
    if ([
      'register', 'register/verify', 'register/resend-otp', 'login', 'refresh',
      'password/forgot', 'password/reset',
    ].some((suffix) => path === `${authPrefix}/${suffix}`)) return 'public';
  }
  if ((method === 'GET' || method === 'PATCH') && path === '/users/me') return 'protected';
  if (method === 'GET' && path === '/admin/users') return 'protected';
  if (method === 'PATCH' && /^\/admin\/users\/[^/]+\/role$/.test(path)) return 'protected';
  return undefined;
}

function supplierRoute(method: string | undefined, path: string, locationsPrefix: string): boolean {
  if (method === 'GET' && path === '/location-types') return true;
  if (path === locationsPrefix) return method === 'GET' || method === 'POST';
  if (!path.startsWith(`${locationsPrefix}/`)) return false;
  const suffix = path.slice(locationsPrefix.length + 1).split('/');
  if (suffix.length === 1 && suffix[0]) return method === 'GET' || method === 'PATCH';
  return suffix.length === 2 && !!suffix[0] && method === 'POST' &&
    (suffix[1] === 'deactivate' || suffix[1] === 'restore');
}

function json(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

// AI-generated (pending human review)
export function createGateway(config: Config, verify = createTokenVerifier(config)) {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const path = new URL(request.url ?? '/', 'http://gateway.local').pathname;
      if (path === '/health' && request.method === 'GET') return json(response, 200, { status: 'ok' });
      const userAccess = userRoute(request.method, path, config.authPrefix);
      if (userAccess) {
        if (userAccess === 'protected' && !await verify(request.headers.authorization)) {
          console.warn(JSON.stringify({ event: 'unauthorized_access', status: 401, method: request.method, path }));
          return json(response, 401, { error: 'Unauthorized' });
        }
        return proxy(request, response, config.userServiceUrl);
      }
      if (supplierRoute(request.method, path, config.locationsPrefix)) {
        if (!await verify(request.headers.authorization)) {
          console.warn(JSON.stringify({ event: 'unauthorized_access', status: 401, method: request.method, path }));
          return json(response, 401, { error: 'Unauthorized' });
        }
        return proxy(request, response, config.supplierServiceUrl);
      }
      return json(response, 404, { error: 'Not found' });
    } catch {
      return json(response, 503, { error: 'Authentication service unavailable' });
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href) {
  const config = loadConfig();
  createGateway(config).listen(config.port, () => console.log(JSON.stringify({ event: 'gateway_started', port: config.port })));
}
