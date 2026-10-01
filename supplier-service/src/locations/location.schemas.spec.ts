/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-30
 * Scope: Generated these unit tests for the request validation rules.
 * Author review: pending — Jian Bing to record what he checked.
 */
import { ProblemException } from '../common/problem';
import { createLocationSchema, listQuerySchema, parseOr400, updateLocationSchema } from './location.schemas';

const valid = {
  name: 'Techno Edge Canteen',
  type: 'Food',
  building: 'Techno Edge',
  floor: 1,
  location_desc: 'Next to the bus stop',
  lat: 1.2976,
  lon: 103.7717,
  open_time: '0800hrs',
  close_time: '2000hrs',
  image_url: 'https://example.com/canteen.jpg',
};

const accepts = (schema: { safeParse(v: unknown): { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('createLocationSchema', () => {
  it('accepts a complete location', () => {
    expect(accepts(createLocationSchema, valid)).toBe(true);
  });

  it('accepts a location with no hours and no image', () => {
    const { open_time, close_time, image_url, ...rest } = valid;
    expect(accepts(createLocationSchema, rest)).toBe(true);
    expect(accepts(createLocationSchema, { ...rest, open_time: null, close_time: null, image_url: null })).toBe(true);
  });

  it.each(['id', 'status', 'version', 'creator'])('rejects the unknown field %s', (field) => {
    expect(accepts(createLocationSchema, { ...valid, [field]: 1 })).toBe(false);
  });

  it.each(['name', 'type', 'building', 'location_desc'])('rejects a blank %s', (field) => {
    expect(accepts(createLocationSchema, { ...valid, [field]: '   ' })).toBe(false);
  });

  it.each(['name', 'type', 'building', 'floor', 'location_desc', 'lat', 'lon'])('requires %s', (field) => {
    const { [field as keyof typeof valid]: _omitted, ...rest } = valid;
    expect(accepts(createLocationSchema, rest)).toBe(false);
  });

  it('accepts a 100-character name and rejects 101 characters', () => {
    expect(accepts(createLocationSchema, { ...valid, name: 'a'.repeat(100) })).toBe(true);
    expect(accepts(createLocationSchema, { ...valid, name: 'a'.repeat(101) })).toBe(false);
  });

  it('rejects a floor that is not a whole number', () => {
    expect(accepts(createLocationSchema, { ...valid, floor: 1.5 })).toBe(false);
    expect(accepts(createLocationSchema, { ...valid, floor: '1' })).toBe(false);
  });

  it('accepts a basement floor', () => {
    expect(accepts(createLocationSchema, { ...valid, floor: -1 })).toBe(true);
  });

  it('rejects coordinates sent as text', () => {
    expect(accepts(createLocationSchema, { ...valid, lat: '1.2976' })).toBe(false);
  });

  it('rejects an opening time without a closing time, and the reverse', () => {
    expect(accepts(createLocationSchema, { ...valid, close_time: null })).toBe(false);
    const { open_time, ...noOpen } = valid;
    expect(accepts(createLocationSchema, noOpen)).toBe(false);
  });

  it('accepts overnight hours (closing before opening)', () => {
    expect(accepts(createLocationSchema, { ...valid, open_time: '2200hrs', close_time: '0200hrs' })).toBe(true);
  });

  it('rejects hours that are not HHMMhrs', () => {
    expect(accepts(createLocationSchema, { ...valid, open_time: '8:00' })).toBe(false);
  });

  it.each([
    'ftp://example.com/a.jpg',
    'example.com/a.jpg',
    'javascript:alert(1)',
    'javascript:fetch("https://evil.example")',
  ])(
    'rejects the image URL %s',
    (image_url) => {
      expect(accepts(createLocationSchema, { ...valid, image_url })).toBe(false);
    },
  );

  it('accepts an http image URL', () => {
    expect(accepts(createLocationSchema, { ...valid, image_url: 'http://example.com/a.jpg' })).toBe(true);
  });
});

describe('updateLocationSchema', () => {
  it('accepts a partial update with a version', () => {
    expect(accepts(updateLocationSchema, { floor: 2, version: 3 })).toBe(true);
  });

  it('requires a positive whole-number version', () => {
    expect(accepts(updateLocationSchema, { floor: 2 })).toBe(false);
    expect(accepts(updateLocationSchema, { floor: 2, version: 0 })).toBe(false);
    expect(accepts(updateLocationSchema, { floor: 2, version: 1.5 })).toBe(false);
  });

  it.each(['id', 'status'])('rejects %s, which cannot be changed through an update', (field) => {
    expect(accepts(updateLocationSchema, { version: 1, [field]: 1 })).toBe(false);
  });

  it('rejects changing only one of the two hours', () => {
    expect(accepts(updateLocationSchema, { version: 1, open_time: '0900hrs' })).toBe(false);
    expect(accepts(updateLocationSchema, { version: 1, close_time: null })).toBe(false);
  });

  it('accepts changing both hours, or clearing both', () => {
    expect(accepts(updateLocationSchema, { version: 1, open_time: '0900hrs', close_time: '1700hrs' })).toBe(true);
    expect(accepts(updateLocationSchema, { version: 1, open_time: null, close_time: null })).toBe(true);
  });

  it('rejects hours sent together but with only one set', () => {
    expect(accepts(updateLocationSchema, { version: 1, open_time: '0900hrs', close_time: null })).toBe(false);
  });

  it('still validates the fields it is given', () => {
    expect(accepts(updateLocationSchema, { version: 1, name: '' })).toBe(false);
  });
});

describe('listQuerySchema', () => {
  it('fills in the defaults: A-Z, page 1, 20 per page', () => {
    expect(listQuerySchema.parse({})).toEqual({ order: 'asc', page: 1, pageSize: 20 });
  });

  it('turns page and pageSize text into numbers', () => {
    expect(listQuerySchema.parse({ page: '3', pageSize: '50' })).toMatchObject({ page: 3, pageSize: 50 });
  });

  it.each(['0', '-1', '1.5', 'abc', ''])('rejects page=%p', (page) => {
    expect(accepts(listQuerySchema, { page })).toBe(false);
  });

  it('turns lat and lon text into numbers', () => {
    expect(listQuerySchema.parse({ lat: '1.2966', lon: '103.7764' })).toMatchObject({ lat: 1.2966, lon: 103.7764 });
  });

  it('rejects lat without lon, and lon without lat', () => {
    expect(accepts(listQuerySchema, { lat: '1.29' })).toBe(false);
    expect(accepts(listQuerySchema, { lon: '103.77' })).toBe(false);
  });

  it('rejects order=distance without a coordinate', () => {
    expect(accepts(listQuerySchema, { order: 'distance' })).toBe(false);
    expect(accepts(listQuerySchema, { order: 'distance', lat: '1.29', lon: '103.77' })).toBe(true);
  });

  it.each([
    ['lat', '90', true],
    ['lat', '-90', true],
    ['lat', '90.1', false],
    ['lat', '-91', false],
    ['lon', '180', true],
    ['lon', '-180.5', false],
    ['lat', '1e2', false],
    ['lat', 'abc', false],
  ])('%s=%s accepted: %s', (field, value, ok) => {
    const other = field === 'lat' ? { lon: '103.77' } : { lat: '1.29' };
    expect(accepts(listQuerySchema, { ...other, [field]: value })).toBe(ok);
  });

  it.each([
    { includeInactive: 'yes' },
    { order: 'newest' },
    { time: '9am' },
    { status: 'INACTIVE' },
    { limit: '10' },
  ])('rejects %p', (query) => {
    expect(accepts(listQuerySchema, query)).toBe(false);
  });
});

describe('parseOr400', () => {
  it('returns the parsed value', () => {
    expect(parseOr400(listQuerySchema, { page: '2' }, 'query')).toMatchObject({ page: 2 });
  });

  it('treats a missing body as an empty object', () => {
    expect(parseOr400(listQuerySchema, undefined, 'query')).toEqual({ order: 'asc', page: 1, pageSize: 20 });
  });

  it('throws a 400 that names each invalid field', () => {
    let error: unknown;
    try {
      parseOr400(createLocationSchema, { ...valid, name: '', floor: 1.5 }, 'location');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ProblemException);
    const problem = error as ProblemException;
    expect(problem.getStatus()).toBe(400);
    expect(problem.message).toMatch(/^Invalid location: /);
    expect(problem.message).toContain('name:');
    expect(problem.message).toContain('floor:');
  });
});
