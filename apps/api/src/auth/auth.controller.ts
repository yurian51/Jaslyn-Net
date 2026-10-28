import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { Permissions } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { AuthService } from './auth.service';
import { LegalAcceptanceDto, LoginDto, PasswordResetConfirmDto, PasswordResetRequestDto, RegisterDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() input: RegisterDto, @Req() request: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
    const userAgent = request.headers['user-agent'];
    return this.auth.register(input, { ip: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent });
  }

  @Post('login')
  login(@Body() input: LoginDto, @Req() request: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
    const userAgent = request.headers['user-agent'];
    return this.auth.login(input, { ip: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent });
  }

  @Post('password-reset/request')
  requestPasswordReset(@Body() input: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(input.email);
  }

  @Post('password-reset/confirm')
  resetPassword(@Body() input: PasswordResetConfirmDto) {
    return this.auth.resetPassword(input.token, input.password);
  }

  @Post('legal-acceptance')
  @UseGuards(AuthGuard)
  acceptLegal(@Body() input: LegalAcceptanceDto, @Req() request: AuthenticatedRequest) {
    return this.auth.acceptLegalDocument(request.user!, input.documentType, { ip: request.ip, userAgent: request.headers['user-agent'] });
  }

  @Get('legal-acceptance')
  @UseGuards(AuthGuard)
  legalAcceptance(@Req() request: AuthenticatedRequest) {
    return this.auth.getLegalAcceptanceStatus(request.user!);
  }

  @Get('sessions')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions('sessions.read')
  sessions(@Req() request: AuthenticatedRequest) {
    return this.auth.listSessions(request.user!);
  }

  @Post('sessions/revoke-others')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions('sessions.revoke')
  revokeOtherSessions(@Req() request: AuthenticatedRequest) {
    return this.auth.revokeOtherSessions(request.user!, {
      ip: request.ip, userAgent: request.headers['user-agent'], requestId: request.requestId,
    });
  }

  @Post('sessions/:id/revoke')
  @UseGuards(AuthGuard, PermissionsGuard)
  @Permissions('sessions.revoke')
  revokeSession(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    return this.auth.revokeSession(request.user!, id, {
      ip: request.ip, userAgent: request.headers['user-agent'], requestId: request.requestId,
    });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.getCurrentUser(request.user!);
  }
}
