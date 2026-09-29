/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the login sequence from the four numbered steps under "Login" in
 *        user-service/AGENTS.md.
 * Author review: Read in full; each step checked against the rule and the backlog ID it cites,
 *                and the whole flow run against the compose stack including the lockout.
 */
import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { hashEmail, verifyPassword, DUMMY_PASSWORD_HASH } from '../crypto';
import { UserStatus, UsersRepository } from '../users/users.repository';
import { LoginInput } from './auth.schemas';
import { LockoutService } from './lockout.service';
import { AuthResponse, SessionService } from './session.service';

@Injectable()
export class LoginService {
  constructor(
    private readonly users: UsersRepository,
    private readonly lockout: LockoutService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * `POST /auth/login` (U2.1.2, U2.1.3, U2.3.1). The four numbered steps in AGENTS.md, in
   * order — the order is the security property, not an implementation detail.
   *
   * The endpoint must answer identically for an address that has no account and one whose
   * password was wrong: same status, same code, same body, same time. Anything else turns
   * login into a way to find out who has an NUS account here.
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    const emailHash = hashEmail(input.email);

    // 1. Locked accounts are refused before anything else, so a lockout costs no database
    //    query and no bcrypt comparison — which is most of the point of having one.
    await this.lockout.assertNotLocked(emailHash);

    const user = await this.users.findByEmailHash(emailHash);

    // 2. No account, or an account with no password yet (the bootstrap admin before it is
    //    claimed), still pays for a full bcrypt comparison against a fixed hash. Skipping it
    //    would return the 401 in a millisecond instead of ~250, and that difference alone
    //    tells a caller which addresses are registered.
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const correct = await verifyPassword(input.password, passwordHash);

    // 3. Both branches converge here — a wrong password and an address with no account are
    //    the same event. 401 for the first four failures, 423 on the fifth.
    if (!user || !correct) {
      throw await this.lockout.recordFailure(emailHash);
    }

    // 4. Only now, past a correct password, is anything revealed about the account. Checking
    //    status earlier would let anyone discover a deactivated account without knowing its
    //    password.
    await this.lockout.clearFailures(emailHash);

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

    return this.sessions.issue(user);
  }
}
