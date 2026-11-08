/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/users/admin.controller.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-27): same routes and status codes, now with DTOs and @Roles(Role.ADMIN).
 * Author review: Successfully reviewed by Deanson, 2026-10-16.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-19
 * Scope: Added POST /admin/users/:userId/suspend (#72).
 * Author review: Reviewed by Zi Yi, 2026-10-20.
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Suspend takes a reason; GET login-summary and :userId/login-events (#180).
 * Author review: Reviewed by Zi Yi, 2026-11-05.
 */
// AI-generated (reviewed by Deanson)
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PageQueryDto } from './dto/page-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { UsersService } from './users.service';

// Every route needs ADMIN; a USER gets 403 from AuthGuard before any handler runs.
@Controller('admin/users')
@Roles(Role.ADMIN)
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Get('login-summary')
  loginSummary() {
    return this.usersService.loginSummary();
  }

  @Get(':userId/login-events')
  listLoginEvents(@Param('userId', ParseUUIDPipe) userId: string, @Query() query: PageQueryDto) {
    return this.usersService.listLoginEvents(userId, query.page, query.pageSize);
  }

  // ParseUUIDPipe: a malformed id is a 400, not a Postgres error.
  @Patch(':userId/role')
  changeRole(
    @CurrentUser('id') callerId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.usersService.changeRole(callerId, userId, dto.role);
  }

  @Post(':userId/reactivate')
  @HttpCode(200)
  reactivate(@CurrentUser('id') callerId: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.usersService.reactivate(callerId, userId);
  }

  @Post(':userId/suspend')
  @HttpCode(200)
  suspend(
    @CurrentUser('id') callerId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.usersService.suspend(callerId, userId, dto.reason);
  }
}
