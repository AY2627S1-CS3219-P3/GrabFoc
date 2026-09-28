/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-27
Scope: Added health route, public User routing, protected Supplier routes and structured access logs; added /location-types routing on 2026-09-27.
Author review: Pending gateway owner review.
*/
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createTokenVerifier } from './auth.js';
import { loadConfig, type Config } from './config.js';
import { proxy } from './proxy.js';

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
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
      if (matches(path, config.locationsPrefix) || path === '/location-types') {
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
