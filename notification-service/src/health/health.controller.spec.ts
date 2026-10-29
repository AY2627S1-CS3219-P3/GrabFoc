/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated the health check tests (#149).
 * Author review: pending — Jie Yang to record the review.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { HealthController } from './health.controller';

function controllerWith(query: () => Promise<unknown>): HealthController {
  return new HealthController({ query } as unknown as Pool);
}

it('reports ok when the database answers', async () => {
  await expect(controllerWith(async () => ({ rows: [] })).check()).resolves.toEqual({ status: 'ok' });
});

it('answers 503 when the database does not', async () => {
  const check = controllerWith(async () => {
    throw new Error('connect ECONNREFUSED');
  }).check();
  await expect(check).rejects.toBeInstanceOf(ServiceUnavailableException);
});
