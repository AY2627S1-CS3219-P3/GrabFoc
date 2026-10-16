/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from SmtpMailService in user-service/src/mail/mail.service.ts (original disclosure: Claude Code, Claude Opus 5, 2026-09-25): one concrete class reading ConfigService. Same subjects, retry and 503. Sends synchronously; BullMQ is deferred (ai/open_decisions.md, item 2).
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AppConfig } from '../../config/env.validation';
import { OtpPurpose } from '../redis/redis.constants';

/** Each OTP email: the code, why, and how long it lasts. */
const SUBJECTS: Record<OtpPurpose, string> = {
  [OtpPurpose.REGISTRATION]: 'Verify your FoC account',
  [OtpPurpose.PASSWORD_RESET]: 'Reset your FoC password',
  [OtpPurpose.PASSWORD_CHANGE]: 'Confirm your new FoC password',
  [OtpPurpose.EMAIL_CHANGE]: 'Confirm your FoC email change',
  [OtpPurpose.NEW_EMAIL_VERIFY]: 'Verify your new FoC email',
  [OtpPurpose.MOBILE_CHANGE]: 'Confirm your new FoC mobile number',
  [OtpPurpose.DEACTIVATION]: 'Confirm deactivating your FoC account',
};

const SEND_TIMEOUT_MS = 5_000;

@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const smtp = config.get('smtp', { infer: true });
    this.from = smtp.from;
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      // 465 is implicit TLS; anything else (Mailpit on 1025, STARTTLS on 587) starts in plaintext.
      secure: smtp.port === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }

  /**
   * Sends once, retries once, then throws 503. The code is already in Redis, so the user can
   * ask for it again.
   */
  async sendOtp(to: string, code: string, purpose: OtpPurpose): Promise<void> {
    const message = {
      from: this.from,
      to,
      subject: SUBJECTS[purpose],
      text: `Your FoC verification code is ${code}. It expires in 5 minutes.\n\nIf you did not request this, ignore this email.`,
    };

    for (const attempt of [1, 2]) {
      try {
        await this.transporter.sendMail(message);
        return;
      } catch (error) {
        // Fixed categories only: the provider's message can echo the recipient's address.
        const { code: errorCode, responseCode } = error as { code?: string; responseCode?: number };
        this.logger.warn({
          event: 'OTP_SEND_FAILED',
          purpose,
          attempt,
          errorCode: errorCode ?? 'UNKNOWN',
          smtpResponseCode: responseCode ?? null,
        });
      }
    }

    throw new AppError(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      'Could not send the verification email. Please try again shortly.',
    );
  }
}
