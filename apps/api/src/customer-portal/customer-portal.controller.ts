import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CustomerPortalGuard, CustomerPortalRequest } from './customer-portal.guard';
import { CustomerPortalActivationDto, CustomerPortalLoginDto, CustomerPortalPurchaseIntentDto, CustomerPortalSupportDto } from './customer-portal.dto';
import { CustomerPortalService } from './customer-portal.service';

@Controller('customer-portal')
export class CustomerPortalController {
  constructor(private readonly portal:CustomerPortalService){}
  @Post('auth/activate')
  activate(@Body() d:CustomerPortalActivationDto){return this.portal.activate(d);}
  @Post('auth/login')
  login(@Body() d:CustomerPortalLoginDto,@Req() req:{ip?:string;headers:Record<string,string|string[]|undefined>}){
    const agent=req.headers['user-agent'];return this.portal.login(d,{ip:req.ip,userAgent:Array.isArray(agent)?agent[0]:agent});
  }
  @Post('customers/:customerId/invitations')
  @UseGuards(AuthGuard,RolesGuard)
  @Roles('OWNER','ADMIN','AGENT')
  invite(@Req() req:AuthenticatedRequest,@Param('customerId',new ParseUUIDPipe()) id:string){
    return this.portal.issueInvitation(req.user!.tenantId,req.user!.id,id,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
  @Get('me')
  @UseGuards(CustomerPortalGuard)
  me(@Req() req:CustomerPortalRequest){const p=req.customerPortal!;return this.portal.overview(p.tenantId,p.customerId);}
  @Get('packages')
  @UseGuards(CustomerPortalGuard)
  packages(@Req() req:CustomerPortalRequest){return this.portal.listPackages(req.customerPortal!.tenantId);}
  @Post('purchase-intents')
  @UseGuards(CustomerPortalGuard)
  purchaseIntent(@Req() req:CustomerPortalRequest,@Body() d:CustomerPortalPurchaseIntentDto){
    const p=req.customerPortal!;return this.portal.createPurchaseIntent(p.tenantId,p.customerId,d);
  }
  @Post('support')
  @UseGuards(CustomerPortalGuard)
  support(@Req() req:CustomerPortalRequest,@Body() d:CustomerPortalSupportDto){
    const p=req.customerPortal!;return this.portal.createSupport(p.tenantId,p.customerId,d);
  }
  @Post('auth/logout')
  @UseGuards(CustomerPortalGuard)
  logout(@Req() req:CustomerPortalRequest){const p=req.customerPortal!;return this.portal.logout(p.tenantId,p.customerId,p.sessionId);}
}
