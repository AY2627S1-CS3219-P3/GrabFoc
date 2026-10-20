/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Generated the relay tests with a fake database, outbox and producer.
 * Author review: pending — Deanson to record what he checked.
 */
// AI-generated (reviewed by Deanson)
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/env.validation';
import type { DatabaseService } from '../database/database.service';
import type { KafkaProducer } from '../kafka/kafka.producer';
import { OutboxRelay } from './outbox.relay';
import type { OutboxRepository, PendingEvent } from './outbox.repository';

const event = (id: string, ageMs = 0): PendingEvent => ({
  id,
  aggregateId: `user-${id}`,
  eventType: 'UserRegistered',
  topic: 'user.events',
  payload: { type: 'UserRegistered', eventId: id, userId: `user-${id}` },
  createdAt: new Date(Date.now() - ageMs),
});

function setup(pending: PendingEvent[] = []) {
  const tx = {} as PoolClient;
  // Like DatabaseService.transaction: rethrows, so the caller sees the rollback.
  const db = { transaction: vi.fn((fn: (tx: PoolClient) => Promise<unknown>) => fn(tx)) };
  const outbox = {
    claimPending: vi.fn(async () => pending),
    markPublished: vi.fn(async () => undefined),
  };
  const producer = { sendBatch: vi.fn(async () => undefined), reset: vi.fn(async () => undefined) };
  const config = { get: () => ({ pollMs: 1000, maxBackoffMs: 30000 }) };
  const relay = new OutboxRelay(
    db as unknown as DatabaseService,
    outbox as unknown as OutboxRepository,
    producer as unknown as KafkaProducer,
    config as unknown as ConfigService<AppConfig, true>,
  );
  return { relay, db, outbox, producer, tx };
}

describe('OutboxRelay', () => {
  beforeEach(() => {
    // Ticks schedule the next one with setTimeout; fake timers keep them from running.
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends a batch, marks exactly those events published, and polls again after 1 s', async () => {
    const { relay, outbox, producer, tx } = setup([event('a'), event('b')]);

    await relay.tick();

    expect(outbox.claimPending).toHaveBeenCalledWith(tx, 50);
    expect(producer.sendBatch).toHaveBeenCalledWith([event('a'), event('b')].map((e) => expect.objectContaining({ id: e.id })));
    expect(outbox.markPublished).toHaveBeenCalledWith(['a', 'b'], tx);
    expect(relay.nextDelayMs).toBe(1000);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('never touches Kafka when nothing is pending', async () => {
    const { relay, producer } = setup([]);

    await relay.tick();

    expect(producer.sendBatch).not.toHaveBeenCalled();
    expect(producer.reset).not.toHaveBeenCalled();
    expect(relay.nextDelayMs).toBe(1000);
  });

  it('on a send failure marks nothing, reports, resets the producer and doubles the delay up to 30 s', async () => {
    const { relay, outbox, producer } = setup([event('a', 5000)]);
    producer.sendBatch.mockRejectedValue(new Error('Broker transport failure'));
    const report = vi.spyOn(relay, 'reportRelayFailure');

    await relay.tick();

    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(producer.reset).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: ['a'], oldestPendingAgeMs: expect.any(Number) }),
    );
    expect(report.mock.calls[0][0].oldestPendingAgeMs).toBeGreaterThanOrEqual(5000);
    expect(relay.nextDelayMs).toBe(2000);

    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      await relay.tick();
      delays.push(relay.nextDelayMs);
    }
    expect(delays).toEqual([4000, 8000, 16000, 30000, 30000, 30000]);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('goes back to 1 s after the first successful tick', async () => {
    const { relay, producer } = setup([event('a')]);
    producer.sendBatch.mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down'));

    await relay.tick();
    await relay.tick();
    expect(relay.nextDelayMs).toBe(4000);

    await relay.tick();
    expect(relay.nextDelayMs).toBe(1000);
  });

  it('keeps going after a database error: reports, backs off and schedules the next tick', async () => {
    const { relay, outbox, producer } = setup();
    outbox.claimPending.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const report = vi.spyOn(relay, 'reportRelayFailure');

    await relay.tick();

    expect(report).toHaveBeenCalledWith(expect.objectContaining({ eventIds: [], oldestPendingAgeMs: null }));
    expect(producer.sendBatch).not.toHaveBeenCalled();
    expect(relay.nextDelayMs).toBe(2000);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps going when marking published fails after the send', async () => {
    const { relay, outbox } = setup([event('a')]);
    outbox.markPublished.mockRejectedValue(new Error('terminating connection'));

    await relay.tick();

    expect(relay.nextDelayMs).toBe(2000);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('warns that the backlog is stale only past 60 s', () => {
    const { relay } = setup();
    const warn = vi.spyOn(Logger.prototype, 'warn');

    relay.reportRelayFailure({ eventIds: ['a'], error: new Error('down'), oldestPendingAgeMs: 59_000 });
    expect(warn).not.toHaveBeenCalled();

    relay.reportRelayFailure({ eventIds: ['a'], error: new Error('down'), oldestPendingAgeMs: 61_000 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('OUTBOX_BACKLOG_STALE'));
  });

  it('stops scheduling once shutting down', async () => {
    const { relay, producer } = setup([event('a')]);

    await relay.onModuleDestroy();
    await relay.tick();

    expect(vi.getTimerCount()).toBe(0);
    expect(producer.reset).toHaveBeenCalled();
  });
});
