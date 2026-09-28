/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added health route, public User routing, protected Supplier routes and structured access logs; mapped implemented Supplier Service routes on 2026-09-28.
Author review: Pending gateway owner review.
*/
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createTokenVerifier } from './auth.js';
import { loadConfig, type Config } from './config.js';
import { proxy } from './proxy.js';

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
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
      if (matches(path, config.authPrefix) && request.method === 'POST') return proxy(request, response, config.userServiceUrl);
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
