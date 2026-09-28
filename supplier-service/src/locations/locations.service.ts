/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the location CRUD queries (parameterized SQL with pg), search, version checks,
 *        soft delete/restore, and the mapping of database errors to the team's error codes.
 * Author review: pending — to be completed by the reviewing team member.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { ProblemException } from '../common/problem';
import { PG_POOL } from '../db/database';
import { hhmmToMinutes, minutesToHhmm } from './hours';
import { CreateLocation, ListQuery, UpdateLocation } from './location.schemas';

type Queryable = Pool | PoolClient;

interface LocationRow {
  id: number;
  name: string;
  type: string;
  building: string;
  floor: number;
  location_desc: string;
  lat: string;
  lon: string;
  open_min: number | null;
  close_min: number | null;
  image_url: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
}

export interface LocationPage {
  items: LocationDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface LocationDto {
  id: number;
  name: string;
  type: string;
  building: string;
  floor: number;
  location_desc: string;
  lat: number;
  lon: number;
  open_time: string | null;
  close_time: string | null;
  image_url: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
}

function toDto(row: LocationRow): LocationDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    building: row.building,
    floor: row.floor,
    location_desc: row.location_desc,
    lat: Number(row.lat),
    lon: Number(row.lon),
    open_time: row.open_min === null ? null : minutesToHhmm(row.open_min),
    close_time: row.close_min === null ? null : minutesToHhmm(row.close_min),
    image_url: row.image_url,
    status: row.status,
    version: row.version,
  };
}

/** Maps API field names to column values (hours converted from HHMMhrs to minutes). */
function toColumns(input: Partial<CreateLocation>): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  for (const key of ['name', 'type', 'building', 'floor', 'location_desc', 'lat', 'lon', 'image_url'] as const) {
    if (input[key] !== undefined) cols[key] = input[key];
  }
  if (input.open_time !== undefined) cols.open_min = input.open_time === null ? null : hhmmToMinutes(input.open_time);
  if (input.close_time !== undefined) cols.close_min = input.close_time === null ? null : hhmmToMinutes(input.close_time);
  return cols;
}

/** Translate PostgreSQL errors into the team's error responses. */
function mapDbError(err: unknown, name?: string): never {
  const code = (err as { code?: string }).code;
  if (code === '23505') {
    throw new ProblemException(409, `An ACTIVE location named "${name ?? ''}" already exists.`);
  }
  if (code === '23514' || code === '22003' || code === '23503' || code === '22P02') {
    throw new ProblemException(400, `Invalid location data: ${(err as Error).message}`);
  }
  throw err;
}

@Injectable()
export class LocationsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listTypes(): Promise<string[]> {
    const { rows } = await this.pool.query<{ type: string }>('SELECT type FROM location_types ORDER BY type');
    return rows.map((r) => r.type);
  }

  private async assertTypeExists(type: string, db: Queryable = this.pool) {
    const { rowCount } = await db.query('SELECT 1 FROM location_types WHERE type = $1', [type]);
    if (!rowCount) {
      const types = await this.listTypes();
      throw new ProblemException(400, `Invalid type "${type}". Must be one of: ${types.join(', ')}.`);
    }
  }

  async list(query: ListQuery): Promise<LocationPage> {
    const where: string[] = [];
    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.includeInactive !== 'true') where.push(`status = 'ACTIVE'`);
    if (query.name !== undefined) where.push(`lower(name) LIKE '%' || lower(${param(query.name)}) || '%'`);
    if (query.type !== undefined) {
      await this.assertTypeExists(query.type);
      where.push(`type = ${param(query.type)}`);
    }
    if (query.building !== undefined) where.push(`building = ${param(query.building)}`);
    if (query.time !== undefined) {
      const t = param(hhmmToMinutes(query.time));
      // Open at t, both ends inclusive; open_min > close_min means it closes after midnight.
      where.push(
        `((open_min <= close_min AND ${t} BETWEEN open_min AND close_min)` +
          ` OR (open_min > close_min AND (${t} >= open_min OR ${t} <= close_min)))`,
      );
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const countResult = await this.pool.query<{ n: string }>(`SELECT count(*) AS n FROM locations${whereSql}`, params);

    const limit = param(query.pageSize);
    const offset = param((query.page - 1) * query.pageSize);
    const { rows } = await this.pool.query<LocationRow>(
      // name A→Z; caller-chosen sorting is pending
      `SELECT * FROM locations${whereSql} ORDER BY lower(name), id LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total: Number(countResult.rows[0].n) };
  }

  async get(id: number): Promise<LocationDto> {
    const { rows } = await this.pool.query<LocationRow>('SELECT * FROM locations WHERE id = $1', [id]);
    if (!rows.length) throw new ProblemException(404, `No location with id ${id}.`);
    return toDto(rows[0]);
  }

  async create(input: CreateLocation, db: Queryable = this.pool): Promise<LocationDto> {
    // Check the common failures before inserting, so they don't use up an ID (team decision: fewer gaps).
    await this.assertTypeExists(input.type, db);
    const dup = await db.query(
      `SELECT 1 FROM locations WHERE status = 'ACTIVE' AND lower(name) = lower($1)`,
      [input.name],
    );
    if (dup.rowCount) throw new ProblemException(409, `An ACTIVE location named "${input.name}" already exists.`);
    const cols = toColumns(input);
    const names = Object.keys(cols);
    const sql =
      `INSERT INTO locations (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})` +
      ' RETURNING *';
    try {
      const { rows } = await db.query<LocationRow>(sql, Object.values(cols));
      return toDto(rows[0]);
    } catch (err) {
      mapDbError(err, input.name);
    }
  }

  async update(id: number, input: UpdateLocation): Promise<LocationDto> {
    const { version, ...fields } = input;
    const cols = toColumns(fields);
    if (!Object.keys(cols).length) {
      // Nothing to change (team decision): 200 with the location unchanged, version not raised.
      const current = await this.get(id); // 404 if it doesn't exist
      if (current.version !== version) throw this.staleVersion(id, current.version, version);
      return current;
    }
    if (fields.type !== undefined) await this.assertTypeExists(fields.type);

    const names = Object.keys(cols);
    const sets = names.map((n, i) => `${n} = $${i + 1}`);
    const sql =
      `UPDATE locations SET ${sets.join(', ')}, version = version + 1` +
      ` WHERE id = $${names.length + 1} AND version = $${names.length + 2} RETURNING *`;
    let rows: LocationRow[];
    try {
      ({ rows } = await this.pool.query<LocationRow>(sql, [...Object.values(cols), id, version]));
    } catch (err) {
      mapDbError(err, fields.name);
    }
    if (rows.length) return toDto(rows[0]);

    const current = await this.get(id); // 404 if it doesn't exist
    throw this.staleVersion(id, current.version, version);
  }

  private staleVersion(id: number, current: number, sent: number) {
    return new ProblemException(
      409,
      `Location ${id} was changed by someone else (current version ${current}, request sent version ${sent}). ` +
        'Reload and try again.',
    );
  }

  async setStatus(id: number, target: 'ACTIVE' | 'INACTIVE'): Promise<LocationDto> {
    const from = target === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    let rows: LocationRow[];
    try {
      ({ rows } = await this.pool.query<LocationRow>(
        'UPDATE locations SET status = $1, version = version + 1 WHERE id = $2 AND status = $3 RETURNING *',
        [target, id, from],
      ));
    } catch (err) {
      // Restoring can clash with an ACTIVE location's name (unique index).
      const existing = await this.get(id);
      mapDbError(err, existing.name);
    }
    if (rows.length) return toDto(rows[0]);

    await this.get(id); // 404 if it doesn't exist
    throw new ProblemException(409, `Location ${id} is already ${target}.`);
  }
}
