/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the HTTP server entry point (Phase A).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module';
import { appConfig } from './config';

async function bootstrap() {
  const { port } = appConfig(); // fail fast on bad settings
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(port);
  new Logger('Order').log(`Order Service listening on port ${port}`);
}

bootstrap();
