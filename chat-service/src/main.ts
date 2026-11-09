/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Copied from notification-service/src/main.ts.
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Closes the pg pool on SIGTERM (DatabaseLifecycle.onModuleDestroy).
  app.enableShutdownHooks();
  await app.listen(config.port);
  new Logger('Chat').log(`Chat Service listening on port ${config.port}`);
}

bootstrap();
