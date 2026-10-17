/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the HTTP server entry point (Phase A).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Scheduled the credit clean-up job (Phase B).
 * Author review: Reviewed in full.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
 * Scope: Renamed the job to settleCredits; each run is scheduled after the previous one ends (Phase D).
 * Author review: Reviewed
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module';
import { appConfig } from './config';
import { OrdersService } from './orders/orders.service';

async function bootstrap() {
  const { port } = appConfig(); // fail fast on bad settings
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(port);
  const orders = app.get(OrdersService);
  // Not in tests, which call it directly. The next run waits for this one, so a slow broker can't stack runs.
  const settle = () => void orders.settleCredits().finally(() => setTimeout(settle, 10_000).unref());
  setTimeout(settle, 10_000).unref();
  new Logger('Order').log(`Order Service listening on port ${port}`);
}

bootstrap();
