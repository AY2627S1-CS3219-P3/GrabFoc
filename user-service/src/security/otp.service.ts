/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Moved the helpers in user-service/src/crypto/ (email.ts, encryption.ts, password.ts,
 *   tokens.ts; original disclosures: Claude Code, Claude Opus 5, 2026-09-25) into one injectable
 *   service reading its keys from ConfigService. hashEmail no longer normalises (the DTOs do).
 *   The refresh-token helpers moved to TokensService.
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 */
// AI-generated (reviewed by Deanson)
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, randomUUID } from 'crypto';
import { MAX_PASSWORD_BYTES, OTP_LENGTH } from '../common/validation/fields';
import type { AppConfig } from '../config/env.validation';
import { OtpPurpose } from '../infra/redis/redis.constants';

/** bcrypt work factor (U1.2.1). The cost is stored in the hash, so raising it later is safe. */
const BCRYPT_COST = 12;

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, the size GCM is defined for
const TAG_LENGTH = 16;

/**
 * A real bcrypt hash of a random string nobody holds. Login compares against it when there is
 * no account (or no password yet), so an unknown address takes as long as a wrong password.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$b8LEOM0Z5e6Nt2Y55OpKqe8sIUQBV2zsvQ.EDn2/RE6T9h42pTx3i';

/**
 * Every cryptographic helper the service uses, in one place to review. Pure: no Redis, no
 * database. OTP comparison happens in Redis (VERIFY_OTP), so there is no verify() here.
 */
@Injectable()
export class OtpService {
  private readonly aesKey: Buffer;
  private readonly emailHmacKey: Buffer;
  private readonly otpHmacKey: Buffer;

  constructor(config: ConfigService<AppConfig, true>) {
    this.aesKey = config.get('aesKey', { infer: true });
    this.emailHmacKey = config.get('emailHmacKey', { infer: true });
    this.otpHmacKey = config.get('otpHmacKey', { infer: true });
  }

  // ---------------------------------------------------------------- OTP

  /** A 6-digit code from the CSPRNG, zero-padded. `randomInt` has no modulo bias. */
  generate(): string {
    return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
  }

  /**
   * What Redis stores instead of the code. Keyed and bound to the purpose and subject, so a
   * memory dump cannot reverse it and a code for one action cannot be replayed on another.
   */
  hash(purpose: OtpPurpose, subject: string, code: string): string {
    return createHmac('sha256', this.otpHmacKey).update(`${purpose}:${subject}:${code}`).digest('hex');
  }

  // ---------------------------------------------------------------- email

  /**
   * The `users.email_hash` lookup key (U1.1.3): deterministic, so it can be UNIQUE, and keyed,
   * so a leaked database cannot be reversed from a list of NUS addresses. Expects an already
   * normalised address (EmailSchema does that). 64 hex characters.
   */
  hashEmail(email: string): string {
    return createHmac('sha256', this.emailHmacKey).update(email).digest('hex');
  }

  // ---------------------------------------------------------------- AES-256-GCM

  /** Encrypts to `iv | tag | ciphertext`, the layout the BYTEA columns store. Fresh IV each call. */
  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGORITHM, this.aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  /** Reverses `encrypt`. Throws if the payload was truncated or altered. */
  decrypt(payload: Buffer): string {
    if (payload.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Encrypted payload is too short to contain an IV and tag.');
    }
    const iv = payload.subarray(0, IV_LENGTH);
    const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(AES_ALGORITHM, this.aesKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
  }

  // ---------------------------------------------------------------- passwords

  /** A 60-character bcrypt hash. Rejects over 72 bytes, which bcrypt would silently truncate. */
  async hashPassword(plaintext: string): Promise<string> {
    if (Buffer.byteLength(plaintext, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new Error(`Password exceeds ${MAX_PASSWORD_BYTES} bytes; bcrypt would silently truncate it.`);
    }
    return hash(plaintext, BCRYPT_COST);
  }

  async verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
    if (Buffer.byteLength(plaintext, 'utf8') > MAX_PASSWORD_BYTES) {
      // Still pay for a comparison, so an over-long candidate is not detectable by timing.
      await compare(plaintext.slice(0, MAX_PASSWORD_BYTES), DUMMY_PASSWORD_HASH);
      return false;
    }
    return compare(plaintext, passwordHash);
  }

  // ---------------------------------------------------------------- ids

  /** A v4 UUID from the CSPRNG, for `users` and `refresh_tokens` primary keys. */
  generateId(): string {
    return randomUUID();
  }
}
