/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11
 * Scope: Generated the application entry point, following supplier-service/src/main.ts.
 * Author review: Jian Bing, 2026-10-18 — manually tested Credit and Kafka: unit, integration and Kafka suites pass; a UserRegistered event (CLI and Kafka UI) creates a 10-credit wallet once and repeats change nothing; balance gives 401 with no token and 404 with no wallet; messages checked in Kafka UI.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Wrote the 2026-10-18 Author review text above from Jian Bing's account of what he checked (PR #97).
 * Author review: Jian Bing supplied what it states; the wording is Claude's.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Registered the correlation-id and per-request log middleware, and the shipper's
 *        shutdown hook, so this service's lines reach the Logging Service (issue #52).
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
  app.use(requestLogMiddleware);
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  await app.listen(config.port);
  new Logger('Credit').log(`Credit Service listening on port ${config.port}`);
}

bootstrap();
