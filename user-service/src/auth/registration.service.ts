/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the register / verify / resend flow over the existing OTP, mail, crypto and
 *        session pieces, following the "Register and verify" rules in user-service/AGENTS.md.
 *        Put the account insert and the first session in one transaction after review.
 * Author review: Read in full; each step checked against the backlog IDs it cites, and the
 *                whole flow was run against the compose stack with the code read from Mailpit.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { OtpPurpose, encrypt, generateId, hashEmail, hashPassword } from '../crypto';
import { PG_POOL, withTransaction } from '../db/database';
import { MailService } from '../mail/mail.service';
import { OtpService } from '../otp/otp.service';
import { UsersRepository } from '../users/users.repository';
import { RegisterInput, ResendOtpInput, VerifyRegistrationInput } from './auth.schemas';
import { AuthResponse, SessionService } from './session.service';

/**
 * How long someone has to finish signing up (AGENTS.md, "Redis keys"). Longer than a single
 * code's five minutes, because a resend has to have something left to resend.
 */
export const PENDING_SIGNUP_TTL_SECONDS = 15 * 60;

/**
 * A sign-up that has been paid for with a password but not yet proved by a code. It lives only
 * in Redis and creates no `users` row (U1.1.2), so an unverified address never occupies an
 * account and never appears in an admin listing.
 *
 * The address is held encrypted, exactly as the column would, and the password already hashed:
 * if this store is ever dumped, it yields no more than the database would. The key is derived
 * from the email hash, so the plaintext address appears nowhere in Redis at all.
 */
export interface PendingSignup {
  userId: string;
  displayName: string;
  /** base64 of the AES-256-GCM payload, because JSON cannot hold a Buffer. */
  emailEncrypted: string;
  countryCode: string;
  mobileEncrypted: string;
  passwordHash: string;
}

export interface RegisterResult {
  userId: string;
  otpExpiresAt: Date;
}

const pendingKey = (emailHash: string) => `reg:${emailHash}`;

@Injectable()
export class RegistrationService {
  constructor(
    private readonly users: UsersRepository,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly sessions: SessionService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * `POST /auth/register` (U1.1.2). Stores the sign-up in Redis and mails a code; no row is
   * created until that code comes back.
   *
   * Registering the same address again overwrites the pending entry, so a user who mistyped
   * their password simply starts over rather than being stuck for fifteen minutes.
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const emailHash = hashEmail(input.email);

    // Before the EMAIL_TAKEN check, not after. U1.1.3 requires us to tell the caller that an
    // address is already registered, which is by definition an account-enumeration oracle;
    // counting the attempt first is what bounds it to three per ten minutes. It also means a
    // flood of sign-ups cannot spend an unbounded amount of CPU on bcrypt.
    await this.otp.assertWithinRequestLimit(emailHash);

    if (await this.users.existsByEmailHash(emailHash)) {
      throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists.');
    }

    const pending: PendingSignup = {
      // Generated now, so the response can name the account before it exists and the id does
      // not change when it is finally inserted.
      userId: generateId(),
      displayName: input.displayName,
      emailEncrypted: encrypt(input.email).toString('base64'),
      countryCode: input.countryCode,
      mobileEncrypted: encrypt(input.mobileNumber).toString('base64'),
      passwordHash: await hashPassword(input.password),
    };

    const { code, expiresAt } = await this.otp.issueRecord(
      pendingKey(emailHash),
      OtpPurpose.REGISTRATION,
      emailHash,
      pending,
      PENDING_SIGNUP_TTL_SECONDS,
    );

    // Throws 503 if the mail fails twice. The sign-up stays in Redis, so resend can retry it
    // rather than making the user type everything again.
    await this.mail.sendOtp(input.email, code, OtpPurpose.REGISTRATION);

    return { userId: pending.userId, otpExpiresAt: expiresAt };
  }

  /**
   * `POST /auth/register/verify`. Consumes the code and creates the account, then starts a
   * session so the user lands logged in rather than at a login form.
   *
   * The account row and the first refresh token are written in **one transaction**. Without
   * it, a failure between the two statements would leave an account nobody asked for: the
   * caller sees an error and assumes the sign-up failed, then re-registers and is told the
   * address is already taken. Rolling back means they simply register again.
   *
   * It cannot be made atomic with the code, though — the OTP was consumed in Redis before any
   * SQL ran, and a Postgres rollback does not put it back. A rollback therefore costs the user
   * a fresh code, not their account.
   */
  async verify(input: VerifyRegistrationInput): Promise<AuthResponse> {
    const emailHash = hashEmail(input.email);

    // Throws 400 OTP_INVALID or OTP_EXPIRED, and deletes the pending sign-up on success — so
    // the same code can never create two accounts.
    //
    // An email with no pending sign-up at all also comes back as OTP_EXPIRED, never 404
    // (AGENTS.md, "Register and verify"): a caller who could tell the two apart would learn
    // which addresses are mid-sign-up by submitting 000000 against each, without ever having
    // to guess a code.
    const pending = await this.otp.verifyRecord<PendingSignup>(
      pendingKey(emailHash),
      OtpPurpose.REGISTRATION,
      emailHash,
      input.otp,
    );

    return withTransaction(this.pool, async (client) => {
      const user = await this.users.insertIfAbsent(
        {
          id: pending.userId,
          displayName: pending.displayName,
          emailHash,
          emailEncrypted: Buffer.from(pending.emailEncrypted, 'base64'),
          countryCode: pending.countryCode,
          mobileEncrypted: Buffer.from(pending.mobileEncrypted, 'base64'),
          passwordHash: pending.passwordHash,
        },
        client,
      );

      if (!user) {
        // The address was claimed between register and verify — the code was valid, but the
        // account is not ours to create. No session is issued for a row we did not insert.
        throw new AppError(
          409,
          ErrorCode.EMAIL_TAKEN,
          'An account with this email already exists.',
        );
      }

      return this.sessions.issue(user, client);
    });
  }

  /**
   * `POST /auth/register/resend-otp`. Puts a new code into an existing sign-up, keeping the
   * fifteen-minute window it already has.
   */
  async resend(input: ResendOtpInput): Promise<{ otpExpiresAt: Date }> {
    const emailHash = hashEmail(input.email);

    // Counted before the lookup, so that "no such pending sign-up" cannot be probed freely.
    await this.otp.assertWithinRequestLimit(emailHash);

    const issued = await this.otp.reissueRecord(
      pendingKey(emailHash),
      OtpPurpose.REGISTRATION,
      emailHash,
    );

    if (!issued) {
      throw new AppError(
        404,
        ErrorCode.NOT_FOUND,
        'There is no sign-up waiting for this email. Please register again.',
      );
    }

    await this.mail.sendOtp(input.email, issued.code, OtpPurpose.REGISTRATION);

    return { otpExpiresAt: issued.expiresAt };
  }
}
