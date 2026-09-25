/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-25
 * Scope: Generated the mail interface, its SMTP implementation and the retry policy.
 *        Reworked the failure log after review found it interpolated the provider's message.
 * Author review: Read in full; `npm test` passes (73 tests), and an OTP email was delivered to Mailpit from the running stack.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { config } from '../config';
import { OtpPurpose } from '../crypto';

/**
 * An interface, so tests inject a fake instead of needing a live SMTP server, and so the
 * destination can change (Mailpit in development, a real provider later) without touching
 * any feature code.
 */
export abstract class MailService {
  abstract sendOtp(to: string, code: string, purpose: OtpPurpose): Promise<void>;
}

/** What each OTP email says. Deliberately short: the code, why, and how long it lasts. */
const SUBJECTS: Record<OtpPurpose, string> = {
  REGISTRATION: 'Verify your FoC account',
  PASSWORD_RESET: 'Reset your FoC password',
  PASSWORD_CHANGE: 'Confirm your new FoC password',
  EMAIL_CHANGE: 'Confirm your FoC email change',
  NEW_EMAIL_VERIFY: 'Verify your new FoC email',
  MOBILE_CHANGE: 'Confirm your new FoC mobile number',
  DEACTIVATION: 'Confirm deactivating your FoC account',
};

const SEND_TIMEOUT_MS = 5_000;

/**
 * Lets a test inject a fake transporter. It is @Optional and has an explicit token: without
 * one, Nest reads the constructor's parameter types, finds `Transporter` (an interface, so
 * it does not exist at runtime) and refuses to build the service.
 */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

@Injectable()
export class SmtpMailService extends MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter;

  constructor(@Optional() @Inject(MAIL_TRANSPORT) transporter?: Transporter) {
    super();
    this.transporter =
      transporter ??
      createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        // Mailpit accepts plaintext on 1025 and needs no credentials.
        secure: false,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        connectionTimeout: SEND_TIMEOUT_MS,
        greetingTimeout: SEND_TIMEOUT_MS,
        socketTimeout: SEND_TIMEOUT_MS,
      });
  }

  /**
   * Sends once, retries once, then gives up with 503 (AGENTS.md, "Errors"). The OTP is
   * already in Redis at this point, so the user can ask for it again rather than being
   * stuck with a code that was never delivered.
   */
  async sendOtp(to: string, code: string, purpose: OtpPurpose): Promise<void> {
    const message = {
      from: config.smtp.from,
      to,
      subject: SUBJECTS[purpose],
      text: `Your FoC verification code is ${code}. It expires in 5 minutes.\n\nIf you did not request this, ignore this email.`,
    };

    for (const attempt of [1, 2]) {
      try {
        await this.transporter.sendMail(message);
        return;
      } catch (error) {
        // Log fixed categories, never the provider's own message. An SMTP rejection echoes
        // the recipient back ("550 5.1.1 <alex@u.nus.edu> User unknown"), and redaction works
        // on field names in structured data — it cannot reach inside an interpolated string
        // (NFR5.1, and the warning at the top of common/logger.ts).
        const { code, responseCode } = error as { code?: string; responseCode?: number };
        this.logger.warn({
          event: 'OTP_SEND_FAILED',
          purpose,
          attempt,
          errorCode: code ?? 'UNKNOWN',
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
