/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the application entry point.
 * Author review: Read in full; verified the service starts, migrates and serves /health under docker compose.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorFilter } from './common/error.filter';
import { RedactingLogger, logLevelsFrom } from './common/logger';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new RedactingLogger('User', { logLevels: logLevelsFrom(config.logLevel) }),
  });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.listen(config.port);
  new Logger('User').log(`User Service listening on port ${config.port}`);
}

bootstrap();
