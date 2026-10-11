import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SecretsVaultController } from './secrets-vault.controller';
import { SecretsVaultService } from './secrets-vault.service';

@Module({imports:[AuditModule],controllers:[SecretsVaultController],providers:[SecretsVaultService],exports:[SecretsVaultService]})
export class SecretsVaultModule {}
