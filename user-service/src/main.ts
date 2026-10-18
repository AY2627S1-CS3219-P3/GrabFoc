/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Nest CLI scaffold file, rewritten from user-service/src/main.ts (original disclosure:
 *   Claude Code, Claude Opus 5, 2026-09-25): redacting logger, global ErrorFilter, shutdown hooks,
 *   port from ConfigService.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorFilter } from './common/errors/error.filter';
import { RedactingLogger, logLevelsFrom } from './common/logging/logger';
import type { AppConfig } from './config/env.validation';

async function bootstrap() {
  // Buffer startup logs until the redacting logger (which needs the config) is in place.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  app.useLogger(new RedactingLogger('User', { logLevels: logLevelsFrom(config.get('logLevel', { infer: true })) }));
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();

  const port = config.get('port', { infer: true });
  await app.listen(port);
  new Logger('User').log(`User Service listening on port ${port}`);
}
void bootstrap();
