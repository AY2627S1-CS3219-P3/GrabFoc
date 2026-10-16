/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-27
 * Scope: Generated the first-admin bootstrap from the "First admin" rules in
 *        user-service/AGENTS.md — the startup hook, the single-statement guarded insert, and
 *        the startup validation of USER_BOOTSTRAP_ADMIN_EMAIL.
 * Author review: Read in full; each rule checked against the section it cites, and the whole
 *                sequence run against the compose stack on an empty database — bootstrap,
 *                forgot password, reset, then login as ADMIN.
 */
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EmailSchema } from '../auth/auth.schemas';
import { AuditEvent, auditLine } from '../common/logger';
import { config } from '../config';
import { encrypt, generateId, hashEmail } from '../crypto';
import { UserRecord, UsersRepository } from './users.repository';

/**
 * The first admin's display name. There is no form to take one from — the account is created
 * from a single environment variable — and the owner can change it with `PATCH /users/me` once
 * they have claimed it.
 *
 * AI-proposed: AGENTS.md specifies the role, status and NULL password for this row but not the
 * name, and `display_name` is NOT NULL.
 */
export const BOOTSTRAP_ADMIN_DISPLAY_NAME = 'Administrator';

/**
 * Creates the first ADMIN account at startup, so a fresh deployment has an administrator
 * without anyone editing the database by hand (AGENTS.md, "First admin"; D2 asks for a
 * promotion workflow that needs no developer intervention, and this is its starting point).
 *
 * The account is created **without a password**. Nobody can log into it as it stands — login
 * treats a NULL `password_hash` as a wrong password — so the owner of the configured inbox
 * claims it through `POST /auth/password/forgot` and `POST /auth/password/reset`. That is why
 * there is no `USER_BOOTSTRAP_ADMIN_PASSWORD`: no admin credential ever sits in configuration,
 * and the password that ends up on the account went through the same policy as everyone
 * else's.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AdminBootstrap');

  constructor(private readonly users: UsersRepository) {}

  /**
   * `onApplicationBootstrap`, not `onModuleInit`: Nest runs every module's `onModuleInit`
   * first, and one of those is `DatabaseLifecycle`, which applies the migrations. Hooking in
   * here is what guarantees the `users` table exists before this runs. It still finishes
   * before `app.listen()`, so the service never serves a request without its admin.
   */
  async onApplicationBootstrap(): Promise<void> {
    await this.run(config.bootstrapAdminEmail);
  }

  /**
   * Takes the address as an argument rather than reading `config` directly, so the tests can
   * drive every branch without rewriting the environment.
   *
   * Returns the row it created, or null when it created none — unset variable, or a `users`
   * table that already has rows.
   */
  async run(rawEmail: string | undefined): Promise<UserRecord | null> {
    if (!rawEmail) {
      // Not an error. A deployment whose admin already exists does not need the variable, and
      // refusing to boot without it would make the service unstartable after the first run.
      this.logger.log('USER_BOOTSTRAP_ADMIN_EMAIL is not set; skipping the admin bootstrap');
      await this.warnIfNoAdmin();
      return null;
    }

    // Validated with the same schema the endpoints use, so the address is normalised and is on
    // an allowed NUS domain. This matters beyond tidiness: the account is claimed through
    // `POST /auth/password/forgot`, which validates its body with this schema too, so an
    // address it rejects would produce an admin account that nobody could ever claim. Failing
    // here turns that into a startup error naming the variable.
    const parsed = EmailSchema.safeParse(rawEmail);
    if (!parsed.success) {
      throw new Error(
        `Invalid USER_BOOTSTRAP_ADMIN_EMAIL: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const email = parsed.data;

    const created = await this.users.insertBootstrapAdminIfFirst({
      id: generateId(),
      displayName: BOOTSTRAP_ADMIN_DISPLAY_NAME,
      // The address is stored exactly as a registered user's would be: encrypted in
      // `email_encrypted`, and keyed-hashed in `email_hash` so forgot-password can find it.
      // The plaintext exists only in the environment and in this call.
      emailHash: hashEmail(email),
      emailEncrypted: encrypt(email),
    });

    if (!created) {
      // The normal path on every start after the first. Also the path AGENTS.md warns about:
      // if someone registered before this variable was ever set, the bootstrap will not run,
      // and it never will again, because the table is no longer empty.
      this.logger.log('Users already exist; skipping the admin bootstrap');
      await this.warnIfNoAdmin();
      return null;
    }

    // `{userId, timestamp}` and nothing else (AGENTS.md, "Logging"). Naming the address here
    // would write the admin's email into the logs on every fresh deployment, which is the one
    // thing NFR5.1 forbids — and `auditLine` redacts by field name, so a field called `email`
    // would come out `[REDACTED]` and merely look like an oversight.
    this.logger.log(auditLine(AuditEvent.ADMIN_BOOTSTRAPPED, { userId: created.id }));
    this.logger.log(
      'First admin created with no password. It is claimed through POST /auth/password/forgot.',
    );
    return created;
  }

  /**
   * A deployment with rows but no ACTIVE admin cannot promote anyone, reactivate anyone or edit
   * a location, and the bootstrap will not fix it because `users` is no longer empty — recovery
   * means editing the database by hand (AGENTS.md, "The sole admin cannot deactivate").
   *
   * Nothing here can repair that, so this only says so loudly at startup rather than leaving it
   * to be discovered through a 403. AI-proposed: AGENTS.md names the state but asks for no
   * warning.
   */
  private async warnIfNoAdmin(): Promise<void> {
    if (await this.users.hasActiveAdmin()) return;
    this.logger.warn(
      'No ACTIVE admin exists. Nobody can promote a user or reactivate an account. ' +
        'Recovery needs a manual database change — see "First admin" in user-service/AGENTS.md.',
    );
  }
}
