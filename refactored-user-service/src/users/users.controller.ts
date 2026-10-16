/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-16
 * Scope: Adapted from user-service/src/users/users.controller.ts (original disclosure: Claude Code, Claude Sonnet 5, 2026-09-28): same routes and status codes, now with DTOs and @CurrentUser('id').
 * Author review: Pending Deanson's review.
 */
// AI-generated (review pending: Deanson)
import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangeMobileDto } from './dto/change-mobile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OtpDto } from './dto/otp.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

// USER and ADMIN alike; the caller only ever acts on their own row.
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getSelf(userId);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateDisplayName(userId, dto.displayName);
  }

  // 202: the code has been handed to the mail server.
  @Post('me/otp')
  @HttpCode(202)
  requestOtp(@CurrentUser('id') userId: string, @Body() dto: RequestOtpDto) {
    return this.usersService.requestOtp(userId, dto.purpose);
  }

  // 202: a second code went to the new address; /email/verify commits the change.
  @Post('me/email')
  @HttpCode(202)
  requestEmailChange(@CurrentUser('id') userId: string, @Body() dto: ChangeEmailDto) {
    return this.usersService.requestEmailChange(userId, dto.newEmail, dto.otp);
  }

  @Post('me/email/verify')
  @HttpCode(200)
  verifyEmailChange(@CurrentUser('id') userId: string, @Body() dto: OtpDto) {
    return this.usersService.verifyEmailChange(userId, dto.otp);
  }

  @Patch('me/mobile')
  changeMobile(@CurrentUser('id') userId: string, @Body() dto: ChangeMobileDto) {
    return this.usersService.changeMobile(userId, dto.countryCode, dto.mobileNumber, dto.otp);
  }

  // 204: every refresh token was revoked.
  @Post('me/password')
  @HttpCode(204)
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(userId, dto.otp, dto.newPassword);
  }

  @Post('me/deactivate')
  @HttpCode(204)
  deactivate(@CurrentUser('id') userId: string, @Body() dto: OtpDto) {
    return this.usersService.deactivateSelf(userId, dto.otp);
  }
}
