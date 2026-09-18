import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AddIpAddressDto, AllocateIpAddressDto, CreateIpamPoolDto, ListIpAddressesQueryDto, ReleaseIpAddressDto } from './ipam.dto';
import { IpamService } from './ipam.service';

@Controller('ipam')
@UseGuards(AuthGuard, RolesGuard)
export class IpamController {
  constructor(private readonly ipam: IpamService) {}

  @Get('pools')
  listPools(@Req() req: AuthenticatedRequest) { return this.ipam.listPools(req.user!.tenantId); }

  @Post('pools')
  @Roles('OWNER', 'ADMIN')
  createPool(@Req() req: AuthenticatedRequest, @Body() dto: CreateIpamPoolDto) { return this.ipam.createPool(req.user!.tenantId, dto); }

  @Get('pools/:id')
  getPool(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.ipam.getPool(req.user!.tenantId, id); }

  @Post('pools/:id/addresses')
  @Roles('OWNER', 'ADMIN')
  addAddress(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: AddIpAddressDto) {
    return this.ipam.addAddress(req.user!.tenantId, id, dto);
  }

  @Post('pools/:id/allocate')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  allocate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: AllocateIpAddressDto) {
    return this.ipam.allocate(req.user!.tenantId, id, dto);
  }

  @Get('addresses')
  listAddresses(@Req() req: AuthenticatedRequest, @Query() query: ListIpAddressesQueryDto) {
    return this.ipam.listAddresses(req.user!.tenantId, query);
  }

  @Post('addresses/:id/release')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  release(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: ReleaseIpAddressDto) {
    return this.ipam.release(req.user!.tenantId, id, dto.reason);
  }
}
