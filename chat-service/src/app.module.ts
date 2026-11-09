/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
 * Scope: Generated following notification-service/src/app.module.ts.
 * Author review: Reviewed by Deanson, 2026-11-09.
 */
import { Module } from '@nestjs/common';
import { ChatGateway } from './chat/chat.gateway';
import { ChatService } from './chat/chat.service';
import { DatabaseModule } from './db/database';
import { HealthController } from './health/health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [ChatService, ChatGateway],
})
export class AppModule {}
