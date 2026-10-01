/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these integration tests for loading the seed CSV into a real PostgreSQL.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Logger } from '@nestjs/common';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { Pool } from 'pg';
import { config } from '../config';
import { LocationsService } from '../locations/locations.service';
import { emptyLocations, openTestDatabase } from '../test/database';
import { SeedService } from './seed.service';

let pool: Pool;
let seeder: SeedService;
const realCsv = config.seedCsvPath;
const count = async () => Number((await pool.query('SELECT count(*) AS n FROM locations')).rows[0].n);
const byName = async (name: string) =>
  (await new LocationsService(pool).list({ name, order: 'asc', page: 1, pageSize: 5 })).items[0];

beforeAll(async () => {
  pool = await openTestDatabase();
  seeder = new SeedService(pool, new LocationsService(pool));
});
afterAll(() => pool.end());

let loggedError: jest.SpyInstance;
beforeEach(async () => {
  await emptyLocations(pool);
  config.seedCsvPath = realCsv;
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  loggedError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('loads all 21 locations into an empty database', async () => {
  await seeder.onApplicationBootstrap();
  expect(await count()).toBe(21);
  expect(loggedError).not.toHaveBeenCalled();
});

it('stores a row exactly as the CSV gives it, with the image link made direct', async () => {
  await seeder.onApplicationBootstrap();
  expect(await byName("Anna's x Soup Union")).toMatchObject({
    type: 'Food',
    building: 'Central Library',
    floor: 1,
    location_desc: 'Next to NUS Co-op',
    lat: 1.296444,
    lon: 103.773032,
    open_time: '0900hrs',
    close_time: '1800hrs',
    image_url: 'https://raw.githubusercontent.com/CS3219-AY2627S1/FoC-Template/main/data/images/ANNA.jpeg',
    status: 'ACTIVE',
    version: 1,
  });
});

it('reads the Windows-1252 apostrophe, keeps overnight hours, and leaves a missing image empty', async () => {
  await seeder.onApplicationBootstrap();
  expect(await byName('Supersnacks')).toMatchObject({
    building: 'Prince George’s Park',
    open_time: '1100hrs',
    close_time: '0200hrs',
    image_url: null,
  });
});

it('does not seed again on the next start', async () => {
  await seeder.onApplicationBootstrap();
  await seeder.onApplicationBootstrap();
  expect(await count()).toBe(21);
  expect(loggedError).not.toHaveBeenCalled(); // skipped, not attempted and rolled back
});

it('does not seed a database that already has locations', async () => {
  await pool.query(
    `INSERT INTO locations (name, type, building, floor, location_desc, lat, lon) VALUES ('Mine', 'Food', 'COM3', 1, 'd', 1.3, 103.8)`,
  );
  await seeder.onApplicationBootstrap();
  expect(await count()).toBe(1);
});

it('seeds once when two instances start at the same moment', async () => {
  const other = new SeedService(pool, new LocationsService(pool));
  await Promise.all([seeder.onApplicationBootstrap(), other.onApplicationBootstrap()]);
  expect(await count()).toBe(21);
  // Without the table lock both would try, and the second would fail on the unique name index.
  expect(loggedError).not.toHaveBeenCalled();
});

describe('with an invalid row', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'supplier-seed-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('loads nothing and logs which line is wrong', async () => {
    const lines = readFileSync(realCsv, 'latin1').split(/\r?\n/);
    const cells = lines[2].split(','); // line 3 of the file: the second location
    cells[3] = 'ground'; // Floor
    lines[2] = cells.join(',');
    config.seedCsvPath = path.join(dir, 'bad.csv');
    writeFileSync(config.seedCsvPath, lines.join('\n'), 'latin1');

    await seeder.onApplicationBootstrap();

    expect(await count()).toBe(0);
    expect(loggedError).toHaveBeenCalledWith(expect.stringMatching(/Seed aborted, nothing loaded: .*seed row 3.*floor/));
  });

  it('loads nothing when a later row fails in the database (a repeated name)', async () => {
    const lines = readFileSync(realCsv, 'latin1').split(/\r?\n/).filter((l) => l.trim());
    lines.push(lines[1]); // the first location again, as the last row: valid, but a duplicate
    config.seedCsvPath = path.join(dir, 'duplicate.csv');
    writeFileSync(config.seedCsvPath, lines.join('\n'), 'latin1');

    await seeder.onApplicationBootstrap();

    expect(await count()).toBe(0);
    expect(loggedError).toHaveBeenCalledWith(expect.stringMatching(/Seed aborted, nothing loaded: .*already exists/));
  });
});
