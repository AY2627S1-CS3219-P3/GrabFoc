/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the NestJS module wiring and shared app setup (Phase A).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Registered the Supplier and Credit clients (Phase B).
 * Author review: Reviewed in full.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Registered the confirmations controller and service (Phase C).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-17
 * Scope: Registered the Credit command producer (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Registered the shared Kafka producer, the order.events publisher and the internal controller (Phase D).
 * Author review: Reviewed
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-21
 * Scope: Registered the user.events consumer (Phase D).
 * Author review: Tested by Zi Yi (unit and compose.test.yaml integration tests), 2026-10-21.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Registered the supplier.events consumer (issue #121).
 * Author review: Reviewed by Zi Yi, 2026-10-30.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-05
 * Scope: Registered the admin controller (#181).
 * Author review: Reviewed by Zi Yi, 2026-11-05.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-11-08
 * Scope: Registered the correlation-id and per-request log middleware, and the shipper's
 *        shutdown hook, so this service's lines reach the Logging Service (issue #52).
 * Author review: Cole Lin, read and approved.
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ErrorFilter } from './common/errors';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { LogShipping } from './common/log';
import { requestIdMiddleware } from './common/request-id';
import { requestLogMiddleware } from './common/request-log';
import { DatabaseModule } from './db/database.module';
import { CreditClient } from './integrations/credit.client';
import { CreditCommands } from './integrations/credit.commands';
import { KafkaProducer } from './integrations/kafka.producer';
import { OrderEvents } from './integrations/order.events';
import { SupplierClient } from './integrations/supplier.client';
import { SupplierEvents } from './integrations/supplier.events';
import { UserEvents } from './integrations/user.events';
import { AdminController } from './orders/admin.controller';
import { ConfirmationsController } from './orders/confirmations.controller';
import { ConfirmationsService } from './orders/confirmations.service';
import { InternalController } from './orders/internal.controller';
import { OrdersController } from './orders/orders.controller';
import { OrdersRepository } from './orders/orders.repository';
import { OrdersService } from './orders/orders.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OrdersController, ConfirmationsController, InternalController, AdminController],
  providers: [
    // Flushes the buffered log lines and closes the producer on shutdown.
    LogShipping,
    OrdersService,
    ConfirmationsService,
    OrdersRepository,
    SupplierClient,
    CreditClient,
    KafkaProducer,
    CreditCommands,
    OrderEvents,
    UserEvents,
    SupplierEvents,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}

/** Setup shared by main.ts and the HTTP tests. */
export function configureApp(app: INestApplication): INestApplication {
  // Replaces the Phase A request logger. That one wrote `event: REQUEST` through Nest's
  // Logger with no lineId, ts or service, so it was not the shape the log store accepts and
  // nothing could collect it. This line is a superset of what it carried, adding the request
  // id, the role, and whether the client gave up (issue #52).
  // AI-generated (reviewed by Cole Lin).
  app.use(requestIdMiddleware);
  // After the id middleware, so every line it writes carries the request's id.
  app.use(requestLogMiddleware);
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
