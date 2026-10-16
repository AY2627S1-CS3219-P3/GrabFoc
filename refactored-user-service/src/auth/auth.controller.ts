/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12, 2026-10-16
 * Scope: 10-12: added the AuthService constructor and DTO imports; routes written by Deanson.
 *   10-16: added @Public, @HttpCode and @CurrentUser to match the old routes' behaviour
 *   (user-service/src/auth/*.controller.ts; original disclosures: Claude Code, Claude Opus 5, 2026-09-26).
 * Author review: 10-12 part reviewed by Deanson, 2026-10-15. 10-16 changes: pending Deanson's review.
 */
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyRegisterDto } from './dto/verify-register.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    // 201: a pending sign-up now exists, though the users row does not yet.
    @Public()
    @Post('register')
    register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto)
    }

    @Public()
    @HttpCode(200)
    @Post('register/verify')
    verify(@Body() verifyRegisterDto: VerifyRegisterDto) {
        return this.authService.verify(verifyRegisterDto)
    }

    // 202: the code has been handed to the mail server.
    @Public()
    @HttpCode(202)
    @Post('register/resend-otp')
    resendOtp(@Body() resendOtpDto: ResendOtpDto) {
        return this.authService.resendOtp(resendOtpDto)
    }

    @Public()
    @HttpCode(200)
    @Post('login')
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto)
    }

    // 202 with a fixed message, whether or not the address has an account.
    @Public()
    @HttpCode(202)
    @Post('password/forgot')
    async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
        await this.authService.forgotPassword(forgotPasswordDto)
        return { message: 'If an account exists for that email, a reset code has been sent to it.' }
    }

    // 204: every session was revoked, so the user logs in again.
    @Public()
    @HttpCode(204)
    @Post('password/reset')
    resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
        return this.authService.resetPassword(resetPasswordDto)
    }

    // Public: the caller is here because the access token expired. The refresh token is the credential.
    @Public()
    @HttpCode(200)
    @Post('refresh')
    refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
        return this.authService.refreshToken(refreshTokenDto)
    }

    // Needs an access token: the caller can only end their own session.
    @HttpCode(204)
    @Post('logout')
    logout(@CurrentUser('id') userId: string, @Body() refreshTokenDto: RefreshTokenDto) {
        return this.authService.logout(userId, refreshTokenDto)
    }
}
