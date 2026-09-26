/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the forgot / reset password flow from the "Forgot and reset password" rules
 *        in user-service/AGENTS.md, including the decoy OTP record that makes an unknown
 *        address answer exactly as a known one does.
 * Author review: Read in full; every rule checked against the backlog ID it cites, and both
 *                endpoints run against the compose stack — including a reset against an
 *                address with no account, compared byte for byte with a real one.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { OtpPurpose, hashEmail, hashPassword, verifyPassword } from '../crypto';
import { PG_POOL, withTransaction } from '../db/database';
import { MailService } from '../mail/mail.service';
import { OtpService } from '../otp/otp.service';
import { UserStatus, UsersRepository } from '../users/users.repository';
import { ForgotPasswordInput, ResetPasswordInput } from './auth.schemas';
import { LockoutService } from './lockout.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    private readonly users: UsersRepository,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly lockout: LockoutService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * `POST /auth/password/forgot` (U3.2.1). Mails a reset code — or silently does not, if there
   * is no account to mail it to.
   *
   * Always 202, always the same body (AGENTS.md, "Forgot and reset password"). Unlike register,
   * this endpoint has no requirement pushing it to reveal whether an address is taken, so it
   * reveals nothing: anyone may type any address here, including one they do not own.
   */
  async forgot(input: ForgotPasswordInput): Promise<void> {
    const emailHash = hashEmail(input.email);

    // Counted first, exactly as in register: an address with no account must be rate-limited
    // identically to one that has, or "this address never gets blocked" would itself be the
    // answer the rest of the method is careful not to give.
    await this.otp.assertWithinRequestLimit(emailHash);

    const user = await this.users.findByEmailHash(emailHash);
    const deliverable = user !== null && user.status === UserStatus.ACTIVE;

    // Issued whether or not there is an account behind the address. That is not a formality:
    // `POST /auth/password/reset` is answered by the Redis record, so an address with no record
    // would answer differently from one with — a caller could submit 000000 and read "expired"
    // as "nobody here" and "wrong code" as "an account exists and just asked for a reset".
    //
    // Writing a real record with a real random code closes that without any special-casing
    // downstream: the attempt cap, the five-minute expiry and the wording all come out the same
    // because they are the same code path. Nobody can use this code — it is never mailed
    // anywhere, and guessing it is 1 in a million with three tries.
    const { code, expiresAt } = await this.otp.issue(OtpPurpose.PASSWORD_RESET, emailHash);

    if (!deliverable) {
      // A DEACTIVATED or SUSPENDED account gets no code either. Letting someone reset their way
      // back in would make deactivation reversible by the very person it was applied to.
      this.logger.log({
        event: 'PASSWORD_RESET_NOT_SENT',
        reason: user ? user.status : 'NO_ACCOUNT',
      });
      return;
    }

    try {
      await this.mail.sendOtp(input.email, code, OtpPurpose.PASSWORD_RESET);
    } catch {
      // Swallowed on purpose, where register lets the 503 through. The only error this endpoint
      // is allowed to return is 429 (AGENTS.md, "Public" endpoint table): a 503 would happen
      // only for an address that has an account, so it would answer the question the uniform
      // 202 exists to refuse. The code is already in Redis, and the user can ask again.
      //
      // `MailService` has already logged the failure in categories, without the address.
      this.logger.warn({
        event: 'PASSWORD_RESET_MAIL_FAILED',
        otpExpiresAt: expiresAt.toISOString(),
      });
    }
  }

  /**
   * `POST /auth/password/reset` (U3.2.1). Consumes the code, sets the new password and ends
   * every session the user has.
   *
   * 204 and nothing else on success — no auth response. The user logs in with the new password,
   * which is also the only proof we ever get that they know it.
   */
  async reset(input: ResetPasswordInput): Promise<void> {
    const emailHash = hashEmail(input.email);

    // Throws 400 OTP_INVALID (with attemptsRemaining) or OTP_EXPIRED, and consumes the record so
    // one code cannot set two passwords. An address with no account reaches here too, against
    // the decoy record `forgot` wrote, and fails in exactly the same words.
    await this.otp.verify(OtpPurpose.PASSWORD_RESET, emailHash, input.otp);

    const user = await this.users.findByEmailHash(emailHash);

    // Unreachable in practice — a decoy code is unguessable and `forgot` issues none for an
    // inactive account — but if it ever is reached, it must not be distinguishable from a wrong
    // code, and it must not resurrect an account that was deactivated in the last five minutes.
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw this.rejectCode();
    }

    // AGENTS.md: a new password matching the current one is rejected, and the check is skipped
    // when the stored hash is NULL — that is the bootstrap admin claiming its account, which has
    // no current password to differ from.
    //
    // This costs the user their code, because the code was consumed above. Verifying without
    // consuming would mean splitting the Lua script that makes the attempt cap unraceable, which
    // is a worse trade than one extra round trip through "forgot password".
    if (user.passwordHash && (await verifyPassword(input.newPassword, user.passwordHash))) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Your new password must be different from your current one.',
      );
    }

    const passwordHash = await hashPassword(input.newPassword);

    // One transaction. AGENTS.md requires a reset to revoke every refresh token, and the two
    // halves are only worth anything together: a new password with the old sessions still live
    // leaves whoever prompted the reset logged in, and revoked sessions without a new password
    // locks the owner out of an account whose password they thought they had just changed.
    await withTransaction(this.pool, async (client) => {
      await this.users.updatePasswordHash(user.id, passwordHash, client);
      await this.refreshTokens.revokeAllForUser(user.id, client);
    });

    // After the commit, and deliberately not inside it — Redis is not part of the transaction,
    // so doing it earlier could lift a lock for a reset that then rolled back.
    //
    // Lifting the lockout is the point: forgetting a password is the normal way to end up locked
    // out, and someone who has just proved they read the account's inbox and set a new password
    // is not the password guesser the lock exists to stop. Leaving it would mean a successful
    // reset still could not log in for up to fifteen minutes.
    await this.lockout.clear(emailHash);
  }

  /** The one failure a caller may see beyond the OTP errors, worded to match them. */
  private rejectCode(): AppError {
    return new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.');
  }
}
