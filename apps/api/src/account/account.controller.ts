import { Body, Controller, Get, Param, Patch, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { AccountService } from './account.service';

@Controller('account')
@UseGuards(AuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get() get(@Req() req: AuthenticatedRequest) { return this.account.get(req.user!); }
  @Put('profile') profile(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.account.updateProfile(req.user!, body); }
  @Put('branding') branding(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.account.updateBranding(req.user!, body); }
  @Put('payment-display') paymentDisplay(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.account.updatePaymentDisplay(req.user!, body); }

  @Get('team') team(@Req() req: AuthenticatedRequest) { return this.account.team(req.user!); }
  @Post('team') addTeam(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.account.addTeamMember(req.user!, body); }
  @Patch('team/:id') updateTeam(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.account.updateTeamMember(req.user!, id, body); }

  @Post('support') support(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.account.createSupportTicket(req.user!, body); }
  @Post('close') close(@Req() req: AuthenticatedRequest) { return this.account.close(req.user!); }
  @Post('reopen') reopen(@Req() req: AuthenticatedRequest) { return this.account.reopen(req.user!); }
  @Post('delete-request') deleteRequest(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.account.requestDeletion(req.user!, body); }
  @Post('cancel-deletion') cancelDeletion(@Req() req: AuthenticatedRequest) { return this.account.cancelDeletion(req.user!); }

  @Get('data-export') async dataExport(@Req() req: AuthenticatedRequest, @Res() res: any) {
    const payload = await this.account.exportData(req.user!);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jaslyn-net-data-${req.user!.tenantId}.json"`);
    res.status(200).send(JSON.stringify(payload, null, 2));
  }
}
