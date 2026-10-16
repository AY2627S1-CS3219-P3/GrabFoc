/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Sonnet 5), date: 2026-09-28
 * Scope: Generated the self-profile service for GET /users/me and PATCH /users/me (Step 11).
 * Author review: Verified via Postman against the compose stack on 2026-09-28 — GET returns
 *                the self profile shape (no role/status/createdAt), PATCH renames and reflects
 *                the new name on a follow-up GET, an unknown body field is rejected with 400,
 *                and no token gets 401 — see /ai/usage-log.md.
 *                2026-09-28: added the six Step 12 methods (requestOtp, requestEmailChange,
 *                verifyEmailChange, changeMobile, changePassword, deactivateSelf) behind
 *                POST/PATCH /users/me/otp, /email, /email/verify, /mobile, /password,
 *                /deactivate. Response shape for the mobile/email-verify endpoints was an
 *                explicit [Open] item in AGENTS.md (self profile vs. the admin-facing
 *                Profile shape); the service owner chose the self profile shape, matching
 *                Step 11's GET/PATCH /users/me. The "new password must differ from
 *                current" rule (documented only for password *reset*) was extended to
 *                changePassword too, on the service owner's instruction, for consistency
 *                between the two places a password gets set.
 * Author review: The six Step 12 methods were verified via Postman against the compose stack
 *                on 2026-09-28 — see /ai/usage-log.md.
 *                2026-09-28: reordered requestEmailChange and changePassword so the
 *                EMAIL_CHANGE/PASSWORD_CHANGE code is checked (otp.check) but not spent
 *                (otp.discard) until the endpoint's own business validation also passes.
 *                Requested by the service owner so a rejected EMAIL_TAKEN/"must differ" check
 *                doesn't cost the user their code; the literal "just move the check earlier"
 *                version of that request was rejected after review found it would let a valid
 *                access token alone (no real code needed) probe changePassword's reuse check
 *                as a password-guessing oracle with no rate limit — see otp.scripts.ts's
 *                CHECK_OTP_LUA disclosure for the mechanism that avoids this.
 * Author review: `npm run build` and `npm test` pass; `npm run test:int` (a real Redis via
 *                `docker compose up -d user-redis`) passes for the underlying OtpService
 *                change. The reordered requestEmailChange/changePassword behaviour (a rejected
 *                EMAIL_TAKEN/"must differ" check leaves the code live for a retry with the
 *                same code) was verified via Postman against the compose stack on 2026-09-28 —
 *                see /ai/usage-log.md.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { Role } from '../auth/caller';
import { RefreshTokensRepository } from '../auth/refresh-tokens.repository';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { decrypt, encrypt, hashEmail, hashPassword, OtpPurpose, verifyPassword } from '../crypto';
import { PG_POOL, withTransaction } from '../db/database';
import { MailService } from '../mail/mail.service';
import { OtpService } from '../otp/otp.service';
import { AdminLockService } from './admin-lock.service';
import { SelfProfileResponse, toSelfProfileResponse } from './profile.mapper';
import { UserStatus, UsersRepository } from './users.repository';

/**
 * `GET /users/me` and `PATCH /users/me` (Step 11), plus the OTP-protected self-service changes
 * (Step 12: `/users/me/otp`, `/email`, `/email/verify`, `/mobile`, `/password`, `/deactivate`).
 * Distinct from `AdminService`: this is the self-service track, not the admin track, and it
 * only ever acts on the caller's own row — the id always comes from the verified token
 * (`UsersController`), never a path parameter or a body field.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly otp: OtpService,
    private readonly mail: MailService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly lock: AdminLockService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  /**
   * No not-found handling: a verified token's subject always has a row (accounts are
   * deactivated, never deleted), the same assumption `AdminService.changeRole` makes after its
   * own writes.
   */
  async getSelf(userId: string): Promise<SelfProfileResponse> {
    const user = await this.users.findById(userId);
    return toSelfProfileResponse(user!);
  }

  async updateDisplayName(userId: string, displayName: string): Promise<SelfProfileResponse> {
    await this.users.updateDisplayName(userId, displayName);
    const user = await this.users.findById(userId);
    return toSelfProfileResponse(user!);
  }

  /**
   * `POST /users/me/otp` (Step 12). Mails a code to the caller's *current* email for whichever
   * of the four self-service purposes was requested — even MOBILE_CHANGE, since every OTP in
   * this service goes out by email (AGENTS.md, "OTP").
   *
   * For DEACTIVATION, checks the last-admin invariant *before* issuing the code — a
   * best-effort, unlocked read, purely so the sole admin isn't handed a code that
   * `deactivateSelf` is always going to refuse (AGENTS.md: "Checked twice ... so no OTP is
   * wasted"). It is not the security boundary: `deactivateSelf` re-checks inside
   * `AdminLockService`'s locked transaction, which is what actually closes the race between two
   * admins deactivating each other at once.
   */
  async requestOtp(userId: string, purpose: OtpPurpose): Promise<{ otpExpiresAt: Date }> {
    if (purpose === OtpPurpose.DEACTIVATION) {
      const activeAdmins = await this.users.listUsers({ role: Role.ADMIN, status: UserStatus.ACTIVE });
      if (activeAdmins.length === 1 && activeAdmins[0].id === userId) {
        throw new AppError(
          409,
          ErrorCode.LAST_ADMIN,
          'Promote another admin first — you are the only one.',
        );
      }
    }

    await this.otp.assertWithinRequestLimit(userId);

    const user = await this.users.findById(userId);
    const { code, expiresAt } = await this.otp.issue(purpose, userId);
    await this.mail.sendOtp(decrypt(user!.emailEncrypted), code, purpose);

    return { otpExpiresAt: expiresAt };
  }

  /**
   * `POST /users/me/email` (Step 12; AGENTS.md "Change email"). Checks the EMAIL_CHANGE code
   * already mailed to the *current* address — proof the caller controls that inbox — then
   * mails a second, NEW_EMAIL_VERIFY code to `newEmail`. Nothing is written to `users` yet.
   *
   * The EMAIL_CHANGE code is checked with `otp.check`, not `otp.verify`, and is only actually
   * spent (`otp.discard`) as the very last step, once nothing else can still fail. Checking it
   * first still closes the door on anyone without a real code — `otp.check` throws
   * `OTP_INVALID`/`OTP_EXPIRED` before the `EMAIL_TAKEN` lookup ever runs, so that lookup can't
   * be probed by someone who merely holds a valid access token. Not spending the code until the
   * end means a caller who submits a taken `newEmail`, or hits a mail failure, can retry with
   * the SAME code rather than requesting a new one — deliberately different from the "a code
   * costs you even on a later rejection" trade-off `PasswordResetService.reset` accepts, which
   * doesn't apply here because nothing before this endpoint needed the code to still be
   * unconsumed for a legitimate retry.
   *
   * The request limit is checked before the `EMAIL_TAKEN` lookup, the same order
   * `RegistrationService.register` uses and for the same reason: telling a caller whether an
   * address is taken is itself an account-enumeration oracle, so the number of times it can be
   * asked has to be bounded by the same three-per-ten-minutes window as everything else.
   */
  async requestEmailChange(
    userId: string,
    newEmail: string,
    otp: string,
  ): Promise<{ otpExpiresAt: Date }> {
    // Throws 400 OTP_INVALID/OTP_EXPIRED without spending the code — see the method doc.
    await this.otp.check(OtpPurpose.EMAIL_CHANGE, userId, otp);

    await this.otp.assertWithinRequestLimit(userId);

    const newEmailHash = hashEmail(newEmail);
    if (await this.users.existsByEmailHash(newEmailHash)) {
      // The EMAIL_CHANGE code is still live: retrying with a free address needs no new code.
      throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists.');
    }

    // The encrypted new address travels inside the OTP record itself, exactly as a pending
    // sign-up carries its own data (RegistrationService's `PendingSignup`) — so the code and
    // the address it verifies expire and are consumed together.
    const { code, expiresAt } = await this.otp.issue(
      OtpPurpose.NEW_EMAIL_VERIFY,
      userId,
      encrypt(newEmail).toString('base64'),
    );
    // If this throws (mail down after retries), the EMAIL_CHANGE code is still unspent too —
    // the whole call can simply be retried once mail is back.
    await this.mail.sendOtp(newEmail, code, OtpPurpose.NEW_EMAIL_VERIFY);

    // Only now, with nothing left that can fail, is the EMAIL_CHANGE code actually spent.
    await this.otp.discard(OtpPurpose.EMAIL_CHANGE, userId);

    return { otpExpiresAt: expiresAt };
  }

  /**
   * `POST /users/me/email/verify` (Step 12). Consumes the NEW_EMAIL_VERIFY code and commits the
   * address change. Reuses the stored ciphertext buffer as-is for `email_encrypted` rather than
   * re-encrypting — the same choice `RegistrationService.verify` makes for a pending sign-up's
   * address — and derives `email_hash` from the one decrypt this needs anyway.
   *
   * No refresh-token revoke: AGENTS.md's "revoke all on change" list names password change,
   * password reset and deactivation only — email change isn't on it.
   */
  async verifyEmailChange(userId: string, otp: string): Promise<SelfProfileResponse> {
    const payload = await this.otp.verify(OtpPurpose.NEW_EMAIL_VERIFY, userId, otp);
    const emailEncrypted = Buffer.from(payload!, 'base64');
    const newEmailHash = hashEmail(decrypt(emailEncrypted));

    // `UsersRepository.updateEmail` turns a concurrent claim of the same address (Postgres
    // 23505 on the email_hash UNIQUE constraint) into 409 EMAIL_TAKEN — the window this closes
    // is the one `requestEmailChange`'s own EMAIL_TAKEN check cannot: between that check and
    // this write, someone else could have claimed the address.
    await this.users.updateEmail(userId, newEmailHash, emailEncrypted);

    const user = await this.users.findById(userId);
    return toSelfProfileResponse(user!);
  }

  /**
   * `PATCH /users/me/mobile` (Step 12). `mobileNumber` arrives already validated against
   * `countryCode` by `ChangeMobileSchema`'s `attachMobileCheck`, so nothing here re-checks the
   * pairing — only encrypts and stores it.
   */
  async changeMobile(
    userId: string,
    countryCode: string,
    mobileNumber: string,
    otp: string,
  ): Promise<SelfProfileResponse> {
    await this.otp.verify(OtpPurpose.MOBILE_CHANGE, userId, otp);

    await this.users.updateMobile(userId, countryCode, encrypt(mobileNumber));

    const user = await this.users.findById(userId);
    return toSelfProfileResponse(user!);
  }

  /**
   * `POST /users/me/password` (Step 12). Same shape as `PasswordResetService.reset`: one
   * transaction writes the new hash and revokes every refresh token, so a stolen session cannot
   * outlive a password its owner just changed on purpose.
   *
   * The "must differ from the current password" check is not in AGENTS.md for this endpoint —
   * it documents that rule only for password *reset* — but is applied here too, on the service
   * owner's instruction, for consistency between the two places a password gets set. Skipped
   * when `passwordHash` is NULL for the same reason `PasswordResetService.reset` skips it: no
   * current password to differ from.
   *
   * Unlike `PasswordResetService.reset` — which deliberately accepts consuming its code even on
   * this same rejection — the PASSWORD_CHANGE code here is checked with `otp.check`, not
   * `otp.verify`, and is only spent (`otp.discard`) after the transaction commits. The
   * difference matters here specifically: reset's version of this check runs after a code tied
   * to reading a real inbox, so there's no way to reach it for free. This endpoint has no such
   * gate of its own — `changePassword` never calls `assertWithinRequestLimit` — so if the reuse
   * check ran before the code check, anyone holding a valid access token (including a leaked
   * one) could submit throwaway codes and guessed passwords and read from the rejection alone
   * whether a guess matches the account's real password, with no rate limit and no lockout.
   * Checking the code first closes that: nobody without a real, live code reaches the reuse
   * check at all. Deferring the spend until after the commit also means a DB failure leaves the
   * code valid for a retry, rather than burning it for a write that never took effect.
   */
  async changePassword(userId: string, otp: string, newPassword: string): Promise<void> {
    // Throws 400 OTP_INVALID/OTP_EXPIRED without spending the code — see the method doc.
    await this.otp.check(OtpPurpose.PASSWORD_CHANGE, userId, otp);

    const user = await this.users.findById(userId);
    if (user!.passwordHash && (await verifyPassword(newPassword, user!.passwordHash))) {
      // The code is still live: retrying with a different password needs no new code.
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Your new password must be different from your current one.',
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await withTransaction(this.pool, async (client) => {
      await this.users.updatePasswordHash(userId, passwordHash, client);
      await this.refreshTokens.revokeAllForUser(userId, client);
    });

    // Only now, once the write has actually committed, is the PASSWORD_CHANGE code spent.
    await this.otp.discard(OtpPurpose.PASSWORD_CHANGE, userId);
  }

  /**
   * `POST /users/me/deactivate` (Step 12). Runs inside `AdminLockService.run`, the same helper
   * `AdminService.changeRole`'s self-demote branch uses, so the last-admin invariant has exactly
   * one implementation for both paths (AGENTS.md, "The last-admin lock": "One helper serves
   * both the role change and the self-deactivate path"). `activeAdminIds` is `null` for a
   * non-admin caller, so this branch never applies to a plain USER deactivating themselves.
   *
   * The OTP is verified, and therefore consumed, before the lock even opens — `requestOtp`'s
   * pre-check makes this the rare path rather than the common one, but when it does fire the
   * caller has already spent their code, the same accepted trade-off as everywhere else an OTP
   * is consumed ahead of a check that can still fail.
   */
  async deactivateSelf(userId: string, otp: string): Promise<void> {
    await this.otp.verify(OtpPurpose.DEACTIVATION, userId, otp);

    await this.lock.run(userId, async (ctx) => {
      if (ctx.activeAdminIds !== null && ctx.activeAdminIds.length === 1) {
        throw new AppError(
          409,
          ErrorCode.LAST_ADMIN,
          'Promote another admin first — you are the only one.',
        );
      }

      await this.users.deactivate(userId, ctx.client);
      await this.refreshTokens.revokeAllForUser(userId, ctx.client);
    });
  }
}
