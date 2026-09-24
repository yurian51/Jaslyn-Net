import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { UpesiPayService } from './upesipay.service';

@Controller('upesipay')
export class UpesiPayController {
  constructor(private readonly upesipay: UpesiPayService) {}

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

  @Get('merchant-link')
  @UseGuards(AuthGuard)
  merchantLink(@Req() req: AuthenticatedRequest) {
    return this.upesipay.merchantLink(req.user!.tenantId);
  }

  @Post('wallet/top-up')
  @UseGuards(AuthGuard)
  topUp(@Req() req: AuthenticatedRequest, @Body() body: { amount: number; phoneNumber: string }) {
    return this.upesipay.topUpServiceWallet(req.user!.tenantId, body.amount, body.phoneNumber);
  }

  @Post('callbacks')
  callback(@Req() req: AuthenticatedRequest, @Body() payload: Record<string, unknown>) {
    return this.upesipay.recordCallback(req.user!.tenantId, payload);
  }
}
