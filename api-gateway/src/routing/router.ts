/*
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Added generic route lookup and centralized upstream resolution.
Author review: Pending gateway owner review.
*/
import type { Config } from '../config.js';
import { supplierRoutes } from './supplier.routes.js';
import type { GatewayRoute, ServiceName } from './types.js';
import { userRoutes } from './user.routes.js';

// AI-generated (pending human review)
export function gatewayRoutes(config: Config): GatewayRoute[] {
  return [...userRoutes(config.authPrefix), ...supplierRoutes(config.locationsPrefix)];
}

export function findRoute(routes: readonly GatewayRoute[], method: string | undefined, path: string): GatewayRoute | undefined {
  return routes.find((route) => route.method === method && route.pattern.test(path));
}

export function getServiceUrl(service: ServiceName, config: Config): URL {
  const urls: Record<ServiceName, URL> = {
    user: config.userServiceUrl,
    supplier: config.supplierServiceUrl,
  };
  return urls[service];
}
