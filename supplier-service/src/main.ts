/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the application entry point.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-11
 * Scope: Registered the correlation-id middleware.
 * Author review (Cole Lin): Read in full; confirmed the service starts, logs the dev-auth warning when the flag is on, and shuts down cleanly.
 * Author review (Cole Lin): Read in full; ran `npm test` (171 passed) and checked a supplied id,
 *        a minted one and a rejected one all reach the log line and the response header.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Registered the per-request log middleware (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem';
import { requestIdMiddleware } from './common/request-id';
import { requestLogMiddleware } from './common/request-log';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // AI-generated (reviewed by Cole Lin).
  app.use(requestIdMiddleware);
  // After the id middleware, so every line it writes carries the request's id.
  // AI-generated (reviewed by Cole Lin).
  app.use(requestLogMiddleware);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  if (config.devAuth) {
    new Logger('Supplier').warn(
      'SUPPLIER_DEV_AUTH=true: unauthenticated X-User-Id / X-User-Role headers are accepted when no ' +
        'bearer token is sent. Local testing only — never enable this outside your own machine.',
    );
  }
  await app.listen(config.port);
  new Logger('Supplier').log(`Supplier Service listening on port ${config.port}`);
}

bootstrap();
