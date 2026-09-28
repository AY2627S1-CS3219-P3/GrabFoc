/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5), date: 2026-09-22
 * Scope: Generated the HTTP routes for the endpoints listed in supplier-service/AGENTS.md.
 * Author review: pending — to be completed by the reviewing team member.
 */
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthedRequest, denied, Roles } from '../common/auth';
import { ProblemException } from '../common/problem';
import { createLocationSchema, listQuerySchema, parseOr400, updateLocationSchema } from './location.schemas';
import { LocationsService } from './locations.service';

function parseId(raw: string): number {
  if (!/^\d+$/.test(raw) || Number(raw) > 2147483647) {
    throw new ProblemException(400, `Invalid location id "${raw}".`);
  }
  return Number(raw);
}

@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('location-types')
  listTypes() {
    return this.locations.listTypes();
  }

  @Get('locations')
  list(@Query() rawQuery: unknown, @Req() req: AuthedRequest) {
    const query = parseOr400(listQuerySchema, rawQuery, 'query parameters');
    if (query.includeInactive === 'true' && req.caller.role !== 'ADMIN') {
      throw denied(req, 403, 'includeInactive=true requires the ADMIN role.', req.caller);
    }
    return this.locations.list(query);
  }

  @Get('locations/:locationId')
  get(@Param('locationId') id: string) {
    return this.locations.get(parseId(id));
  }

  @Post('locations')
  @Roles('ADMIN')
  create(@Body() body: unknown) {
    return this.locations.create(parseOr400(createLocationSchema, body, 'location'));
  }

  @Patch('locations/:locationId')
  @Roles('ADMIN')
  update(@Param('locationId') id: string, @Body() body: unknown) {
    const locationId = parseId(id);
    return this.locations.update(locationId, parseOr400(updateLocationSchema, body, 'location update'));
  }

  @Post('locations/:locationId/deactivate')
  @Roles('ADMIN')
  @HttpCode(200)
  deactivate(@Param('locationId') id: string) {
    return this.locations.setStatus(parseId(id), 'INACTIVE');
  }

  @Post('locations/:locationId/restore')
  @Roles('ADMIN')
  @HttpCode(200)
  restore(@Param('locationId') id: string) {
    return this.locations.setStatus(parseId(id), 'ACTIVE');
  }
}
