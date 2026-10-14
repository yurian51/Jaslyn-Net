import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AuditService } from '../audit/audit.service';
import { CustomerCommerceService } from '../customer-commerce/customer-commerce.service';
import { PaymentsService } from '../payments/payments.service';
import { PurchasesService } from '../purchases/purchases.service';
import { CustomerPortalService } from './customer-portal.service';

describe('CustomerPortalService purchase ownership',()=>{
 const db={query:jest.fn(),connect:jest.fn()};
 const audit={record:jest.fn()};
 const commerce={overview:jest.fn(),createSupport:jest.fn()};
 const payments={createIntent:jest.fn()};
 const purchases={create:jest.fn()};
 let service:CustomerPortalService;
 beforeEach(()=>{jest.clearAllMocks();service=new CustomerPortalService(db as unknown as Pool,new ConfigService({JWT_SECRET:'x'.repeat(40)}),audit as unknown as AuditService,commerce as unknown as CustomerCommerceService,payments as unknown as PaymentsService,purchases as unknown as PurchasesService);});

 it('creates a purchase only from a published package in the authenticated tenant',async()=>{
  db.query.mockResolvedValueOnce({rows:[{id:'package-a'}],rowCount:1});
  purchases.create.mockResolvedValueOnce({id:'purchase-a',status:'PENDING_PAYMENT'});
  await expect(service.createPurchase('tenant-a','customer-a',{packageId:'package-a'}))
   .resolves.toMatchObject({id:'purchase-a',status:'PENDING_PAYMENT'});
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id=$1 AND id=$2 AND is_active=true AND show_on_portal=true'),['tenant-a','package-a']);
  expect(purchases.create).toHaveBeenCalledWith('tenant-a',{customerId:'customer-a',packageId:'package-a',routerId:undefined,promoCode:undefined});
 });

 it('does not create a purchase for a hidden or cross-tenant package',async()=>{
  db.query.mockResolvedValueOnce({rows:[],rowCount:0});
  await expect(service.createPurchase('tenant-a','customer-a',{packageId:'package-b'})).rejects.toBeInstanceOf(NotFoundException);
  expect(purchases.create).not.toHaveBeenCalled();
 });

 it('rejects a purchase that does not belong to the token-bound customer',async()=>{
  db.query.mockResolvedValueOnce({rows:[],rowCount:0});
  await expect(service.createPurchaseIntent('tenant-a','customer-a',{purchaseId:'purchase-b',provider:'UPESIPAY'}))
    .rejects.toBeInstanceOf(NotFoundException);
  expect(payments.createIntent).not.toHaveBeenCalled();
 });

 it('rejects a paid purchase rather than creating a duplicate payment intent',async()=>{
  db.query.mockResolvedValueOnce({rows:[{id:'purchase-a',status:'PAID'}],rowCount:1});
  await expect(service.createPurchaseIntent('tenant-a','customer-a',{purchaseId:'purchase-a',provider:'UPESIPAY'}))
    .rejects.toBeInstanceOf(BadRequestException);
  expect(payments.createIntent).not.toHaveBeenCalled();
 });

 it('delegates a pending purchase only after tenant and customer ownership are confirmed',async()=>{
  db.query.mockResolvedValueOnce({rows:[{id:'purchase-a',status:'PENDING_PAYMENT'}],rowCount:1});
  payments.createIntent.mockResolvedValueOnce({id:'intent-a',status:'PENDING'});
  await expect(service.createPurchaseIntent('tenant-a','customer-a',{purchaseId:'purchase-a',provider:'UPESIPAY',idempotencyKey:'intent-key'}))
    .resolves.toEqual({id:'intent-a',status:'PENDING'});
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id=$1 AND customer_id=$2 AND id=$3'),['tenant-a','customer-a','purchase-a']);
  expect(payments.createIntent).toHaveBeenCalledWith('tenant-a',{purchaseId:'purchase-a',provider:'UPESIPAY',idempotencyKey:'intent-key'});
 });
});
