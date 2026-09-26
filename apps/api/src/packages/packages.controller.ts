import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePackageDto, CreatePackageFromTierDto, ListPackagesQueryDto, UpdatePackageDto } from './packages.dto';
import { PackagesService } from './packages.service';

@Controller('packages')
@UseGuards(AuthGuard, RolesGuard)
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get('tiers/catalog')
  tiersCatalog() { return this.packages.listTierCatalog(); }

  @Get('tiers/availability')
  tierAvailability(@Req() req: AuthenticatedRequest) {
    return this.packages.tierAvailability(req.user!.tenantId);
  }

  @Get('tiers/:tierCode')
  tierCatalogEntry(@Param('tierCode') tierCode: string) {
    return this.packages.getTierCatalogEntry(tierCode);
  }

  @Get('tiers/availability')
  tierAvailability(@Req() req: AuthenticatedRequest) {
    return this.packages.tierAvailability(req.user!.tenantId);
  }

  @Get('tiers/:tierCode')
  tierCatalogEntry(@Param('tierCode') tierCode: string) {
    return this.packages.getTierCatalogEntry(tierCode);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListPackagesQueryDto) {
    return this.packages.list(req.user!.tenantId, query);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.packages.get(req.user!.tenantId, id);
  }

  @Post('tiers/:tierCode/provision')
  @Roles('OWNER', 'ADMIN')
  createFromTier(@Req() req: AuthenticatedRequest, @Param('tierCode') tierCode: string, @Body() dto: CreatePackageFromTierDto) {
    return this.packages.createFromTier(req.user!.tenantId, tierCode, dto);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePackageDto) {
    return this.packages.create(req.user!.tenantId, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.packages.update(req.user!.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  deactivate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.packages.deactivate(req.user!.tenantId, id);
  }
}
