/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Copied PageQuery from order-service/src/orders/orders.schemas.ts for
 *   GET /admin/users/:userId/login-events (#180).
 * Author review: Reviewed by Zi Yi, 2026-11-05.
 */
// AI-generated (reviewed by Zi Yi)
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Same paging parameters and defaults as the Order and Supplier listings.
export const PageQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export class PageQueryDto extends createZodDto(PageQuerySchema) {}
