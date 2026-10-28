import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateFiberAssetDto, UpdateFiberAssetDto } from './fiber-topology.dto';
import { FiberTopologyService } from './fiber-topology.service';

@Controller('fiber/assets')
@UseGuards(AuthGuard, RolesGuard)
export class FiberTopologyController {
  constructor(private readonly fiber: FiberTopologyService) {}

  @Get()
  @Roles('OWNER','ADMIN','AGENT','READ_ONLY')
  list(@Req() req: AuthenticatedRequest, @Query('assetType') assetType?: string, @Query('status') status?: string) {
    return this.fiber.list(req.user!.tenantId,{assetType,status});
  }

  @Post()
  @Roles('OWNER','ADMIN','AGENT')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateFiberAssetDto) {
    return this.fiber.create(req.user!.tenantId,req.user!.id,dto,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }

  @Patch(':id')
  @Roles('OWNER','ADMIN','AGENT')
  update(@Req() req: AuthenticatedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateFiberAssetDto) {
    return this.fiber.update(req.user!.tenantId,req.user!.id,id,dto,{userId:req.user!.id,requestId:req.requestId,ipAddress:req.ip});
  }
}
