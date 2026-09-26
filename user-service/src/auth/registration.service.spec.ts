/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the register / verify / resend tests against fake OTP, mail, repository and
 *        session collaborators.
 * Author review: Read in full; the ordering and leak assertions were each confirmed to fail
 *                against a deliberately broken version of the service.
 */
import { AppError } from '../common/app-error';
import { ErrorCode } from '../common/error-codes';
import { OtpPurpose, decrypt } from '../crypto';
import { MailService } from '../mail/mail.service';
import { OtpService } from '../otp/otp.service';
import { IssuedOtp } from '../otp/otp.service';
import { NewUser, UserRecord, UserStatus, UsersRepository } from '../users/users.repository';
import { Role } from './caller';
import { RegisterInput } from './auth.schemas';
import { PENDING_SIGNUP_TTL_SECONDS, PendingSignup, RegistrationService } from './registration.service';
import { AuthResponse, SessionService } from './session.service';

const INPUT: RegisterInput = {
  displayName: 'Alex Tan',
  email: 'alex@u.nus.edu',
  countryCode: '+65',
  mobileNumber: '91234567',
  password: 'Passw0rdSafe',
};

const EMAIL_HASH_PATTERN = /^[0-9a-f]{64}$/;

function build() {
  const calls: string[] = [];
  const record = (name: string) => calls.push(name);

  const users = {
    existsByEmailHash: jest.fn<Promise<boolean>, [string]>(async () => {
      record('existsByEmailHash');
      return false;
    }),
    insertIfAbsent: jest.fn<Promise<UserRecord | null>, [NewUser]>(async (user) => {
      record('insertIfAbsent');
      return {
        id: user.id,
        displayName: user.displayName,
        role: Role.USER,
        status: UserStatus.ACTIVE,
      } as unknown as UserRecord;
    }),
  };

  const otp = {
    assertWithinRequestLimit: jest.fn<Promise<void>, [string]>(async () => {
      record('assertWithinRequestLimit');
    }),
    issueRecord: jest.fn<Promise<IssuedOtp>, [string, OtpPurpose, string, object, number?]>(
      async () => {
        record('issueRecord');
        return { code: '123456', expiresAt: new Date('2026-09-26T10:05:00Z') };
      },
    ),
    reissueRecord: jest.fn<Promise<IssuedOtp | null>, [string, OtpPurpose, string]>(async () => {
      record('reissueRecord');
      return { code: '654321', expiresAt: new Date('2026-09-26T10:05:00Z') };
    }),
    verifyRecord: jest.fn<Promise<PendingSignup>, [string, OtpPurpose, string, string]>(),
  };

  const mail = {
    sendOtp: jest.fn<Promise<void>, [string, string, OtpPurpose]>(async () => {
      record('sendOtp');
    }),
  };

  const sessions = {
    issue: jest.fn<Promise<AuthResponse>, [unknown]>(
      async () => ({ accessToken: 'a', refreshToken: 'r' }) as AuthResponse,
    ),
  };

  const service = new RegistrationService(
    users as unknown as UsersRepository,
    otp as unknown as OtpService,
    mail as unknown as MailService,
    sessions as unknown as SessionService,
  );

  return { service, users, otp, mail, sessions, calls };
}

/** The value handed to Redis, i.e. everything `reg:{emailHash}` will hold. */
function storedSignup(otp: ReturnType<typeof build>['otp']): PendingSignup {
  return otp.issueRecord.mock.calls[0][3] as PendingSignup;
}

describe('register', () => {
  it('stores a pending sign-up and mails the code, without creating a user', async () => {
    const { service, users, otp, mail } = build();

    const result = await service.register(INPUT);

    expect(users.insertIfAbsent).not.toHaveBeenCalled();
    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.otpExpiresAt).toEqual(new Date('2026-09-26T10:05:00Z'));
    expect(mail.sendOtp).toHaveBeenCalledWith(INPUT.email, '123456', OtpPurpose.REGISTRATION);
    // The key is derived from the email hash, so the address is not in the key either.
    expect(otp.issueRecord.mock.calls[0][0]).toMatch(/^reg:[0-9a-f]{64}$/);
    expect(otp.issueRecord.mock.calls[0][4]).toBe(PENDING_SIGNUP_TTL_SECONDS);
  });

  it('counts the request against the rate limit BEFORE looking the email up', async () => {
    // U1.1.3 makes 409 EMAIL_TAKEN an enumeration oracle by design; the limit is what bounds
    // it. Checking the address first would let a caller probe freely until the 4th attempt.
    const { service, calls } = build();

    await service.register(INPUT);

    expect(calls.indexOf('assertWithinRequestLimit')).toBeLessThan(calls.indexOf('existsByEmailHash'));
  });

  it('gives up before hashing a password when the caller is already blocked', async () => {
    const { service, otp, users, mail } = build();
    otp.assertWithinRequestLimit.mockRejectedValueOnce(
      new AppError(429, ErrorCode.RATE_LIMITED, 'Too many codes requested.'),
    );

    await expect(service.register(INPUT)).rejects.toMatchObject({ code: ErrorCode.RATE_LIMITED });
    expect(users.existsByEmailHash).not.toHaveBeenCalled();
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('rejects an address that already has an account, of any status (U1.1.3)', async () => {
    const { service, users, otp, mail } = build();
    users.existsByEmailHash.mockResolvedValueOnce(true);

    await expect(service.register(INPUT)).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
      status: 409,
    });
    expect(otp.issueRecord).not.toHaveBeenCalled();
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('keeps nothing in plaintext: the stored sign-up has no address, number or password', async () => {
    const { service, otp } = build();

    await service.register(INPUT);
    const stored = storedSignup(otp);
    const serialised = JSON.stringify(stored);

    expect(serialised).not.toContain(INPUT.email);
    expect(serialised).not.toContain(INPUT.mobileNumber);
    expect(serialised).not.toContain(INPUT.password);
    // ...but it is recoverable, because the account still has to be created from it.
    expect(decrypt(Buffer.from(stored.emailEncrypted, 'base64'))).toBe(INPUT.email);
    expect(decrypt(Buffer.from(stored.mobileEncrypted, 'base64'))).toBe(INPUT.mobileNumber);
  });

  it('hashes the password with bcrypt before it is stored anywhere', async () => {
    const { service, otp } = build();

    await service.register(INPUT);

    expect(storedSignup(otp).passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('lets a 503 from the mail server through, leaving the sign-up in place to resend', async () => {
    const { service, mail, otp } = build();
    mail.sendOtp.mockRejectedValueOnce(
      new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Could not send the verification email.'),
    );

    await expect(service.register(INPUT)).rejects.toMatchObject({ status: 503 });
    expect(otp.issueRecord).toHaveBeenCalled();
  });
});

describe('verify', () => {
  const pending: PendingSignup = {
    userId: '11111111-1111-4111-8111-111111111111',
    displayName: 'Alex Tan',
    emailEncrypted: Buffer.from('email').toString('base64'),
    countryCode: '+65',
    mobileEncrypted: Buffer.from('mobile').toString('base64'),
    passwordHash: '$2b$12$hash',
  };

  it('creates the account from the pending sign-up and returns a session', async () => {
    const { service, users, otp, sessions } = build();
    otp.verifyRecord.mockResolvedValueOnce(pending);

    await service.verify({ email: INPUT.email, otp: '123456' });

    const inserted = users.insertIfAbsent.mock.calls[0][0];
    expect(inserted).toMatchObject({
      id: pending.userId,
      displayName: pending.displayName,
      countryCode: '+65',
      passwordHash: pending.passwordHash,
    });
    expect(inserted.emailHash).toMatch(EMAIL_HASH_PATTERN);
    // Back to the Buffers the BYTEA columns hold, not the base64 Redis carried them in.
    expect(inserted.emailEncrypted).toEqual(Buffer.from('email'));
    expect(inserted.mobileEncrypted).toEqual(Buffer.from('mobile'));
    expect(sessions.issue).toHaveBeenCalled();
  });

  it('verifies the code against the pending record, not a standalone OTP key', async () => {
    const { service, otp } = build();
    otp.verifyRecord.mockResolvedValueOnce(pending);

    await service.verify({ email: INPUT.email, otp: '123456' });

    expect(otp.verifyRecord.mock.calls[0][0]).toMatch(/^reg:[0-9a-f]{64}$/);
    expect(otp.verifyRecord.mock.calls[0][1]).toBe(OtpPurpose.REGISTRATION);
  });

  it('passes an OTP failure straight through, creating nothing', async () => {
    const { service, users, otp, sessions } = build();
    otp.verifyRecord.mockRejectedValueOnce(
      new AppError(400, ErrorCode.OTP_INVALID, 'That code is not correct.', {
        attemptsRemaining: 2,
      }),
    );

    await expect(service.verify({ email: INPUT.email, otp: '000000' })).rejects.toMatchObject({
      code: ErrorCode.OTP_INVALID,
    });
    expect(users.insertIfAbsent).not.toHaveBeenCalled();
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it('issues no session when the address was claimed between register and verify', async () => {
    const { service, users, otp, sessions } = build();
    otp.verifyRecord.mockResolvedValueOnce(pending);
    users.insertIfAbsent.mockResolvedValueOnce(null);

    await expect(service.verify({ email: INPUT.email, otp: '123456' })).rejects.toMatchObject({
      code: ErrorCode.EMAIL_TAKEN,
      status: 409,
    });
    expect(sessions.issue).not.toHaveBeenCalled();
  });
});

describe('resend', () => {
  it('replaces the code in the existing sign-up and mails it', async () => {
    const { service, otp, mail } = build();

    const result = await service.resend({ email: INPUT.email });

    expect(otp.reissueRecord.mock.calls[0][0]).toMatch(/^reg:[0-9a-f]{64}$/);
    expect(mail.sendOtp).toHaveBeenCalledWith(INPUT.email, '654321', OtpPurpose.REGISTRATION);
    expect(result.otpExpiresAt).toEqual(new Date('2026-09-26T10:05:00Z'));
  });

  it('counts the request BEFORE looking for the sign-up', async () => {
    const { service, calls } = build();

    await service.resend({ email: INPUT.email });

    expect(calls.indexOf('assertWithinRequestLimit')).toBeLessThan(calls.indexOf('reissueRecord'));
  });

  it('returns 404 and sends nothing when there is no sign-up waiting', async () => {
    const { service, otp, mail } = build();
    otp.reissueRecord.mockResolvedValueOnce(null);

    await expect(service.resend({ email: INPUT.email })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      status: 404,
    });
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });
});
