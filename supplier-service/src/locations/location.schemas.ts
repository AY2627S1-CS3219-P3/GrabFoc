/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated strict Zod schemas for request bodies and query parameters, following the
 *        field, validation and error decisions in supplier-service/AGENTS.md.
 * Author review: pending — to be completed by the reviewing team member.
 */
import { z } from 'zod';
import { ProblemException } from '../common/problem';
import { HHMM_RE } from './hours';

const hhmm = z.string().regex(HHMM_RE, 'must be in HHMMhrs format, e.g. 0900hrs');
const nonBlank = z.string().refine((s) => s.trim().length > 0, 'must not be empty');

const locationFields = {
  name: nonBlank.pipe(z.string().max(100, 'must be at most 100 characters')),
  type: nonBlank,
  building: nonBlank,
  floor: z.number().int('must be a whole number'),
  location_desc: nonBlank,
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

export const listQuerySchema = z
  .object({
    name: z.string().optional(),
    type: z.string().optional(),
    building: z.string().optional(),
    time: hhmm.optional(),
    includeInactive: z.enum(['true', 'false']).optional(),
    page: positiveInt.default('1'),
    pageSize: positiveInt.default('20'),
  })
  .strict();

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
