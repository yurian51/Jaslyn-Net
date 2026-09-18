import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { LegalAcceptanceDto, LoginDto, RegisterDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() input: RegisterDto, @Req() request: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
    const userAgent = request.headers['user-agent'];
    return this.auth.register(input, { ip: request.ip, userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent });
  }

  @Post('login')
  login(@Body() input: LoginDto) {
    return this.auth.login(input);
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

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
}
