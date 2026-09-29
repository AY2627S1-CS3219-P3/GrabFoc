/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the NestJS module wiring (database, routes, seed, global JWT auth guard).
 * Author review (Cole Lin): Read in full; confirmed the guard is registered globally, so every route requires credentials unless a role says otherwise.
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/auth';
import { DatabaseModule } from './db/database';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
import { SeedService } from './seed/seed.service';

@Module({
  imports: [DatabaseModule],
  controllers: [LocationsController],
  providers: [LocationsService, SeedService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
