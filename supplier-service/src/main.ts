/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the application entry point.
 * Author review (Cole Lin): Read in full; confirmed the service starts, logs the dev-auth warning when the flag is on, and shuts down cleanly.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemDetailsFilter } from './common/problem';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
