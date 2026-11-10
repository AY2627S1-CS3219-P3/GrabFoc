/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these integration tests for loading the seed CSV into a real PostgreSQL.
 * Author review (Jian Bing): Ran `npm run test:int` against supplier-db on 2026-10-01 (51 passed)
 *        and verified each test case in this file by hand.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-10
 * Scope: Seeding with SUPPLIER_IMAGE_BASE_URL, and moving existing template photo links once.
 * Author review: Pending Jian Bing's review.
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
  config.imageBaseUrl = undefined;
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

// AI-generated (Claude Code, 2026-11-10): on AWS the template's photos are served from the site's
// /images (an S3 bucket behind CloudFront), not GitHub (plan approved by Jian Bing).
describe('with SUPPLIER_IMAGE_BASE_URL', () => {
  const BASE = 'https://d1.cloudfront.net/images';
  const RAW = 'https://raw.githubusercontent.com/CS3219-AY2627S1/FoC-Template/main/data/images/';
  const versionOf = async (name: string) => (await byName(name)).version;

  it('links the template photos to it when seeding', async () => {
    config.imageBaseUrl = BASE;
    await seeder.onApplicationBootstrap();
    expect(await byName("Anna's x Soup Union")).toMatchObject({ image_url: `${BASE}/ANNA.jpeg`, version: 1 });
    const left = await pool.query(`SELECT count(*) AS n FROM locations WHERE image_url LIKE '%github%'`);
    expect(Number(left.rows[0].n)).toBe(0);
  });

  it('moves existing template photo links to it once, and leaves other links alone', async () => {
    await seeder.onApplicationBootstrap(); // seeded before the bucket existed: GitHub links
    expect((await byName("Anna's x Soup Union")).image_url).toBe(`${RAW}ANNA.jpeg`);
    const other = await pool.query<{ name: string }>(
      `UPDATE locations SET image_url = 'https://example.com/own.jpg'
         WHERE id = (SELECT id FROM locations WHERE image_url IS NOT NULL AND name <> $1 ORDER BY id LIMIT 1)
       RETURNING name`,
      ["Anna's x Soup Union"],
    );

    config.imageBaseUrl = BASE;
    await seeder.onApplicationBootstrap();
    expect(await byName("Anna's x Soup Union")).toMatchObject({ image_url: `${BASE}/ANNA.jpeg`, version: 2 });
    expect((await byName(other.rows[0].name)).image_url).toBe('https://example.com/own.jpg');
    expect(loggedError).not.toHaveBeenCalled();

    await seeder.onApplicationBootstrap(); // the next start finds nothing to move
    expect(await versionOf("Anna's x Soup Union")).toBe(2);
  });

  it('leaves the GitHub links alone without it', async () => {
    await seeder.onApplicationBootstrap();
    await seeder.onApplicationBootstrap();
    expect(await byName("Anna's x Soup Union")).toMatchObject({ image_url: `${RAW}ANNA.jpeg`, version: 1 });
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
