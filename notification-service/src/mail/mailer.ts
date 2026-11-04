/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-04
 * Scope: Generated the SMTP sender (#153), following user-service/src/infra/mail/mail.service.ts:
 *        the same transport settings and timeouts, error categories only. One attempt; retries are #154.
 * Author review: pending — Jie Yang to record the review.
 */
// AI-generated (pending review)
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { config } from '../config';
import { RenderedEmail } from './templates';

const SEND_TIMEOUT_MS = 5_000;

/**
 * A send that failed. `category` is safe to store and log: the provider's own message can echo the
 * recipient's address, so it is never kept.
 */
export class MailError extends Error {
  constructor(readonly category: string) {
    super(`Email not sent: ${category}`);
  }
}

@Injectable()
export class Mailer implements OnModuleDestroy {
  private readonly transporter: Transporter = createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    // 465 is implicit TLS; anything else (Mailpit on 1025, STARTTLS on 587) starts in plaintext.
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  /** Hands the email to the SMTP server once. Returns the provider's message id. */
  async send(to: string, email: RenderedEmail): Promise<string | null> {
    try {
      const info = await this.transporter.sendMail({ from: config.smtp.from, to, ...email });
      return info.messageId ?? null;
    } catch (error) {
      const { code, responseCode } = error as { code?: string; responseCode?: number };
      throw new MailError(responseCode ? `SMTP_${responseCode}` : (code ?? 'UNKNOWN'));
    }
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
