import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpesiPayService } from './upesipay.service';

@Controller('upesipay')
export class UpesiPayController {
  constructor(private readonly upesipay: UpesiPayService) {}

  @Get('capabilities')
  capabilities() {
    return this.upesipay.capabilities();
  }

  @Get('channels')
  @UseGuards(AuthGuard)
  channels(@Req() req: AuthenticatedRequest) {
    return this.upesipay.getPaymentChannels(req.user!.tenantId);
  }

  @Get('bank-paybills')
  @UseGuards(AuthGuard)
  bankPaybills(@Req() req: AuthenticatedRequest) {
    return this.upesipay.getBankPaybills(req.user!.tenantId);
  }

  @Get('paylink/:tag')
  @UseGuards(AuthGuard)
  payLink(@Req() req: AuthenticatedRequest, @Param('tag') tag: string) {
    return this.upesipay.payLink(req.user!.tenantId, tag);
  }

  @Get('merchant-link')
  @UseGuards(AuthGuard)
  merchantLink(@Req() req: AuthenticatedRequest) {
    return this.upesipay.merchantLink(req.user!.tenantId);
  }

  @Post('wallet/top-up')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'BILLING_ADMIN')
  topUp(@Req() req: AuthenticatedRequest, @Body() body: { amount: number; phoneNumber: string }) {
    return this.upesipay.topUpServiceWallet(req.user!.tenantId, body.amount, body.phoneNumber);
  }

  @Post('callbacks')
  callback(@Req() req: AuthenticatedRequest, @Body() payload: Record<string, unknown>) {
    return this.upesipay.recordCallback(req.user!.tenantId, payload);
  }
}
