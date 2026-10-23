/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the application entry point, following supplier-service/src/main.ts.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Handle a failed bootstrap instead of leaving an unhandled rejection (PR #129 review).
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-23
 * Scope: Exit on a failed bootstrap rather than setting exitCode, which an open pool keeps the
 *        process alive past (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem';
import { requestIdMiddleware } from './common/request-id';
import { config } from './config';

// AI-generated (reviewed by Cole Lin).

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  await app.listen(config.port);
  new Logger('Logging').log(`Logging Service listening on port ${config.port}`);
}

// A failed bootstrap (no database, a bad LOGGING_ variable) would otherwise be an unhandled
// rejection: Node prints a stack and the process may linger with nothing listening. Fail loudly.
void bootstrap().catch((err: unknown) => {
  new Logger('Logging').error(
    JSON.stringify({ event: 'startup_failed' }),
    err instanceof Error ? (err.stack ?? err.message) : String(err),
  );
  // exitCode alone does not end the process: the database pool holds referenced sockets, so Node
  // would stay alive with nothing listening, and a container runtime never sees it fail or restarts
  // it (PR #129 review).
  process.exit(1);
});
