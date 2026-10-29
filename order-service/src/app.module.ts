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
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ErrorFilter } from './common/errors';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { requestLogger } from './common/request-logger';
import { DatabaseModule } from './db/database.module';
import { CreditClient } from './integrations/credit.client';
import { CreditCommands } from './integrations/credit.commands';
import { KafkaProducer } from './integrations/kafka.producer';
import { OrderEvents } from './integrations/order.events';
import { SupplierClient } from './integrations/supplier.client';
import { SupplierEvents } from './integrations/supplier.events';
import { UserEvents } from './integrations/user.events';
import { ConfirmationsController } from './orders/confirmations.controller';
import { ConfirmationsService } from './orders/confirmations.service';
import { InternalController } from './orders/internal.controller';
import { OrdersController } from './orders/orders.controller';
import { OrdersRepository } from './orders/orders.repository';
import { OrdersService } from './orders/orders.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OrdersController, ConfirmationsController, InternalController],
  providers: [
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
  app.use(requestLogger);
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
