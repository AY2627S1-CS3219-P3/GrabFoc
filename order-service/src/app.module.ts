/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-14
 * Scope: Generated the NestJS module wiring and shared app setup (Phase A).
 * Author review (Zi Yi): Read in full; ran `npm test` (7 passed) and the `compose.test.yaml` integration tests (27 passed).
 */
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ErrorFilter } from './common/errors';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { requestLogger } from './common/request-logger';
import { DatabaseModule } from './db/database.module';
import { OrdersController } from './orders/orders.controller';
import { OrdersRepository } from './orders/orders.repository';
import { OrdersService } from './orders/orders.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}

/** Setup shared by main.ts and the HTTP tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.use(requestLogger);
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  return app;
}
