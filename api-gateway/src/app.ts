/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Separated route dispatch, authentication, logging and gateway errors from startup.
Author review: Jie Yang reviewed this file.
*/
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { authenticate, type TokenVerifier } from './authenticate.js';
import { createTokenVerifier } from './auth.js';
import type { Config } from './config.js';
import { proxy } from './proxy.js';
import { beginRequest, logFailure } from './request-logger.js';
import { json } from './response.js';
import { findRoute, gatewayRoutes, getServiceUrl } from './routing/router.js';
import type { ServiceName } from './routing/types.js';

// AI-generated (pending human review)
export function createGateway(config: Config, verify: TokenVerifier = createTokenVerifier(config)) {
  const routes = gatewayRoutes(config);
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    let path = '/';
    let service: ServiceName | undefined;
    const requestId = beginRequest(request, response, () => ({ path, service }));
    try {
      path = new URL(request.url ?? '/', 'http://gateway.local').pathname;
      if (path === '/health' && request.method === 'GET') return json(response, 200, { status: 'ok' });

      const route = findRoute(routes, request.method, path);
      if (!route) return json(response, 404, { error: 'Not found' });
      service = route.service;

      const auth = await authenticate(route, request.headers.authorization, verify);
      if (auth === 'unauthorized') {
        logFailure('unauthorized_access', requestId, request.method, path, service);
        return json(response, 401, { error: 'Unauthorized' });
      }
      if (auth === 'unavailable') {
        logFailure('authentication_unavailable', requestId, request.method, path, service);
        return json(response, 503, { error: 'Authentication service unavailable' });
      }

      proxy(request, response, getServiceUrl(service, config), requestId,
        () => logFailure('upstream_failure', requestId, request.method, path, service));
    } catch {
      logFailure('gateway_error', requestId, request.method, path, service);
      if (response.headersSent) response.destroy();
      else json(response, 500, { error: 'Internal server error' });
    }
  });
}
