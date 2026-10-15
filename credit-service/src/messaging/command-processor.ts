/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Generated the routing of failed credit commands to retry topics and the dead-letter
 *        topic, from Jian Bing's decisions K2–K3 and K11 and the details in spec §9.2.
 * Author review: pending — Jian Bing to record what he checked.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-15
 * Scope: Trust x-attempt and x-due-at only on Credit's own retry topics (security review);
 *        forward the original bytes (PR #85 review).
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Logger } from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { ProblemException } from '../common/problem';
import { CreditCommand, HEADER, InboundMessage, InvalidMessageError, OutboundMessage, parseCommand, peekIds } from './messages';
import { Topics } from './topics';

export interface Failure {
  retryable: boolean;
  message: string;
  code?: string;
}

/**
 * Retryable: might succeed later (the wallet doesn't exist yet, the database is down).
 * Permanent: never will (an invalid message, a conflict, or no hold, which is a bug: K11).
 */
export function describeFailure(err: unknown): Failure {
  if (err instanceof InvalidMessageError) return { retryable: false, message: err.message };
  if (err instanceof ProblemException) {
    return { retryable: err.code === ErrorCode.WALLET_NOT_FOUND, message: err.message, code: err.code };
  }
  return { retryable: true, message: err instanceof Error ? err.message : String(err) };
}

/** Milliseconds until a retry message is due; 0 when it is due now or carries no due time. */
export function msUntilDue(message: InboundMessage, now: number): number {
  const dueAt = Number(message.headers[HEADER.dueAt]);
  return Number.isFinite(dueAt) && dueAt > now ? dueAt - now : 0;
}

/**
 * How long to leave a message unread before applying it. Only Credit's own retry topics carry a
 * due time, and a due time is never later than that topic's delay: a forged header on
 * credit.commands, or an inflated one, can't pause a partition for longer.
 */
export function waitBeforeProcessing(message: InboundMessage, topics: Topics, now: number): number {
  const retry = topics.retries.find((r) => r.topic === message.topic);
  return retry ? Math.min(msUntilDue(message, now), retry.delayMs) : 0;
}

export class CommandProcessor {
  private readonly logger = new Logger('CreditCommands');

  constructor(
    private readonly apply: (command: CreditCommand) => Promise<unknown>,
    private readonly topics: Topics,
  ) {}

  /** Applies one command. Returns where to send it next if it failed, or null when it is done. */
  async process(message: InboundMessage, now: number): Promise<OutboundMessage | null> {
    try {
      await this.apply(parseCommand(message.value));
      return null;
    } catch (err) {
      const failure = describeFailure(err);
      // Only Credit writes to its retry topics; on credit.commands an x-attempt header is ignored,
      // so a sender can't skip the retries by claiming earlier attempts.
      const fromRetry = this.topics.retries.some((r) => r.topic === message.topic);
      const attempts = (fromRetry ? Number(message.headers[HEADER.attempt]) || 0 : 0) + 1;
      const { eventId, orderId } = peekIds(message.value);
      const headers: Record<string, string> = {
        [HEADER.attempt]: String(attempts),
        [HEADER.error]: failure.message.slice(0, 500),
        ...(failure.code ? { [HEADER.errorCode]: failure.code } : {}),
        [HEADER.sourceTopic]: this.topics.commands,
      };
      // The original bytes, not a UTF-8 re-encoding, so a dead letter keeps exactly what failed.
      const next = { key: message.key, value: message.value ?? '' };

      const retry = failure.retryable ? this.topics.retries[attempts - 1] : undefined;
      if (retry) {
        this.logger.warn(
          JSON.stringify({
            event: 'credit_command_retry_scheduled',
            eventId,
            orderId,
            attempt: attempts,
            delayMs: retry.delayMs,
            code: failure.code ?? null,
          }),
        );
        return { ...next, topic: retry.topic, headers: { ...headers, [HEADER.dueAt]: String(now + retry.delayMs) } };
      }

      // Spec §4.3: logged at error so someone looks at it; ids only, never balances (NFR5.1).
      this.logger.error(
        JSON.stringify({ event: 'credit_command_dead_lettered', eventId, orderId, attempts, code: failure.code ?? null }),
      );
      return {
        ...next,
        topic: this.topics.commandsDeadLetter,
        headers: { ...headers, [HEADER.deadLetteredAt]: new Date(now).toISOString() },
      };
    }
  }
}
