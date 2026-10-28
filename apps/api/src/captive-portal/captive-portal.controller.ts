import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateCaptivePortalSettingsDto } from './captive-portal.dto';
import { PublicVoucherRedemptionDto } from './public-voucher-redemption.dto';
import { CaptivePortalService } from './captive-portal.service';

@Controller()
export class CaptivePortalController {
  constructor(private readonly portal: CaptivePortalService) {}

  @Get('public/captive-portal/:slug')
  getPublicPortal(@Param('slug') slug: string) { return this.portal.getPublicPortal(slug); }

  @Post('public/captive-portal/:slug/vouchers/redeem')
  redeemPublicVoucher(@Param('slug') slug: string, @Body() body: PublicVoucherRedemptionDto, @Req() req: Request) {
    return this.portal.redeemPublicVoucher(slug, body, req.ip || req.socket.remoteAddress || 'unknown');
  }

  @Get('captive-portal/settings')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  getSettings(@Req() req: AuthenticatedRequest) {
    return this.portal.getSettings(req.user!.tenantId);
  }

  @Put('captive-portal/settings')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  updateSettings(@Req() req: AuthenticatedRequest, @Body() body: UpdateCaptivePortalSettingsDto) {
    return this.portal.updateSettings(req.user!.tenantId, req.user!.id, body);
  }
}
