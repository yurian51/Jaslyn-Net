import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TrafficModule } from '../modules/traffic/traffic.module';
import { CommandAuthorizationService } from './command-authorization.service';
import { CommandFabricService } from './command-fabric.service';

@Module({
  imports: [AuditModule, TrafficModule],
  providers: [CommandAuthorizationService, CommandFabricService],
  exports: [CommandAuthorizationService, CommandFabricService],
})
export class CommandsModule {}
