import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { AiService } from './ai.service';

class CreateAiRunDto {
  @IsString() @MaxLength(12000) task!: string;
  @IsOptional() @IsObject() context?: Record<string, unknown>;
}

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}
  @Get('capabilities') capabilities(@Req() req: AuthenticatedRequest) { return this.ai.capabilities(req.user!.tenantId); }
  @Get('tools') tools(@Req() req: AuthenticatedRequest) { return this.ai.tools(req.user!.tenantId); }
  @Get('runs') runs(@Req() req: AuthenticatedRequest) { return this.ai.runs(req.user!.tenantId); }
  @Get('runs/:id') run(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.ai.run(req.user!.tenantId, id); }
  @Post('runs') createRun(@Req() req: AuthenticatedRequest, @Body() input: CreateAiRunDto) {
    return this.ai.createRun(req.user!.id, req.user!.tenantId, input.task, input.context ?? {});
  }
}