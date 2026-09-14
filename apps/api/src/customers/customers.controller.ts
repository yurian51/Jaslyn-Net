import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './customers.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListCustomersQueryDto) {
    return this.customers.list(req.user!.tenantId, query);
  }

  @Get(':id')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customers.get(req.user!.tenantId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'AGENT')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCustomerDto) {
    return this.customers.create(req.user!.tenantId, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'AGENT')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(req.user!.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  deactivate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customers.deactivate(req.user!.tenantId, id);
  }
}
