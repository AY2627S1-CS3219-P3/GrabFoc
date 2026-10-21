/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-16
 * Scope: Generated this shipper from the field convention on issue #52 and the plan Cole Lin
 *        approved on 2026-10-16: stdout always, Kafka when a publisher is wired in, a bounded
 *        buffer that drops rather than blocks, and no broker needed in order to log.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Key each message by requestId, after the team's Kafka rule 5 landed in root
 *        AGENTS.md §3 while this was being written.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-21
 * Scope: Strip the query string here rather than trusting every caller, after the SoCLaaS
 *        review of PR #90 pointed out this is the one place every service shares.
 * Author review: Cole Lin, read and approved.
 */
import { randomUUID } from 'node:crypto';

// AI-generated (reviewed by Cole Lin).

/**
 * The canonical copy of the shipper every service uses. This repository has no shared package, so
 * copy this file into `<service>/src/common/log-shipper.ts` rather than importing it across
 * folders — and when it changes here, change it there. It lives under src/ so `npm test` covers
 * it; the Logging Service itself does not use it.
 *
 * It deliberately has no Kafka client: a `LinePublisher` is handed in, so a service takes on the
 * client (`@confluentinc/kafka-javascript`, the one Credit pinned in #85) only when it has a
 * broker to talk to. Until the shared broker (#75) exists, every service passes no publisher and
 * logs to stdout only, exactly as it does today.
 */

export type Level = 'debug' | 'info' | 'warn' | 'error';

/** What a caller passes. `event` is the only required part; the rest is whatever it was about. */
export interface LineInput {
  level: Level;
  event: string;
  requestId?: string;
  userId?: string;
  role?: string;
  method?: string;
  /**
    * The path. Anything from the first `?` is removed before the line is written, so a caller's
    * coordinates cannot reach a log line that also names them — passing a full URL here is safe.
    */
  path?: string;
  status?: number;
  durationMs?: number;
  [field: string]: unknown;
}

/** One line on its way to the topic. */
export interface OutboundLine {
  /**
   * The Kafka message key. Kafka keeps order only per key (root AGENTS.md §3, rule 5), so lines
   * are keyed by `requestId`: one request's lines land in one partition, in the order they
   * happened. A line with no request (a startup or purge line) has no key and may be interleaved,
   * which costs nothing because there is no sequence to preserve.
   */
  key?: string;
  value: string;
}

/** Whatever actually puts lines on the topic. */
export interface LinePublisher {
  publish(lines: OutboundLine[]): Promise<void>;
}

export interface ShipperOptions {
  /** This service's name, as it will appear in the `service` column. */
  service: string;
  publisher?: LinePublisher;
  /** Lines held while a publish is in flight. Beyond this, lines are dropped. */
  maxBuffer?: number;
  /** How often the buffer is drained, in milliseconds. */
  flushMs?: number;
  /** Where the line goes locally. Replaced in tests. */
  write?: (line: string) => void;
  /** Minted per line. Replaced in tests so output is predictable. */
  newId?: () => string;
}

export class LogShipper {
  private readonly buffer: OutboundLine[] = [];
  private readonly maxBuffer: number;
  private timer?: NodeJS.Timeout;
  private publishing = false;
  readonly counts = { emitted: 0, dropped: 0, failed: 0 };

  constructor(private readonly options: ShipperOptions) {
    this.maxBuffer = options.maxBuffer ?? 1000;
    if (options.publisher) {
      this.timer = setInterval(() => void this.flush(), options.flushMs ?? 1000);
      // Never hold the process open just to ship a log line.
      this.timer.unref();
    }
  }

  /**
   * Records one line and returns immediately: nothing here is awaited, so a slow or dead broker
   * cannot slow a request down. The line always reaches stdout, so a line dropped from a full
   * buffer is still in the container log — which is what makes dropping acceptable rather than
   * lossy.
   */
  emit(input: LineInput): void {
    const { level, event, path, ...rest } = input;
    const payload = JSON.stringify({
      // One id, shared by the stdout line and the Kafka message, so reading stdout later cannot
      // double-count what the store already has.
      lineId: (this.options.newId ?? randomUUID)(),
      ts: new Date().toISOString(),
      service: this.options.service,
      level,
      event,
      // Stripped here, at the one point every service shares, rather than relying on each copy of
      // this file to remember: `?lat=…&lon=…` is the caller's position, and this line carries
      // their userId (root AGENTS.md: never log unmasked personal data).
      ...(path === undefined ? {} : { path: path.split('?')[0] }),
      ...rest,
    });
    this.counts.emitted += 1;
    (this.options.write ?? console.log)(payload);

    if (!this.options.publisher) return;
    if (this.buffer.length >= this.maxBuffer) {
      this.counts.dropped += 1;
      return;
    }
    this.buffer.push({ key: input.requestId, value: payload });
  }

  /** Drains the buffer. Safe to call while one is already running; one publish at a time. */
  async flush(): Promise<void> {
    if (this.publishing || !this.options.publisher || !this.buffer.length) return;
    this.publishing = true;
    const batch = this.buffer.splice(0, this.buffer.length);
    try {
      await this.options.publisher.publish(batch);
    } catch {
      // The lines are already on stdout, so losing them here is a counted inconvenience, not a
      // reason to grow the buffer without limit or to crash a service that was only logging.
      this.counts.failed += batch.length;
    } finally {
      this.publishing = false;
    }
  }

  /** Flushes what is left and stops the timer. Call from onModuleDestroy. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
  }
}
