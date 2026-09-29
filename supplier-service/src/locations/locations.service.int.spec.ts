/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these integration tests for LocationsService against a real PostgreSQL:
 *        listing, filters, paging, sorting, distance, and the create/update/status rules.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { Pool } from 'pg';
import { ProblemException } from '../common/problem';
import { emptyLocations, openTestDatabase } from '../test/database';
import { listQuerySchema } from './location.schemas';
import { LocationsService } from './locations.service';

let pool: Pool;
let service: LocationsService;

beforeAll(async () => {
  pool = await openTestDatabase();
  service = new LocationsService(pool);
});
afterAll(() => pool.end());
beforeEach(() => emptyLocations(pool));

interface Row {
  name: string;
  type?: string;
  building?: string;
  floor?: number;
  lat?: number;
  lon?: number;
  open_min?: number | null;
  close_min?: number | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

/** Inserts rows directly, so listing tests don't depend on create(). Returns their ids. */
async function insert(...rows: Row[]): Promise<number[]> {
  const ids: number[] = [];
  for (const r of rows) {
    const { rows: out } = await pool.query<{ id: number }>(
      `INSERT INTO locations (name, type, building, floor, location_desc, lat, lon, open_min, close_min, status)
       VALUES ($1, $2, $3, $4, 'desc', $5, $6, $7, $8, $9) RETURNING id`,
      [
        r.name,
        r.type ?? 'Food',
        r.building ?? 'COM3',
        r.floor ?? 1,
        r.lat ?? 1.3,
        r.lon ?? 103.8,
        r.open_min === undefined ? 540 : r.open_min, // 0900hrs
        r.close_min === undefined ? 1020 : r.close_min, // 1700hrs
        r.status ?? 'ACTIVE',
      ],
    );
    ids.push(out[0].id);
  }
  return ids;
}

const list = (query: Record<string, string> = {}) => service.list(listQuerySchema.parse(query));
const names = async (query: Record<string, string> = {}) => (await list(query)).items.map((i) => i.name);

/** Runs `action` and returns the HTTP status it failed with. */
async function statusOf(action: () => Promise<unknown>): Promise<number> {
  try {
    await action();
  } catch (err) {
    if (err instanceof ProblemException) return err.getStatus();
    throw err;
  }
  throw new Error('expected the call to fail');
}

const newLocation = {
  name: 'Techno Edge Canteen',
  type: 'Food',
  building: 'Techno Edge',
  floor: 1,
  location_desc: 'Next to the bus stop',
  lat: 1.2976,
  lon: 103.7717,
  open_time: '2200hrs',
  close_time: '0200hrs',
  image_url: 'https://example.com/canteen.jpg',
};
const count = async () => Number((await pool.query('SELECT count(*) AS n FROM locations')).rows[0].n);

describe('listTypes', () => {
  it('returns the four seeded types in alphabetical order', async () => {
    await expect(service.listTypes()).resolves.toEqual(['Food', 'Food/Coffee', 'Printing', 'Shopping']);
  });
});

describe('list', () => {
  it('returns ACTIVE locations only, unless includeInactive=true', async () => {
    await insert({ name: 'Open Place' }, { name: 'Closed Place', status: 'INACTIVE' });
    expect(await names()).toEqual(['Open Place']);
    expect(await names({ includeInactive: 'true' })).toEqual(['Closed Place', 'Open Place']);
  });

  it('returns each location in the API shape', async () => {
    const [id] = await insert({ name: 'Kiosk', lat: 1.2966, lon: 103.7764, open_min: 570, close_min: 1439 });
    const { items } = await list();
    expect(items).toEqual([
      {
        id,
        name: 'Kiosk',
        type: 'Food',
        building: 'COM3',
        floor: 1,
        location_desc: 'desc',
        lat: 1.2966,
        lon: 103.7764,
        open_time: '0930hrs',
        close_time: '2359hrs',
        image_url: null,
        status: 'ACTIVE',
        version: 1,
      },
    ]);
  });

  it('searches names case-insensitively, anywhere in the name', async () => {
    await insert({ name: 'Techno Edge Canteen' }, { name: 'The Deck' }, { name: 'Frontier Canteen' });
    expect(await names({ name: 'CANTEEN' })).toEqual(['Frontier Canteen', 'Techno Edge Canteen']);
    expect(await names({ name: 'edge' })).toEqual(['Techno Edge Canteen']);
  });

  it('filters by exact type and building', async () => {
    await insert(
      { name: 'Printer', type: 'Printing', building: 'COM1' },
      { name: 'Cafe', type: 'Food/Coffee', building: 'COM1' },
      { name: 'Co-op', type: 'Shopping', building: 'Central Library' },
    );
    expect(await names({ type: 'Food/Coffee' })).toEqual(['Cafe']);
    expect(await names({ building: 'COM1' })).toEqual(['Cafe', 'Printer']);
    expect(await names({ building: 'COM' })).toEqual([]);
  });

  it('answers 400 for an unknown type, listing the valid ones', async () => {
    await expect(list({ type: 'Laundry' })).rejects.toMatchObject({
      message: 'Invalid type "Laundry". Must be one of: Food, Food/Coffee, Printing, Shopping.',
    });
    expect(await statusOf(() => list({ type: 'Laundry' }))).toBe(400);
  });

  describe('time filter (open at that time)', () => {
    beforeEach(() =>
      insert(
        { name: 'Day Cafe', open_min: 540, close_min: 1020 }, // 0900-1700
        { name: 'Night Snacks', open_min: 1320, close_min: 120 }, // 2200-0200, closes after midnight
        { name: 'No Hours', open_min: null, close_min: null },
      ),
    );

    it.each([
      ['0859hrs', []],
      ['0900hrs', ['Day Cafe']],
      ['1700hrs', ['Day Cafe']],
      ['1701hrs', []],
      ['2159hrs', []],
      ['2200hrs', ['Night Snacks']],
      ['2359hrs', ['Night Snacks']],
      ['0000hrs', ['Night Snacks']],
      ['0200hrs', ['Night Snacks']],
      ['0201hrs', []],
    ])('at %s lists %p', async (time, expected) => {
      expect(await names({ time })).toEqual(expected);
    });
  });

  it('pages results and reports the total across all pages', async () => {
    await insert({ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' });
    await expect(list({ pageSize: '2' })).resolves.toMatchObject({ page: 1, pageSize: 2, total: 5 });
    expect(await names({ pageSize: '2', page: '2' })).toEqual(['C', 'D']);
    expect(await names({ pageSize: '2', page: '3' })).toEqual(['E']);
    await expect(list({ pageSize: '2', page: '4' })).resolves.toMatchObject({ items: [], total: 5 });
  });

  it('counts only the filtered locations in the total', async () => {
    await insert({ name: 'Canteen One' }, { name: 'Canteen Two' }, { name: 'Printer' });
    await expect(list({ name: 'canteen', pageSize: '1' })).resolves.toMatchObject({ total: 2 });
  });

  it('sorts A-Z by default and Z-A with order=desc, ignoring case', async () => {
    // A case-sensitive sort would put 'Banana' before 'apple' ('B' < 'a').
    await insert({ name: 'cherry' }, { name: 'apple' }, { name: 'Banana' });
    expect(await names()).toEqual(['apple', 'Banana', 'cherry']);
    expect(await names({ order: 'desc' })).toEqual(['cherry', 'Banana', 'apple']);
  });

  it('breaks ties between equal names by id, so paging is stable', async () => {
    const [older, newer] = await insert({ name: 'Same', status: 'INACTIVE' }, { name: 'same' });
    const { items } = await list({ includeInactive: 'true' });
    expect(items.map((i) => i.id)).toEqual([older, newer]);
  });

  describe('distance', () => {
    // 0.001 degrees of latitude = 0.001 * pi/180 * 6371000 m = 111.19 m.
    beforeEach(() =>
      insert(
        { name: 'Far', lat: 1.302, lon: 103.8 }, // 222 m
        { name: 'Here', lat: 1.3, lon: 103.8 }, // 0 m
        { name: 'Near', lat: 1.301, lon: 103.8 }, // 111 m
      ),
    );

    it('orders nearest first with order=distance, giving the distance in metres', async () => {
      const { items } = await list({ lat: '1.3', lon: '103.8', order: 'distance' });
      expect(items.map((i) => [i.name, i.distance_m])).toEqual([
        ['Here', 0],
        ['Near', 111],
        ['Far', 222],
      ]);
    });

    it('adds the distance even when sorting by name', async () => {
      const { items } = await list({ lat: '1.3', lon: '103.8' });
      expect(items.map((i) => [i.name, i.distance_m])).toEqual([
        ['Far', 222],
        ['Here', 0],
        ['Near', 111],
      ]);
    });

    it('leaves distance out when no coordinate is given', async () => {
      const { items } = await list();
      expect(items.every((i) => !('distance_m' in i))).toBe(true);
    });
  });
});

describe('get', () => {
  it('returns one location', async () => {
    const [id] = await insert({ name: 'Kiosk' });
    await expect(service.get(id)).resolves.toMatchObject({ id, name: 'Kiosk' });
  });

  it('answers 404 for an id that does not exist', async () => {
    expect(await statusOf(() => service.get(999))).toBe(404);
  });
});

describe('create', () => {
  it('stores the location and returns it as ACTIVE at version 1', async () => {
    const created = await service.create(newLocation);
    expect(created).toEqual({ id: 1, ...newLocation, status: 'ACTIVE', version: 1 });
    await expect(service.get(created.id)).resolves.toEqual(created);
  });

  it('refuses a second ACTIVE location with the same name, in any letter case', async () => {
    await service.create(newLocation);
    expect(await statusOf(() => service.create({ ...newLocation, name: 'TECHNO edge canteen' }))).toBe(409);
    expect(await count()).toBe(1);
  });

  it("allows reusing an INACTIVE location's name", async () => {
    await insert({ name: 'Techno Edge Canteen', status: 'INACTIVE' });
    await expect(service.create(newLocation)).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('answers 400 for an unknown type', async () => {
    expect(await statusOf(() => service.create({ ...newLocation, type: 'Laundry' }))).toBe(400);
    expect(await count()).toBe(0);
  });

  it('does not use up an id when it refuses a location', async () => {
    await service.create(newLocation);
    await statusOf(() => service.create({ ...newLocation, name: newLocation.name.toUpperCase() })); // duplicate name
    await statusOf(() => service.create({ ...newLocation, name: 'Other', type: 'Laundry' }));
    await expect(service.create({ ...newLocation, name: 'Second' })).resolves.toMatchObject({ id: 2 });
  });

  it('answers 400 when the database rejects a value (latitude out of range)', async () => {
    expect(await statusOf(() => service.create({ ...newLocation, lat: 1000 }))).toBe(400);
  });
});

describe('update', () => {
  let id: number;
  beforeEach(async () => {
    ({ id } = await service.create(newLocation));
  });

  it('changes only the fields sent and raises the version', async () => {
    await expect(service.update(id, { floor: 3, version: 1 })).resolves.toEqual({
      id,
      ...newLocation,
      floor: 3,
      status: 'ACTIVE',
      version: 2,
    });
  });

  it('changes and clears the hours together', async () => {
    await expect(service.update(id, { open_time: '0700hrs', close_time: '1500hrs', version: 1 })).resolves.toMatchObject({
      open_time: '0700hrs',
      close_time: '1500hrs',
    });
    await expect(service.update(id, { open_time: null, close_time: null, version: 2 })).resolves.toMatchObject({
      open_time: null,
      close_time: null,
    });
  });

  it('answers 409 for a stale version and leaves the location unchanged', async () => {
    await service.update(id, { floor: 2, version: 1 });
    await expect(service.update(id, { floor: 9, version: 1 })).rejects.toMatchObject({
      message: expect.stringContaining('current version 2, request sent version 1'),
    });
    await expect(service.get(id)).resolves.toMatchObject({ floor: 2, version: 2 });
  });

  it('returns the location unchanged, without raising the version, when nothing is sent', async () => {
    await expect(service.update(id, { version: 1 })).resolves.toMatchObject({ version: 1 });
    await expect(service.get(id)).resolves.toMatchObject({ version: 1 });
  });

  it('still answers 409 for a stale version when nothing is sent', async () => {
    expect(await statusOf(() => service.update(id, { version: 5 }))).toBe(409);
  });

  it('answers 404 for an id that does not exist', async () => {
    expect(await statusOf(() => service.update(999, { floor: 2, version: 1 }))).toBe(404);
    expect(await statusOf(() => service.update(999, { version: 1 }))).toBe(404);
  });

  it("answers 409 when renamed to another ACTIVE location's name", async () => {
    await insert({ name: 'The Deck' });
    expect(await statusOf(() => service.update(id, { name: 'the deck', version: 1 }))).toBe(409);
  });

  it('answers 400 for an unknown type', async () => {
    expect(await statusOf(() => service.update(id, { type: 'Laundry', version: 1 }))).toBe(400);
  });
});

describe('setStatus (deactivate and restore)', () => {
  let id: number;
  beforeEach(async () => {
    ({ id } = await service.create(newLocation));
  });

  it('deactivates and restores, raising the version each time', async () => {
    await expect(service.setStatus(id, 'INACTIVE')).resolves.toMatchObject({ status: 'INACTIVE', version: 2 });
    await expect(service.setStatus(id, 'ACTIVE')).resolves.toMatchObject({ status: 'ACTIVE', version: 3 });
  });

  it('answers 409 when the location is already in that state', async () => {
    expect(await statusOf(() => service.setStatus(id, 'ACTIVE'))).toBe(409);
    await service.setStatus(id, 'INACTIVE');
    expect(await statusOf(() => service.setStatus(id, 'INACTIVE'))).toBe(409);
  });

  it('answers 409 when restoring would clash with an ACTIVE location of the same name', async () => {
    await service.setStatus(id, 'INACTIVE');
    await service.create(newLocation);
    expect(await statusOf(() => service.setStatus(id, 'ACTIVE'))).toBe(409);
    await expect(service.get(id)).resolves.toMatchObject({ status: 'INACTIVE' });
  });

  it('answers 404 for an id that does not exist', async () => {
    expect(await statusOf(() => service.setStatus(999, 'INACTIVE'))).toBe(404);
  });
});
