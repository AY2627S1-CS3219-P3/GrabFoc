/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the retention job (30 days by default, LOGGING_RETENTION_DAYS), from the plan
 *        Cole Lin approved on 2026-10-16.
 * Author review: pending — Cole Lin to record what he checked.
 */
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config';
import { LinesService } from '../lines/lines.service';

@Injectable()
export class PurgeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Purge');
  private timer?: NodeJS.Timeout;

  constructor(private readonly lines: LinesService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), config.purgeIntervalMinutes * 60_000);
    // Don't hold the process open for the next purge when everything else has finished.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Deletes anything past the retention window. A failure is logged, never fatal. */
  async runOnce(): Promise<void> {
    try {
      const deleted = await this.lines.purge(config.retentionDays);
      if (deleted) {
        this.logger.log(
          JSON.stringify({ event: 'lines_purged', deleted, retentionDays: config.retentionDays }),
        );
      }
    } catch (err) {
      this.logger.error(
        JSON.stringify({ event: 'purge_failed', retentionDays: config.retentionDays }),
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
