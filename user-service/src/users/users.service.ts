/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Merged user-service/src/users/users.service.ts (2026-09-28), admin.service.ts,
 *   admin-lock.service.ts (2026-09-27; original disclosures: Claude Code, Claude Sonnet 5),
 *   admin-bootstrap.service.ts and profile.mapper.ts (2026-09-27; Claude Opus 5 / Sonnet 5).
 *   Same rules, codes and messages. OTP issue/verify now go through RedisService + OtpService.
 *   New: reactivate re-checks in the database that the caller is an ACTIVE ADMIN (ai/plan.md).
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: The admin bootstrap writes the admin row and its UserRegistered outbox row in one transaction.
 * Author review: pending — Deanson to record what he checked.
 */
// AI-generated (reviewed by Deanson)
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { AppError, otpRejected } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-codes';
import { AuditEvent, auditLine } from '../common/logging/logger';
import { EmailSchema } from '../common/validation/fields';
import type { AppConfig } from '../config/env.validation';
import { DatabaseService } from '../infra/database/database.service';
import { MailService } from '../infra/mail/mail.service';
import { OutboxRepository } from '../infra/outbox/outbox.repository';
import { OTP_TTL_SECONDS, OtpPurpose, otpKey } from '../infra/redis/redis.constants';
import { RedisService } from '../infra/redis/redis.service';
import { OtpService } from '../security/otp.service';
import { TokensService } from '../security/tokens.service';
import { AdminProfile, SelfProfile } from './dto/profile.response';
import { userRegistered } from './user-events';
import { NewUser, UserFilter, UserRecord, UsersRepository } from './users.repository';

/** The bootstrap admin's display name; the owner can change it with PATCH /users/me. */
const BOOTSTRAP_ADMIN_DISPLAY_NAME = 'Administrator';

/** What a caller inside the last-admin lock works with. `activeAdminIds` is null unless the caller is an ACTIVE ADMIN. */
interface AdminLockContext {
  tx: PoolClient;
  caller: UserRecord;
  activeAdminIds: string[] | null;
}

type SelfServicePurpose =
  | OtpPurpose.EMAIL_CHANGE
  | OtpPurpose.MOBILE_CHANGE
  | OtpPurpose.PASSWORD_CHANGE
  | OtpPurpose.DEACTIVATION;

/**
 * Business rules for the `users` table: the caller's own profile (/users/me*), the admin
 * lifecycle (/admin/users*), the first-admin bootstrap, and the lookups AuthService needs.
 * The caller's id always comes from the verified token.
 */
@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Users');

  constructor(
    private readonly users: UsersRepository,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly outbox: OutboxRepository,
  ) {}

  // ---------------------------------------------------------------- used by AuthService

  existsByEmailHash(emailHash: string): Promise<boolean> {
    return this.users.existsByEmailHash(emailHash);
  }

  findByEmailHash(emailHash: string): Promise<UserRecord | null> {
    return this.users.findByEmailHash(emailHash);
  }

  findById(id: string, tx?: PoolClient): Promise<UserRecord | null> {
    return this.users.findById(id, tx);
  }

  insertIfAbsent(user: NewUser, tx?: PoolClient): Promise<UserRecord | null> {
    return this.users.insertIfAbsent(user, tx);
  }

  /** New password and the end of every session, in one transaction. */
  async setPassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.users.updatePasswordHash(userId, passwordHash, tx);
      await this.tokens.revokeAll(userId, tx);
    });
  }

  // ---------------------------------------------------------------- /users/me

  /** A verified token's subject always has a row (accounts are deactivated, never deleted). */
  async getSelf(userId: string): Promise<SelfProfile> {
    return this.toSelfProfile((await this.users.findById(userId))!);
  }

  async updateDisplayName(userId: string, displayName: string): Promise<SelfProfile> {
    await this.users.updateDisplayName(userId, displayName);
    return this.getSelf(userId);
  }

  /**
   * POST /users/me/otp. Mails a code to the caller's current email. For DEACTIVATION, the sole
   * admin is refused first so no code is wasted; deactivateSelf re-checks under the lock.
   */
  async requestOtp(userId: string, purpose: SelfServicePurpose): Promise<{ otpExpiresAt: Date }> {
    if (purpose === OtpPurpose.DEACTIVATION) {
      const activeAdmins = await this.users.listUsers({ role: Role.ADMIN, status: UserStatus.ACTIVE });
      if (activeAdmins.length === 1 && activeAdmins[0].id === userId) {
        throw this.lastAdmin();
      }
    }

    await this.assertWithinOtpLimit(userId);

    const user = await this.users.findById(userId);
    const { code, expiresAt } = await this.issueOtp(purpose, userId);
    await this.mail.sendOtp(this.otp.decrypt(user!.emailEncrypted), code, purpose);
    return { otpExpiresAt: expiresAt };
  }

  /**
   * POST /users/me/email. Checks the EMAIL_CHANGE code without spending it, so the EMAIL_TAKEN
   * lookup cannot be probed without a real code, and a taken address or mail failure can be
   * retried with the same code. Mails a NEW_EMAIL_VERIFY code to the new address, carrying the
   * encrypted address in the record. Nothing is written to `users` yet.
   */
  async requestEmailChange(userId: string, newEmail: string, code: string): Promise<{ otpExpiresAt: Date }> {
    await this.checkOtp(OtpPurpose.EMAIL_CHANGE, userId, code, { consume: false });

    // Before the EMAIL_TAKEN lookup, which is itself an enumeration oracle.
    await this.assertWithinOtpLimit(userId);

    if (await this.users.existsByEmailHash(this.otp.hashEmail(newEmail))) {
      throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists.');
    }

    const issued = await this.issueOtp(
      OtpPurpose.NEW_EMAIL_VERIFY,
      userId,
      this.otp.encrypt(newEmail).toString('base64'),
    );
    await this.mail.sendOtp(newEmail, issued.code, OtpPurpose.NEW_EMAIL_VERIFY);

    // Only now, with nothing left that can fail, is the EMAIL_CHANGE code spent.
    await this.redis.deleteOtp(otpKey(OtpPurpose.EMAIL_CHANGE, userId));
    return { otpExpiresAt: issued.expiresAt };
  }

  /** POST /users/me/email/verify. Commits the change; no session revoke for an email change. */
  async verifyEmailChange(userId: string, code: string): Promise<SelfProfile> {
    const encrypted = await this.checkOtp<string>(OtpPurpose.NEW_EMAIL_VERIFY, userId, code, { consume: true });
    const emailEncrypted = Buffer.from(encrypted!, 'base64');
    // updateEmail turns a concurrent claim of the address into 409 EMAIL_TAKEN.
    await this.users.updateEmail(userId, this.otp.hashEmail(this.otp.decrypt(emailEncrypted)), emailEncrypted);
    return this.getSelf(userId);
  }

  /** PATCH /users/me/mobile. The pairing was already checked by ChangeMobileDto. */
  async changeMobile(userId: string, countryCode: string, mobileNumber: string, code: string): Promise<SelfProfile> {
    await this.checkOtp(OtpPurpose.MOBILE_CHANGE, userId, code, { consume: true });
    await this.users.updateMobile(userId, countryCode, this.otp.encrypt(mobileNumber));
    return this.getSelf(userId);
  }

  /**
   * POST /users/me/password. The code is checked first (so "same as current" cannot be probed
   * without one) and spent only after the commit. New hash + revoke every session in one transaction.
   */
  async changePassword(userId: string, code: string, newPassword: string): Promise<void> {
    await this.checkOtp(OtpPurpose.PASSWORD_CHANGE, userId, code, { consume: false });

    const user = await this.users.findById(userId);
    if (user!.passwordHash && (await this.otp.verifyPassword(newPassword, user!.passwordHash))) {
      // The code is still live: retrying with a different password needs no new code.
      throw this.samePassword();
    }

    await this.setPassword(userId, await this.otp.hashPassword(newPassword));
    await this.redis.deleteOtp(otpKey(OtpPurpose.PASSWORD_CHANGE, userId));
  }

  /** POST /users/me/deactivate. Under the last-admin lock, with every session revoked in the same transaction. */
  async deactivateSelf(userId: string, code: string): Promise<void> {
    await this.checkOtp(OtpPurpose.DEACTIVATION, userId, code, { consume: true });

    await this.withAdminLock(userId, async (ctx) => {
      if (ctx.activeAdminIds !== null && ctx.activeAdminIds.length === 1) {
        throw this.lastAdmin();
      }
      await this.users.deactivate(userId, ctx.tx);
      await this.tokens.revokeAll(userId, ctx.tx);
    });
  }

  // ---------------------------------------------------------------- /admin/users

  async listUsers(filter: UserFilter): Promise<{ items: AdminProfile[] }> {
    const users = await this.users.listUsers({ role: filter.role, status: filter.status });
    return { items: users.map((user) => this.toAdminProfile(user)) };
  }

  /**
   * PATCH /admin/users/:userId/role. The caller's role is re-read under the lock, so a stale
   * token cannot act. LAST_ADMIN applies only to the sole admin demoting themselves.
   */
  async changeRole(callerId: string, targetId: string, role: Role): Promise<AdminProfile> {
    const result = await this.withAdminLock(callerId, async (ctx) => {
      if (ctx.activeAdminIds === null) {
        throw this.notActiveAdmin();
      }

      if (targetId === callerId) {
        if (role === Role.USER) {
          if (ctx.activeAdminIds.length === 1) throw this.lastAdmin();
          throw new AppError(409, ErrorCode.CANNOT_MODIFY_SELF, 'Ask another admin to change your own role.');
        }
        // Re-affirming your own ADMIN role changes nothing, so there is nothing to audit.
        return { profile: this.toAdminProfile(ctx.caller), change: null };
      }

      const target = await this.users.findById(targetId, ctx.tx);
      if (!target) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'No such user.');
      }
      if (target.status !== UserStatus.ACTIVE) {
        throw new AppError(409, ErrorCode.USER_NOT_ACTIVE, 'Only an active user can have their role changed.');
      }

      await this.users.updateRole(target.id, role, ctx.tx);
      const updated = await this.users.findById(target.id, ctx.tx);
      return { profile: this.toAdminProfile(updated!), change: { from: target.role, to: role } };
    });

    // Logged only after the transaction has committed.
    if (result.change) {
      this.logger.log(
        auditLine(AuditEvent.ADMIN_ACTION, {
          actorId: callerId,
          targetId,
          action: 'ROLE_CHANGE',
          from: result.change.from,
          to: result.change.to,
        }),
      );
    }
    return result.profile;
  }

  /**
   * POST /admin/users/:userId/reactivate. Only a DEACTIVATED account; the role is kept. No lock:
   * this only ever adds an active admin back. The caller is re-checked in the database, so a
   * demoted or deactivated admin's still-valid token cannot reactivate anyone.
   */
  async reactivate(callerId: string, targetId: string): Promise<AdminProfile> {
    const caller = await this.users.findById(callerId);
    if (!caller || caller.role !== Role.ADMIN || caller.status !== UserStatus.ACTIVE) {
      throw this.notActiveAdmin();
    }

    const target = await this.users.findById(targetId);
    if (!target) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No such user.');
    }
    if (target.status !== UserStatus.DEACTIVATED) {
      throw new AppError(409, ErrorCode.NOT_DEACTIVATED, 'Only a deactivated account can be reactivated.');
    }

    await this.users.reactivate(target.id);
    const updated = await this.users.findById(target.id);

    this.logger.log(
      auditLine(AuditEvent.ADMIN_ACTION, {
        actorId: callerId,
        targetId: target.id,
        action: 'REACTIVATE',
        from: UserStatus.DEACTIVATED,
        to: UserStatus.ACTIVE,
      }),
    );
    return this.toAdminProfile(updated!);
  }

  // ---------------------------------------------------------------- first admin

  /**
   * Creates the first ADMIN from USER_BOOTSTRAP_ADMIN_EMAIL while `users` is empty, with no
   * password: the owner claims it through forgot/reset password. Runs after every module's
   * onModuleInit, so the migrations have been applied.
   */
  async onApplicationBootstrap(): Promise<void> {
    const rawEmail = this.config.get('bootstrapAdminEmail', { infer: true });
    if (!rawEmail) {
      this.logger.log('USER_BOOTSTRAP_ADMIN_EMAIL is not set; skipping the admin bootstrap');
      await this.warnIfNoAdmin();
      return;
    }

    // The same schema forgot-password uses, so an address it accepts can actually be claimed.
    const parsed = EmailSchema.safeParse(rawEmail);
    if (!parsed.success) {
      throw new Error(`Invalid USER_BOOTSTRAP_ADMIN_EMAIL: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }

    // The admin row and its UserRegistered commit together, so the first admin gets a wallet too.
    const created = await this.db.transaction(async (tx) => {
      const admin = await this.users.insertBootstrapAdminIfFirst(
        {
          id: this.otp.generateId(),
          displayName: BOOTSTRAP_ADMIN_DISPLAY_NAME,
          emailHash: this.otp.hashEmail(parsed.data),
          emailEncrypted: this.otp.encrypt(parsed.data),
        },
        tx,
      );
      if (admin) await this.outbox.add(userRegistered(admin), tx);
      return admin;
    });

    if (!created) {
      this.logger.log('Users already exist; skipping the admin bootstrap');
      await this.warnIfNoAdmin();
      return;
    }

    // userId only, never the address (NFR5.1).
    this.logger.log(auditLine(AuditEvent.ADMIN_BOOTSTRAPPED, { userId: created.id }));
    this.logger.log('First admin created with no password. It is claimed through POST /auth/password/forgot.');
  }

  /** Rows but no ACTIVE admin can only be fixed by hand, so say so loudly at startup. */
  private async warnIfNoAdmin(): Promise<void> {
    if (await this.users.hasActiveAdmin()) return;
    this.logger.warn(
      'No ACTIVE admin exists. Nobody can promote a user or reactivate an account. ' +
        'Recovery needs a manual database change — see "First admin" in user-service/AGENTS.md.',
    );
  }

  // ---------------------------------------------------------------- helpers

  /**
   * The last-admin lock: "no change may leave zero ACTIVE admins". Locks the caller's row, and
   * every active admin's row only when the caller is one, then runs `fn` in that transaction.
   */
  private withAdminLock<T>(callerId: string, fn: (ctx: AdminLockContext) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const caller = await this.users.findByIdForUpdate(callerId, tx);
      if (!caller) {
        throw new AppError(401, ErrorCode.TOKEN_INVALID, 'Your session is no longer valid.');
      }
      const activeAdminIds =
        caller.role === Role.ADMIN && caller.status === UserStatus.ACTIVE
          ? await this.users.selectActiveAdminIdsForUpdate(tx)
          : null;
      return fn({ tx, caller, activeAdminIds });
    });
  }

  /** One shared 3-per-10-minutes bucket per user across every self-service purpose. */
  private async assertWithinOtpLimit(userId: string): Promise<void> {
    const limit = await this.redis.hitOtpRequestLimit(userId);
    if (limit.blocked) {
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Too many codes requested.', {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
  }

  /** Writes a fresh code (replacing any older one) and returns it for mailing. */
  private async issueOtp(purpose: OtpPurpose, userId: string, data?: string): Promise<{ code: string; expiresAt: Date }> {
    const code = this.otp.generate();
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);
    await this.redis.saveOtp(
      otpKey(purpose, userId),
      { otpHash: this.otp.hash(purpose, userId, code), attempts: 0, otpExpiresAt: expiresAt.getTime(), data },
      OTP_TTL_SECONDS,
    );
    return { code, expiresAt };
  }

  /** Throws OTP_INVALID / OTP_EXPIRED, or returns the record's `data`. */
  private async checkOtp<T = unknown>(
    purpose: OtpPurpose,
    userId: string,
    code: string,
    options: { consume: boolean },
  ): Promise<T | undefined> {
    const result = await this.redis.verifyOtp<T>(otpKey(purpose, userId), this.otp.hash(purpose, userId, code), options);
    if (result.status !== 'OK') throw otpRejected(result);
    return result.record.data;
  }

  private toSelfProfile(user: UserRecord): SelfProfile {
    return {
      userId: user.id,
      displayName: user.displayName,
      email: this.otp.decrypt(user.emailEncrypted),
      countryCode: user.countryCode,
      mobileNumber: user.mobileEncrypted ? this.otp.decrypt(user.mobileEncrypted) : null,
    };
  }

  private toAdminProfile(user: UserRecord): AdminProfile {
    return {
      ...this.toSelfProfile(user),
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private lastAdmin(): AppError {
    return new AppError(409, ErrorCode.LAST_ADMIN, 'Promote another admin first — you are the only one.');
  }

  private notActiveAdmin(): AppError {
    return new AppError(403, ErrorCode.FORBIDDEN, 'You are not an active admin.');
  }

  private samePassword(): AppError {
    return new AppError(400, ErrorCode.VALIDATION_ERROR, 'Your new password must be different from your current one.');
  }
}
