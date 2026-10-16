/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/users/users.repository.ts (original disclosure: Claude Code,
 *   Claude Opus 5 and Claude Sonnet 5, 2026-09-26/27): same SQL, now through DatabaseService with
 *   an optional `tx`. UserStatus moved to common/enums.
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Role } from '../common/enums/role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-codes';
import { DatabaseService } from '../infra/database/database.service';

/**
 * A `users` row in camelCase. Email and mobile stay encrypted; decrypting is the caller's
 * choice. `email_hash` is left out on purpose: it is a lookup key, never data to return.
 */
export interface UserRecord {
  id: string;
  displayName: string;
  emailEncrypted: Buffer;
  countryCode: string | null;
  mobileEncrypted: Buffer | null;
  passwordHash: string | null;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
}

export interface NewUser {
  id: string;
  displayName: string;
  emailHash: string;
  emailEncrypted: Buffer;
  countryCode: string;
  mobileEncrypted: Buffer;
  passwordHash: string;
}

/** The first admin comes from an env variable: no mobile and no password (claimed via forgot password). */
export interface NewBootstrapAdmin {
  id: string;
  displayName: string;
  emailHash: string;
  emailEncrypted: Buffer;
}

/** Exact-match filters for `GET /admin/users`. */
export interface UserFilter {
  role?: Role;
  status?: UserStatus;
}

const COLUMNS = `id, display_name, email_encrypted, country_code, mobile_encrypted,
                 password_hash, role, status, created_at, updated_at, deactivated_at`;

interface UserRow {
  id: string;
  display_name: string;
  email_encrypted: Buffer;
  country_code: string | null;
  mobile_encrypted: Buffer | null;
  password_hash: string | null;
  role: Role;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
  deactivated_at: Date | null;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    emailEncrypted: row.email_encrypted,
    countryCode: row.country_code,
    mobileEncrypted: row.mobile_encrypted,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deactivatedAt: row.deactivated_at,
  };
}

/**
 * All SQL against `users`: parameterised queries, no ORM. Not exported from UsersModule.
 * Every UPDATE sets `updated_at` itself, because no trigger maintains it.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Any account with this address, whatever its status: deactivating does not release an email. */
  async existsByEmailHash(emailHash: string, tx?: PoolClient): Promise<boolean> {
    const { rowCount } = await this.db.query('SELECT 1 FROM users WHERE email_hash = $1', [emailHash], tx);
    return (rowCount ?? 0) > 0;
  }

  async findById(id: string, tx?: PoolClient): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id], tx);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByEmailHash(emailHash: string, tx?: PoolClient): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE email_hash = $1`,
      [emailHash],
      tx,
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /**
   * Creates a verified account, or returns null if the address was taken meanwhile.
   * ON CONFLICT turns a race between two sign-ups into a 409 instead of a 500.
   */
  async insertIfAbsent(user: NewUser, tx?: PoolClient): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO users (id, display_name, email_hash, email_encrypted,
                          country_code, mobile_encrypted, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email_hash) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        user.id,
        user.displayName,
        user.emailHash,
        user.emailEncrypted,
        user.countryCode,
        user.mobileEncrypted,
        user.passwordHash,
      ],
      tx,
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /**
   * Inserts the first ADMIN only while `users` is empty, in one statement, so no registration
   * can slip in between the check and the write. Null on every start after the first.
   */
  async insertBootstrapAdminIfFirst(admin: NewBootstrapAdmin, tx?: PoolClient): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO users (id, display_name, email_hash, email_encrypted, role, status)
       SELECT $1, $2, $3, $4, 'ADMIN', 'ACTIVE'
       WHERE NOT EXISTS (SELECT 1 FROM users)
       ON CONFLICT (email_hash) DO NOTHING
       RETURNING ${COLUMNS}`,
      [admin.id, admin.displayName, admin.emailHash, admin.emailEncrypted],
      tx,
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** Unlocked read, for the startup diagnostic only. */
  async hasActiveAdmin(tx?: PoolClient): Promise<boolean> {
    const { rowCount } = await this.db.query(
      "SELECT 1 FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1",
      [],
      tx,
    );
    return (rowCount ?? 0) > 0;
  }

  async updatePasswordHash(userId: string, passwordHash: string, tx?: PoolClient): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1',
      [userId, passwordHash],
      tx,
    );
    return (rowCount ?? 0) > 0;
  }

  async updateDisplayName(userId: string, displayName: string, tx?: PoolClient): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1',
      [userId, displayName],
      tx,
    );
    return (rowCount ?? 0) > 0;
  }

  /** Newest first. Filters are bound as parameters, never interpolated. */
  async listUsers(filter: UserFilter, tx?: PoolClient): Promise<UserRecord[]> {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filter.role) {
      params.push(filter.role);
      conditions.push(`role = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${COLUMNS} FROM users ${where} ORDER BY created_at DESC`,
      params,
      tx,
    );
    return rows.map(toRecord);
  }

  /** `findById` under FOR UPDATE, for the last-admin lock. Needs a transaction. */
  async findByIdForUpdate(id: string, tx: PoolClient): Promise<UserRecord | null> {
    const { rows } = await this.db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [id], tx);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** Every active admin's id, locked. ORDER BY id so concurrent lockers cannot deadlock. */
  async selectActiveAdminIdsForUpdate(tx: PoolClient): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE",
      [],
      tx,
    );
    return rows.map((row) => row.id);
  }

  async updateRole(userId: string, role: Role, tx: PoolClient): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'UPDATE users SET role = $2, updated_at = now() WHERE id = $1',
      [userId, role],
      tx,
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Commits an email change. A concurrent claim of the address hits the UNIQUE constraint
   * (23505), which becomes the same 409 EMAIL_TAKEN as the earlier pre-check.
   */
  async updateEmail(userId: string, emailHash: string, emailEncrypted: Buffer, tx?: PoolClient): Promise<boolean> {
    try {
      const { rowCount } = await this.db.query(
        'UPDATE users SET email_hash = $2, email_encrypted = $3, updated_at = now() WHERE id = $1',
        [userId, emailHash, emailEncrypted],
        tx,
      );
      return (rowCount ?? 0) > 0;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new AppError(409, ErrorCode.EMAIL_TAKEN, 'An account with this email already exists.');
      }
      throw error;
    }
  }

  /** `mobileEncrypted` holds only the digits; the country code is its own plaintext column. */
  async updateMobile(userId: string, countryCode: string, mobileEncrypted: Buffer, tx?: PoolClient): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'UPDATE users SET country_code = $2, mobile_encrypted = $3, updated_at = now() WHERE id = $1',
      [userId, countryCode, mobileEncrypted],
      tx,
    );
    return (rowCount ?? 0) > 0;
  }

  async deactivate(userId: string, tx: PoolClient): Promise<boolean> {
    const { rowCount } = await this.db.query(
      "UPDATE users SET status = 'DEACTIVATED', deactivated_at = now(), updated_at = now() WHERE id = $1",
      [userId],
      tx,
    );
    return (rowCount ?? 0) > 0;
  }

  async reactivate(userId: string, tx?: PoolClient): Promise<boolean> {
    const { rowCount } = await this.db.query(
      "UPDATE users SET status = 'ACTIVE', deactivated_at = NULL, updated_at = now() WHERE id = $1",
      [userId],
      tx,
    );
    return (rowCount ?? 0) > 0;
  }
}
