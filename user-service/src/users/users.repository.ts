/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5; Claude Sonnet 5 for the 2026-09-27 additions),
 *       date: 2026-09-26, updated 2026-09-27
 * Scope: Generated the parameterized SQL for the `users` table and the row-to-record mapping.
 *        2026-09-27: added `listUsers` for GET /admin/users (Step 10, endpoint 1); added
 *        `findByIdForUpdate`, `selectActiveAdminIdsForUpdate` and `updateRole` for
 *        PATCH /admin/users/:userId/role (Step 10, endpoint 2).
 * Author review: Read in full; every column checked against migrations/001_init.sql, and the
 *                register → verify flow was run against the compose stack. `listUsers` was
 *                verified via Postman on 2026-09-27 (role/status filters, ordering). The
 *                role-change additions were verified via Postman on 2026-09-28 — see
 *                /ai/usage-log.md.
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

/**
 * What `insertBootstrapAdminIfFirst` needs. Far less than `NewUser`: the first admin is created
 * from an environment variable, not from a filled-in form, so there is no mobile number to
 * store and no password to hash — the account is claimed through "forgot password" (AGENTS.md,
 * "First admin").
 */
export interface NewBootstrapAdmin {
  id: string;
  displayName: string;
  emailHash: string;
  emailEncrypted: Buffer;
}

/** Optional filters for `listUsers` (Step 10's `GET /admin/users`). Both are exact matches. */
export interface AdminUserFilter {
  role?: Role;
  status?: UserStatus;
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

  /**
   * Used by `POST /auth/refresh`, which reloads the user on every rotation. That reload is
   * what makes a demotion or a deactivation take effect within 15 minutes without any shared
   * session store — the role in the next access token comes from here, not from the old one.
   */
  async findById(id: string, client?: PoolClient): Promise<UserRecord | null> {
    const { rows } = await (client ?? this.pool).query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ? toRecord(rows[0]) : null;
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

  /**
   * Inserts the first ADMIN, but **only while `users` is completely empty** (AGENTS.md, "First
   * admin"). Returns the row it created, or null if it created nothing — which is the normal
   * case on every start after the first.
   *
   * One statement, deliberately. `WHERE NOT EXISTS` and the INSERT share a snapshot, so there
   * is no window between checking and writing for a registration to slip into. Two containers
   * starting together would both find the table empty and both try to insert; `ON CONFLICT DO
   * NOTHING` turns the loser into a no-op instead of a 23505 that would crash the boot. That is
   * why no advisory lock is needed here, unlike the migrator.
   *
   * `country_code`, `mobile_encrypted` and `password_hash` are left to their NULL defaults. The
   * schema permits NULL in those three columns for exactly this row.
   */
  async insertBootstrapAdminIfFirst(
    admin: NewBootstrapAdmin,
    client?: PoolClient,
  ): Promise<UserRecord | null> {
    const { rows } = await (client ?? this.pool).query<UserRow>(
      `INSERT INTO users (id, display_name, email_hash, email_encrypted, role, status)
       SELECT $1, $2, $3, $4, 'ADMIN', 'ACTIVE'
       WHERE NOT EXISTS (SELECT 1 FROM users)
       ON CONFLICT (email_hash) DO NOTHING
       RETURNING ${COLUMNS}`,
      [admin.id, admin.displayName, admin.emailHash, admin.emailEncrypted],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /**
   * Whether the deployment has at least one ACTIVE admin. Read-only and unlocked, so it is only
   * good for a diagnostic — the last-admin rule needs `SELECT … FOR UPDATE` inside the same
   * transaction as its change (AGENTS.md, "The last-admin lock"), which this is not.
   *
   * `LIMIT 1` because the count is never wanted, only whether the set is empty.
   */
  async hasActiveAdmin(client?: PoolClient): Promise<boolean> {
    const { rowCount } = await (client ?? this.pool).query(
      "SELECT 1 FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1",
    );
    return rowCount !== null && rowCount > 0;
  }

  /**
   * Replaces a password (U3.2.1 reset, U3.2.2 change). Returns whether a row matched, so a
   * caller can tell "changed" from "there is no such user any more".
   *
   * `updated_at` is set here rather than by a trigger: the column defaults to `now()` on
   * insert, but nothing in `001_init.sql` maintains it afterwards, so every UPDATE has to
   * carry it or the timestamp would claim the row was last touched at sign-up.
   */
  async updatePasswordHash(
    userId: string,
    passwordHash: string,
    client?: PoolClient,
  ): Promise<boolean> {
    const { rowCount } = await (client ?? this.pool).query(
      'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1',
      [userId, passwordHash],
    );
    return rowCount !== null && rowCount > 0;
  }

  /**
   * Renames a user (`PATCH /users/me`, Step 11). Same shape as `updatePasswordHash`: the
   * caller's id comes from the verified token, never the body, so there is no ownership check
   * to make here beyond the `WHERE id = $1`.
   */
  async updateDisplayName(userId: string, displayName: string, client?: PoolClient): Promise<boolean> {
    const { rowCount } = await (client ?? this.pool).query(
      'UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1',
      [userId, displayName],
    );
    return rowCount !== null && rowCount > 0;
  }

  /**
   * Every user, optionally narrowed by role and/or status (`GET /admin/users`, Step 10). No
   * pagination yet (a deliberate scope cut, see `users.schemas.ts`) — the conditions are still
   * built dynamically so adding it back later is additive rather than a rewrite.
   *
   * Both filters are passed as query parameters, never interpolated into the SQL string, so
   * this stays injection-safe even though the WHERE clause itself is assembled in code.
   */
  async listUsers(filter: AdminUserFilter, client?: PoolClient): Promise<UserRecord[]> {
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
    const { rows } = await (client ?? this.pool).query<UserRow>(
      `SELECT ${COLUMNS} FROM users ${where} ORDER BY created_at DESC`,
      params,
    );
    return rows.map(toRecord);
  }

  /**
   * Same as `findById`, but under `FOR UPDATE`. Only ever called on the caller's own row, from
   * inside `AdminLockService.run`'s transaction — this is what closes the stale-token window:
   * a demoted or deactivated admin's still-valid access token cannot act on stale authority,
   * because the role and status checked here are read fresh, inside a lock a concurrent role
   * change cannot slip past (AGENTS.md, "The last-admin lock").
   */
  async findByIdForUpdate(id: string, client: PoolClient): Promise<UserRecord | null> {
    const { rows } = await client.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /**
   * Every currently active admin's id, locked for the rest of the caller's transaction. Only
   * called from `AdminLockService.run`, and only once the caller's own row has confirmed they
   * currently qualify as one — a non-admin's request never contends for this lock.
   *
   * `ORDER BY id` makes every transaction lock these rows in the same order, so two concurrent
   * role changes (or a role change and a self-deactivation) cannot deadlock on each other.
   */
  async selectActiveAdminIdsForUpdate(client: PoolClient): Promise<string[]> {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE",
    );
    return rows.map((row) => row.id);
  }

  /**
   * Promotes or demotes a user (`PATCH /admin/users/:userId/role`, Step 10). The last-admin
   * invariant is enforced by the caller (`AdminService.changeRole`, inside the lock) — this
   * method only writes, the same division of responsibility as `updatePasswordHash`.
   */
  async updateRole(userId: string, role: Role, client: PoolClient): Promise<boolean> {
    const { rowCount } = await client.query('UPDATE users SET role = $2, updated_at = now() WHERE id = $1', [
      userId,
      role,
    ]);
    return rowCount !== null && rowCount > 0;
  }
}
