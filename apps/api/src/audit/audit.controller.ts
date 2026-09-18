import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('OWNER', 'ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.audit.list(req.user!.tenantId, Number(limit) || 100);
  }

  @Get('trace/:correlationId')
  trace(@Req() req: AuthenticatedRequest, @Param('correlationId') correlationId: string) {
    return this.audit.trace(req.user!.tenantId, correlationId);
  }
}
