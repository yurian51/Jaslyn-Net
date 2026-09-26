import { Module } from '@nestjs/common';
import { CustomerCommerceController } from './customer-commerce.controller';
import { CustomerCommerceService } from './customer-commerce.service';
@Module({controllers:[CustomerCommerceController],providers:[CustomerCommerceService],exports:[CustomerCommerceService]})
export class CustomerCommerceModule {}
