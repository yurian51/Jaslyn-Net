import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CustomerCommerceService } from './customer-commerce.service';
import { BeneficiaryDto, LimitDto, NotificationPreferenceDto, ReferralDto, RenewalScheduleDto, SavedPurchaseDto, SupportCaseDto, VerificationDto, WalletEntryDto } from './customer-commerce.dto';

@Controller('commerce')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerCommerceController {
  constructor(private readonly commerce: CustomerCommerceService) {}
  @Get('customers/:customerId/overview') overview(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.overview(req.user!.tenantId,id);}
  @Get('customers/:customerId/wallet') wallet(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.wallet(req.user!.tenantId,id);}
  @Post('customers/:customerId/wallet/entries') @Roles('OWNER','ADMIN','AGENT','CASHIER') walletEntry(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:WalletEntryDto){return this.commerce.addWalletEntry(req.user!.tenantId,id,dto);}
  @Get('customers/:customerId/beneficiaries') beneficiaries(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.listBeneficiaries(req.user!.tenantId,id);}
  @Post('customers/:customerId/beneficiaries') beneficiariesSave(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:BeneficiaryDto){return this.commerce.saveBeneficiary(req.user!.tenantId,id,dto);}
  @Get('customers/:customerId/saved-purchases') saved(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.listSavedPurchases(req.user!.tenantId,id);}
  @Post('customers/:customerId/saved-purchases') save(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:SavedPurchaseDto){return this.commerce.savePurchase(req.user!.tenantId,id,dto);}
  @Get('customers/:customerId/renewals') renewals(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.listRenewals(req.user!.tenantId,id);}
  @Put('customers/:customerId/renewals') setRenewal(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:RenewalScheduleDto){return this.commerce.setRenewal(req.user!.tenantId,id,dto);}
  @Post('customers/:customerId/referrals') referral(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.createReferral(req.user!.tenantId,id);}
  @Post('customers/:customerId/referrals/redeem') redeem(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:ReferralDto){return this.commerce.redeemReferral(req.user!.tenantId,id,dto);}
  @Get('customers/:customerId/limits') limits(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.getLimits(req.user!.tenantId,id);}
  @Put('customers/:customerId/limits') @Roles('OWNER','ADMIN') setLimits(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:LimitDto){return this.commerce.setLimits(req.user!.tenantId,id,dto);}
  @Get('customers/:customerId/verifications') verifications(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.listVerifications(req.user!.tenantId,id);}
  @Put('customers/:customerId/verifications') @Roles('OWNER','ADMIN','AGENT') verification(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:VerificationDto){return this.commerce.setVerification(req.user!.tenantId,id,dto);}
  @Get('customers/:customerId/preferences') preferences(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.getPreferences(req.user!.tenantId,id);}
  @Put('customers/:customerId/preferences') preferencesSet(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:NotificationPreferenceDto){return this.commerce.setPreferences(req.user!.tenantId,id,dto);}
  @Get('customers/:customerId/support') support(@Req() req:AuthenticatedRequest,@Param('customerId') id:string){return this.commerce.listSupport(req.user!.tenantId,id);}
  @Post('customers/:customerId/support') supportCreate(@Req() req:AuthenticatedRequest,@Param('customerId') id:string,@Body() dto:SupportCaseDto){return this.commerce.createSupport(req.user!.tenantId,id,dto);}
}
