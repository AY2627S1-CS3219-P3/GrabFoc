/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-18
 * Scope: Generated tests for the Kafka client's logger (quieter test and service logs).
 * Author review: Jian Bing, 2026-10-18 — ran npm run test:kafka on this branch: 12/12 pass with no console errors (the IPv6 connection failures and retry-wait errors seen on main are gone).
 */
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { Logger } from '@nestjs/common';
import { kafkaLogger, NOT_DUE_YET } from './kafka.logger';

let error: jest.SpyInstance;
let warn: jest.SpyInstance;
let log: jest.SpyInstance;
beforeEach(() => {
  error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('drops the library error for a retry message that is not due yet', () => {
  kafkaLogger().error(
    `Consumer encountered error while processing message. Error details: Error: ${NOT_DUE_YET}\n    at KafkaRunner.onMessage. The same message may be reprocessed.`,
    { name: 'credit-service#consumer-1' },
  );
  expect(error).not.toHaveBeenCalled();
});

it('passes every other error and warning through, with the client name', () => {
  const logger = kafkaLogger();
  logger.error('Error: Local: Broker transport failure', { name: 'credit-service#producer-2' });
  logger.warn('Group rebalancing', { name: 'credit-service#consumer-1' });
  expect(error).toHaveBeenCalledWith('Error: Local: Broker transport failure (credit-service#producer-2)');
  expect(warn).toHaveBeenCalledWith('Group rebalancing (credit-service#consumer-1)');
});

it('drops info and debug below the configured level', () => {
  const logger = kafkaLogger();
  logger.setLogLevel(KafkaJS.logLevel.WARN);
  logger.info('Consumer connected');
  logger.debug('Fetching');
  expect(log).not.toHaveBeenCalled();
  logger.setLogLevel(KafkaJS.logLevel.INFO);
  logger.info('Consumer connected');
  expect(log).toHaveBeenCalledWith('Consumer connected');
});

it('returns itself for a namespace, so every client shares the filter', () => {
  const logger = kafkaLogger();
  logger.namespace('Consumer').error(`x: ${NOT_DUE_YET}`);
  expect(error).not.toHaveBeenCalled();
});
