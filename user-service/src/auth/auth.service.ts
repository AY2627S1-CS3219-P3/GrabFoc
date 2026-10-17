/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-11, 2026-10-15, 2026-10-16
 * Scope: 10-11/10-15: constructor and empty method skeletons. 10-16: filled every method by
 *   porting user-service/src/auth/registration.service.ts, login.service.ts,
 *   password-reset.service.ts, session.service.ts and lockout.service.ts (original disclosures:
 *   Claude Code, Claude Opus 5, 2026-09-26). Same rules, codes and messages; no SQL here.
 *   Later 10-16 (Deanson's decision): resetPassword keeps the code until the new password is
 *   saved, like POST /users/me/password, instead of consuming it first.
 * Author review: Constructor reviewed by Deanson, 2026-10-15. 10-16 port: successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { Injectable, Logger } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { AppError, otpRejected } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-codes';
import { DatabaseService } from '../infra/database/database.service';
import { MailService } from '../infra/mail/mail.service';
import { OTP_TTL_SECONDS, OtpPurpose, PENDING_SIGNUP_TTL_SECONDS, otpKey } from '../infra/redis/redis.constants';
import { RedisService } from '../infra/redis/redis.service';
import { DUMMY_PASSWORD_HASH, OtpService } from '../security/otp.service';
import { IssuedTokens, TokensService } from '../security/tokens.service';
import { UsersService } from '../users/users.service';
import type { UserRecord } from '../users/users.repository';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyRegisterDto } from './dto/verify-register.dto';

/**
 * A sign-up waiting for its code. Lives only in Redis (no `users` row until verified), with the
 * address and mobile encrypted and the password already hashed, exactly as the row would hold them.
 */
interface PendingSignup {
  userId: string;
  displayName: string;
  /** base64 of the AES-256-GCM payload, because JSON cannot hold a Buffer. */
  emailEncrypted: string;
  countryCode: string;
  mobileEncrypted: string;
  passwordHash: string;
}

/** Returned by register/verify and login. */
export interface AuthResponse extends IssuedTokens {
  user: { userId: string; displayName: string; role: Role };
}

/** One refresh attempt. Returned from the transaction, not thrown, so a reuse revoke still commits. */
type RefreshOutcome =
  | { kind: 'rotated'; tokens: IssuedTokens }
  | { kind: 'reused'; userId: string; revoked: number }
  | { kind: 'inactive' }
  | { kind: 'unusable' };

/** Orchestrates sign-up, login, sessions and password reset. No SQL: users go through UsersService. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly usersService: UsersService,
    private readonly tokens: TokensService,
    private readonly otp: OtpService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly db: DatabaseService,
  ) {}

  // ---------------------------------------------------------------- registration

  /**
   * POST /auth/register (U1.1.2). Stores the sign-up in Redis and mails a code; no row yet.
   * Registering again overwrites the pending entry.
   */
  async register(dto: RegisterDto): Promise<{ userId: string; otpExpiresAt: Date }> {
    const emailHash = this.otp.hashEmail(dto.email);

    // Before EMAIL_TAKEN: that answer is an enumeration oracle, so it must be rate-limited.
    await this.assertWithinOtpLimit(emailHash);

    if (await this.usersService.existsByEmailHash(emailHash)) {
      throw this.emailTaken();
    }

    const pending: PendingSignup = {
      // Generated now, so the response can name the account before it exists.
      userId: this.otp.generateId(),
      displayName: dto.displayName,
      emailEncrypted: this.otp.encrypt(dto.email).toString('base64'),
      countryCode: dto.countryCode,
      mobileEncrypted: this.otp.encrypt(dto.mobileNumber).toString('base64'),
      passwordHash: await this.otp.hashPassword(dto.password),
    };

    const code = this.otp.generate();
    const expiresAt = this.otpDeadline();
    await this.redis.saveOtp(
      otpKey(OtpPurpose.REGISTRATION, emailHash),
      {
        otpHash: this.otp.hash(OtpPurpose.REGISTRATION, emailHash, code),
        attempts: 0,
        otpExpiresAt: expiresAt.getTime(),
        data: pending,
      },
      PENDING_SIGNUP_TTL_SECONDS,
    );

    // 503 if the mail fails twice; the sign-up stays, so resend can retry it.
    await this.mail.sendOtp(dto.email, code, OtpPurpose.REGISTRATION);
    return { userId: pending.userId, otpExpiresAt: expiresAt };
  }

  /**
   * POST /auth/register/verify. Consumes the code, then creates the account and its first
   * session in one transaction. No pending sign-up also answers OTP_EXPIRED, never 404.
   */
  async verify(dto: VerifyRegisterDto): Promise<AuthResponse> {
    const emailHash = this.otp.hashEmail(dto.email);
    const result = await this.redis.verifyOtp<PendingSignup>(
      otpKey(OtpPurpose.REGISTRATION, emailHash),
      this.otp.hash(OtpPurpose.REGISTRATION, emailHash, dto.otp),
      { consume: true },
    );
    if (result.status !== 'OK') throw otpRejected(result);
    const pending = result.record.data!;

    return this.db.transaction(async (tx) => {
      const user = await this.usersService.insertIfAbsent(
        {
          id: pending.userId,
          displayName: pending.displayName,
          emailHash,
          emailEncrypted: Buffer.from(pending.emailEncrypted, 'base64'),
          countryCode: pending.countryCode,
          mobileEncrypted: Buffer.from(pending.mobileEncrypted, 'base64'),
          passwordHash: pending.passwordHash,
        },
        tx,
      );
      // Claimed between register and verify: not ours to create, so no session.
      if (!user) throw this.emailTaken();
      return this.toAuthResponse(user, await this.tokens.issue(user, tx));
    });
  }

  /** POST /auth/register/resend-otp. A new code inside the existing 15-minute window. */
  async resendOtp(dto: ResendOtpDto): Promise<{ otpExpiresAt: Date }> {
    const emailHash = this.otp.hashEmail(dto.email);

    // Before the lookup, so "no pending sign-up" cannot be probed freely.
    await this.assertWithinOtpLimit(emailHash);

    const code = this.otp.generate();
    const expiresAt = this.otpDeadline();
    const replaced = await this.redis.replaceOtpCode(
      otpKey(OtpPurpose.REGISTRATION, emailHash),
      this.otp.hash(OtpPurpose.REGISTRATION, emailHash, code),
      expiresAt.getTime(),
    );
    if (!replaced) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'There is no sign-up waiting for this email. Please register again.');
    }

    await this.mail.sendOtp(dto.email, code, OtpPurpose.REGISTRATION);
    return { otpExpiresAt: expiresAt };
  }

  // ---------------------------------------------------------------- login

  /**
   * POST /auth/login (U2.1.2, U2.1.3, U2.3.1). The step order is the security property: an
   * unknown address and a wrong password must look identical, in body and in timing.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const emailHash = this.otp.hashEmail(dto.email);

    // 1. A locked address costs no database query and no bcrypt.
    const lockTtl = await this.redis.getLoginLockTtl(emailHash);
    if (lockTtl > 0) throw this.accountLocked(lockTtl);

    // 2. No account (or no password yet) still pays for a full bcrypt comparison.
    const user = await this.usersService.findByEmailHash(emailHash);
    const correct = await this.otp.verifyPassword(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    // 3. Both failures are the same event: 401 for the first four, 423 on the fifth.
    if (!user || !correct) {
      const failure = await this.redis.recordLoginFailure(emailHash);
      if (failure.locked) throw this.accountLocked(failure.retryAfterSeconds!);
      throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect.');
    }

    // 4. Only past a correct password is anything revealed about the account.
    await this.redis.clearLoginFailures(emailHash);

    if (user.status === UserStatus.DEACTIVATED) {
      throw new AppError(
        403,
        ErrorCode.ACCOUNT_DEACTIVATED,
        'This account has been deactivated. Contact an administrator to restore it.',
      );
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new AppError(403, ErrorCode.ACCOUNT_SUSPENDED, 'This account has been suspended.');
    }

    return this.toAuthResponse(user, await this.tokens.issue(user));
  }

  // ---------------------------------------------------------------- password reset

  /**
   * POST /auth/password/forgot (U3.2.1). Always 202 with the same body. A code record is
   * written even when there is no active account (it is just never mailed), so reset answers
   * the same either way. A mail failure is logged, never returned: a 503 would reveal the account.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const emailHash = this.otp.hashEmail(dto.email);
    await this.assertWithinOtpLimit(emailHash);

    const user = await this.usersService.findByEmailHash(emailHash);
    const deliverable = user !== null && user.status === UserStatus.ACTIVE;

    const code = this.otp.generate();
    const expiresAt = this.otpDeadline();
    await this.redis.saveOtp(
      otpKey(OtpPurpose.PASSWORD_RESET, emailHash),
      { otpHash: this.otp.hash(OtpPurpose.PASSWORD_RESET, emailHash, code), attempts: 0, otpExpiresAt: expiresAt.getTime() },
      OTP_TTL_SECONDS,
    );

    if (!deliverable) {
      // Deactivated or suspended accounts get no code, or deactivation would be self-reversible.
      this.logger.log({ event: 'PASSWORD_RESET_NOT_SENT', reason: user ? user.status : 'NO_ACCOUNT' });
      return;
    }

    try {
      await this.mail.sendOtp(dto.email, code, OtpPurpose.PASSWORD_RESET);
    } catch {
      this.logger.warn({ event: 'PASSWORD_RESET_MAIL_FAILED', otpExpiresAt: expiresAt.toISOString() });
    }
  }

  /**
   * POST /auth/password/reset (U3.2.1). Sets the password, ends every session, then lifts any
   * login lock: proving inbox access is not what the lock exists to stop.
   *
   * Like POST /users/me/password, the code is checked without being spent and only deleted once
   * the new password is saved, so "same as current" (or a database failure) can be retried with
   * the same code. Wrong guesses still count against the code's attempts.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const emailHash = this.otp.hashEmail(dto.email);
    const key = otpKey(OtpPurpose.PASSWORD_RESET, emailHash);
    const result = await this.redis.verifyOtp(
      key,
      this.otp.hash(OtpPurpose.PASSWORD_RESET, emailHash, dto.otp),
      { consume: false },
    );
    if (result.status !== 'OK') throw otpRejected(result);

    const user = await this.usersService.findByEmailHash(emailHash);
    // Unreachable in practice (a decoy code is unguessable), but must look like a wrong code.
    // The code is spent here, as before: it can never lead anywhere.
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.redis.deleteOtp(key);
      throw new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.');
    }

    // Skipped when there is no current password (the bootstrap admin claiming its account).
    // The code is still live: retrying with a different password needs no new code.
    if (user.passwordHash && (await this.otp.verifyPassword(dto.newPassword, user.passwordHash))) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Your new password must be different from your current one.');
    }

    await this.usersService.setPassword(user.id, await this.otp.hashPassword(dto.newPassword));
    // After the commit: Redis is not part of the transaction. Only now is the code spent.
    await this.redis.deleteOtp(key);
    await this.redis.clearLoginFailures(emailHash, { unlock: true });
  }

  // ---------------------------------------------------------------- sessions

  /**
   * POST /auth/refresh. Rotates the token and reloads the user, so a demotion or deactivation
   * takes effect within 15 minutes. A reused token ends every session of its owner.
   */
  async refreshToken(dto: RefreshTokenDto): Promise<IssuedTokens> {
    const outcome = await this.db.transaction(async (tx): Promise<RefreshOutcome> => {
      const live = await this.tokens.revokeLive(dto.refreshToken, tx);
      if (!live) {
        const reused = await this.tokens.findRevoked(dto.refreshToken, tx);
        if (!reused) return { kind: 'unusable' };
        const revoked = await this.tokens.revokeAll(reused.userId, tx);
        return { kind: 'reused', userId: reused.userId, revoked };
      }

      const user = await this.usersService.findById(live.userId, tx);
      // Same 401 as a bad token; login is where the real reason is given.
      if (!user || user.status !== UserStatus.ACTIVE) return { kind: 'inactive' };

      return { kind: 'rotated', tokens: await this.tokens.issue(user, tx) };
    });

    if (outcome.kind === 'rotated') return outcome.tokens;

    if (outcome.kind === 'reused') {
      // Logged after the commit. userId only: never the token or its hash.
      this.logger.warn({ event: 'REFRESH_TOKEN_REUSED', userId: outcome.userId, revoked: outcome.revoked });
    }
    throw new AppError(401, ErrorCode.TOKEN_INVALID, 'That session has ended. Please log in again.');
  }

  /** POST /auth/logout. Ends this session only, and only if it is the caller's. Always succeeds. */
  async logout(userId: string, dto: RefreshTokenDto): Promise<void> {
    await this.tokens.revokeOwned(dto.refreshToken, userId);
  }

  // ---------------------------------------------------------------- helpers

  private async assertWithinOtpLimit(emailHash: string): Promise<void> {
    const limit = await this.redis.hitOtpRequestLimit(emailHash);
    if (limit.blocked) {
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Too many codes requested.', {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
  }

  private otpDeadline(): Date {
    return new Date(Date.now() + OTP_TTL_SECONDS * 1000);
  }

  private toAuthResponse(user: Pick<UserRecord, 'id' | 'displayName' | 'role'>, tokens: IssuedTokens): AuthResponse {
    return { ...tokens, user: { userId: user.id, displayName: user.displayName, role: user.role } };
  }

  private emailTaken(): AppError {
    return new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists.');
  }

  private accountLocked(retryAfterSeconds: number): AppError {
    return new AppError(423, ErrorCode.ACCOUNT_LOCKED, 'Too many failed attempts.', { retryAfterSeconds });
  }
}
