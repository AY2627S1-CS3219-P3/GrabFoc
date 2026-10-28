/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated strict Zod schemas for request bodies and query parameters, following the
 *        field, validation and error decisions in supplier-service/AGENTS.md.
 * Author review (Cole Lin): Read in full; ran it with Postman and checked the 400 cases: missing fields, unknown fields and bad query parameters.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-27
 * Scope: The name, type and building list filters reject control bytes, and are length-bound only
 *        where the stored field is - a class of bug the PR #129 review found in the Logging
 *        Service's filters, and an asymmetry the PR #157 review found in my first fix for it.
 * Author review: Cole Lin, read and approved.
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-10-28
 * Scope: Refuse in a filter only what PostgreSQL cannot store, and refuse the same on creation,
 *        so anything storable stays findable (PR #157 review).
 * Author review: Cole Lin, read and approved.
 */
import { z } from 'zod';
import { ProblemException } from '../common/problem';
import { HHMM_RE } from './hours';

const hhmm = z.string().regex(HHMM_RE, 'must be in HHMMhrs format, e.g. 0900hrs');
const nonBlank = z.string().refine((s) => s.trim().length > 0, 'must not be empty');

/**
 * A NUL, which is the one character PostgreSQL cannot hold in a TEXT value at all.
 *
 * This refused every control character and DEL as well, and only on the *filter* side - so an
 * admin could create a building named with a tab, PostgreSQL would store it happily, and then the
 * exact `?building=` filter rejected that same value with a 400, leaving the row unreachable
 * through the filter meant to find it (PR #157 review). Narrowed to what the store actually
 * refuses, and applied on both sides: anything storable is findable, and a NUL is a 400 wherever
 * it arrives rather than a 500 from the driver.
 *
 * Not surrogates: an unpaired one is not a storage failure. Node encodes it to UTF-8 as U+FFFD, on
 * the way in and in the filter term alike, so the two agree and the row is still found.
 *
 * Written as a loop rather than a regex, because this reads the same to anyone checking it.
 */
function hasNul(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 0) return true;
  }
  return false;
}

const NO_NUL = 'must not contain a NUL character';
const storable = z.string().refine((v) => !hasNul(v), NO_NUL);

/**
 * A text filter that reaches the database. PostgreSQL cannot hold a NUL in a TEXT parameter, so
 * `?name=%00` used to pass validation, reach the query and come back as a 500 instead of a 400 -
 * the same gap the PR #129 review found in the Logging Service's filters.
 *
 * Every bound here is one the *write* side applies too, which is the whole point: a filter that
 * refuses what creation accepts leaves a stored row that no filter can reach. The length bound is
 * per field and is the field's own stored limit or nothing at all - a shared 100 looked tidier and
 * was wrong, because `building` is stored unbounded. The control-character bound was the same
 * mistake in the same function: it refused tabs and DEL on this side only (PR #157 review).
 * Bounding `building` and `type` by *length* on creation would let this side bound them too, which
 * is worth doing, but that is a schema decision for the service's owners rather than a filter fix.
 */
const textFilter = (max?: number) =>
  max === undefined ? storable : storable.pipe(z.string().max(max, `must be at most ${max} characters`));

const locationFields = {
  // `storable` as well as non-blank: a NUL reached the INSERT and came back as a driver 500, and
  // refusing it here is also what lets the list filters accept everything else (PR #157 review).
  name: nonBlank.pipe(storable).pipe(z.string().max(100, 'must be at most 100 characters')),
  type: nonBlank.pipe(storable),
  building: nonBlank.pipe(storable),
  location_desc: nonBlank.pipe(storable),
  floor: z.number().int('must be a whole number'),
  lat: z.number(),
  lon: z.number(),
  open_time: hhmm.nullable().optional(),
  close_time: hhmm.nullable().optional(),
  image_url: z
    .string()
    .regex(/^https?:\/\//i, 'must start with http:// or https://')
    .nullable()
    .optional(),
};

type Hours = { open_time?: string | null; close_time?: string | null };

/** Team rule: opening and closing time are either both present or both absent. */
function hoursBothOrNeither(v: Hours, ctx: z.RefinementCtx) {
  if ((v.open_time ?? null) === null !== ((v.close_time ?? null) === null)) {
    ctx.addIssue({ code: 'custom', message: 'open_time and close_time must both be set or both be empty' });
  }
}

// .strict(): unknown fields (including id, status, version on create) are rejected with 400.
export const createLocationSchema = z.object(locationFields).strict().superRefine(hoursBothOrNeither);

// Every field optional (partial update), but version is required and id/status stay forbidden.
// Hours can only be changed together, so the stored pair always stays both-or-neither.
export const updateLocationSchema = z
  .object(locationFields)
  .partial()
  .extend({ version: z.number().int().positive() })
  .strict()
  .superRefine((v, ctx) => {
    if ('open_time' in v !== 'close_time' in v) {
      ctx.addIssue({ code: 'custom', message: 'open_time and close_time must be sent together' });
      return;
    }
    hoursBothOrNeither(v, ctx);
  });

// Query-string numbers arrive as text: accept only positive whole numbers.
const positiveInt = z
  .string()
  .regex(/^[1-9]\d{0,8}$/, 'must be a positive whole number')
  .transform(Number);

// Decimal degrees, as a phone's GPS reports them (e.g. lat=1.296600&lon=103.776400).
const degrees = (min: number, max: number) =>
  z
    .string()
    .regex(/^-?\d{1,3}(\.\d+)?$/, 'must be a decimal number of degrees')
    .transform(Number)
    .refine((n) => n >= min && n <= max, `must be between ${min} and ${max}`);

export const listQuerySchema = z
  .object({
    // 100 matches what createLocationSchema allows for a name; type and building are stored
    // unbounded, so bounding the filter would hide rows that can legitimately exist.
    name: textFilter(100).optional(),
    type: textFilter().optional(),
    building: textFilter().optional(),
    time: hhmm.optional(),
    includeInactive: z.enum(['true', 'false']).optional(),
    lat: degrees(-90, 90).optional(),
    lon: degrees(-180, 180).optional(),
    order: z.enum(['asc', 'desc', 'distance']).default('asc'),
    page: positiveInt.default('1'),
    pageSize: positiveInt.default('20'),
  })
  .strict()
  .superRefine((q, ctx) => {
    if ((q.lat === undefined) !== (q.lon === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'lat and lon must be given together' });
    }
    if (q.order === 'distance' && q.lat === undefined) {
      ctx.addIssue({ code: 'custom', message: 'order=distance needs lat and lon' });
    }
  });

export type CreateLocation = z.infer<typeof createLocationSchema>;
export type UpdateLocation = z.infer<typeof updateLocationSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Parse with a Zod schema, or throw a 400 Problem Details response naming the invalid fields. */
export function parseOr400<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown, what: string): T {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
  throw new ProblemException(400, `Invalid ${what}: ${issues}`);
}
