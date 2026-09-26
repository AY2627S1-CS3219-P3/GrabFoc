/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-26
 * Scope: Generated the parameterized SQL for the `users` table and the row-to-record mapping.
 * Author review: Read in full; every column checked against migrations/001_init.sql, and the
 *                register → verify flow was run against the compose stack.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { Role } from '../auth/caller';
import { PG_POOL } from '../db/database';

/** Mirrors the `user_status` enum in migrations/001_init.sql. */
export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'DEACTIVATED',
  SUSPENDED: 'SUSPENDED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * A row of `users`, in camelCase (AGENTS.md: JSON and TypeScript are camelCase, columns are
 * snake_case). The email and mobile are the raw AES-256-GCM buffers — decrypting them is the
 * caller's decision, so nothing accidentally logs a plaintext address.
 *
 * `email_hash` is deliberately NOT here, even though the column is NOT NULL. It is a lookup
 * key, not data: whoever reads a row by address computed the hash in order to find it, so
 * nothing ever needs it back. Leaving it out of the type means a response body built by
 * spreading a record cannot leak it by accident.
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

/** What `insertIfAbsent` needs. `emailHash` is the lookup key; the address itself is never stored in the clear. */
export interface NewUser {
  id: string;
  displayName: string;
  emailHash: string;
  emailEncrypted: Buffer;
  countryCode: string;
  mobileEncrypted: Buffer;
  passwordHash: string;
}

/** Every column that is read back, in one place, so the SELECT list and the mapping cannot drift apart. */
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
 * All SQL against `users` lives here. Plain parameterized queries through `pg`, no ORM
 * (AGENTS.md, "Implementation") — so the last-admin lock later on can be written exactly as
 * `SELECT … FOR UPDATE` rather than fought with.
 *
 * Every method takes an optional client so it can be enlisted in a caller's transaction via
 * `withTransaction`; without one it runs on the pool as its own statement.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Whether any account already holds this address — ACTIVE, DEACTIVATED or SUSPENDED alike
   * (U1.1.3). Deactivating does not release an email, so re-registering it is still a 409.
   */
  async existsByEmailHash(emailHash: string, client?: PoolClient): Promise<boolean> {
    const { rowCount } = await (client ?? this.pool).query(
      'SELECT 1 FROM users WHERE email_hash = $1',
      [emailHash],
    );
    return rowCount !== null && rowCount > 0;
  }

  async findByEmailHash(emailHash: string, client?: PoolClient): Promise<UserRecord | null> {
    const { rows } = await (client ?? this.pool).query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE email_hash = $1`,
      [emailHash],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /**
   * Creates a verified account, or returns null if the address was taken in the meantime.
   *
   * `ON CONFLICT DO NOTHING` rather than a prior `SELECT`: the two simultaneous sign-ups the
   * UNIQUE constraint exists for would both pass a check-then-insert, and the loser would
   * surface as a raw 23505 and a 500. This turns that race into an ordinary 409 (AGENTS.md,
   * "Register and verify").
   */
  async insertIfAbsent(user: NewUser, client?: PoolClient): Promise<UserRecord | null> {
    const { rows } = await (client ?? this.pool).query<UserRow>(
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
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
