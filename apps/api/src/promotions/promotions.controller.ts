import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePromoCodeDto, ValidatePromoCodeDto } from './promotions.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
@UseGuards(AuthGuard, RolesGuard)
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT')
  list(@Req() req: AuthenticatedRequest) {
    return this.promotions.list(req.user!.tenantId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePromoCodeDto) {
    return this.promotions.create(req.user!.tenantId, dto);
  }

  @Post('validate')
  @Roles('OWNER', 'ADMIN', 'CASHIER', 'AGENT')
  validate(@Req() req: AuthenticatedRequest, @Body() dto: ValidatePromoCodeDto) {
    return this.promotions.validate(req.user!.tenantId, dto);
  }
}
