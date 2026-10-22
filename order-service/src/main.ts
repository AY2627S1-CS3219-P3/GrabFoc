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
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Scheduled the 60 s expiry worker (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Scheduled the 1 s order.events publisher (Phase D).
 * Author review: Reviewed
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module';
import { appConfig } from './config';
import { OrderEvents } from './integrations/order.events';
import { OrdersService } from './orders/orders.service';

async function bootstrap() {
  const { port } = appConfig(); // fail fast on bad settings
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(port);
  const orders = app.get(OrdersService);
  // Not in tests, which call the jobs directly. Each next run waits for the last, so slow runs can't stack.
  const every = (ms: number, job: () => Promise<void>) => {
    const run = () => void job().finally(() => setTimeout(run, ms).unref());
    setTimeout(run, ms).unref();
  };
  every(10_000, () => orders.settleCredits());
  every(60_000, () => orders.expireOrders());
  // Every second, so Notification can email within NFR3.4's 10 s.
  const events = app.get(OrderEvents);
  every(1_000, () => events.publishPending());
  new Logger('Order').log(`Order Service listening on port ${port}`);
}

bootstrap();
