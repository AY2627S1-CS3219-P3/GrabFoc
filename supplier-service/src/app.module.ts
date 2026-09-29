/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the NestJS module wiring (database, routes, seed, global dev-only role guard).
 * Author review: pending — to be completed by the reviewing team member.
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DevRoleGuard } from './common/auth';
import { DatabaseModule } from './db/database';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { SeedService } from './seed/seed.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LocationsController],
  providers: [LocationsService, SeedService, { provide: APP_GUARD, useClass: DevRoleGuard }],
})
export class AppModule {}
