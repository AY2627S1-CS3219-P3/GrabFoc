/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated the retention job (30 days by default, LOGGING_RETENTION_DAYS), from the plan
 *        Cole Lin approved on 2026-10-16.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Cap the timer delay and stop overlapping runs (PR #129 review).
 * Author review: Cole Lin, read and approved.
 */
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { config } from '../config';
import { LinesService } from '../lines/lines.service';

// AI-generated (reviewed by Cole Lin).

/**
 * setInterval takes a signed 32-bit delay: anything larger is **clamped to 1 ms**, so
 * LOGGING_PURGE_INTERVAL_MINUTES=525600 would run the purge in a tight loop rather than yearly
 * (PR #129 review). About 24.8 days.
 */
const MAX_TIMER_MS = 2_147_483_647;

@Injectable()
export class PurgeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Purge');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly lines: LinesService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.runOnce();
    const requested = config.purgeIntervalMinutes * 60_000;
    const every = Math.min(requested, MAX_TIMER_MS);
    if (every !== requested) {
      this.logger.warn(
        `LOGGING_PURGE_INTERVAL_MINUTES=${config.purgeIntervalMinutes} exceeds the timer limit; ` +
          `purging every ${Math.floor(every / 60_000)} minutes instead.`,
      );
    }
    this.timer = setInterval(() => void this.runOnce(), every);
    // Don't hold the process open for the next purge when everything else has finished.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Deletes anything past the retention window. A failure is logged, never fatal. */
  async runOnce(): Promise<void> {
    // One at a time. A purge slower than the interval would otherwise pile concurrent DELETEs onto
    // the same table, which is how a slow query becomes an outage.
    if (this.running) return;
    this.running = true;
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
    } finally {
      this.running = false;
    }
  }
}
