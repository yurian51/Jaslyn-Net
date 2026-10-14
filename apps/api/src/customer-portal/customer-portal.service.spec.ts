import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AuditService } from '../audit/audit.service';
import { CustomerCommerceService } from '../customer-commerce/customer-commerce.service';
import { PaymentsService } from '../payments/payments.service';
import { PurchasesService } from '../purchases/purchases.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SmsGatewayService } from '../notifications/sms-gateway.service';
import { CustomerPortalService } from './customer-portal.service';

describe('CustomerPortalService purchase ownership',()=>{
 const db={query:jest.fn(),connect:jest.fn()};
 const audit={record:jest.fn()};
 const commerce={overview:jest.fn(),createSupport:jest.fn()};
 const payments={createIntent:jest.fn()};
 const purchases={create:jest.fn()};
 const notifications={enqueueSms:jest.fn()};
 const smsGateway={status:jest.fn()};
 let service:CustomerPortalService;
 const makeService=(config:ConfigService)=>new CustomerPortalService(db as unknown as Pool,config,audit as unknown as AuditService,commerce as unknown as CustomerCommerceService,payments as unknown as PaymentsService,purchases as unknown as PurchasesService,notifications as unknown as NotificationsService,smsGateway as unknown as SmsGatewayService);
 beforeEach(()=>{jest.clearAllMocks();service=makeService(new ConfigService({JWT_SECRET:'x'.repeat(40)}));});

 it('creates a purchase only from a published package in the authenticated tenant',async()=>{
  db.query.mockResolvedValueOnce({rows:[{id:'package-a'}],rowCount:1});
  purchases.create.mockResolvedValueOnce({id:'purchase-a',status:'PENDING_PAYMENT'});
  await expect(service.createPurchase('tenant-a','customer-a',{packageId:'package-a',idempotencyKey:'purchase-key-123456'}))
   .resolves.toMatchObject({id:'purchase-a',status:'PENDING_PAYMENT'});
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id=$1 AND id=$2 AND is_active=true AND show_on_portal=true'),['tenant-a','package-a']);
  expect(purchases.create).toHaveBeenCalledWith('tenant-a',{customerId:'customer-a',packageId:'package-a',routerId:undefined,promoCode:undefined,idempotencyKey:'purchase-key-123456'});
 });

 it('does not create a purchase for a hidden or cross-tenant package',async()=>{
  db.query.mockResolvedValueOnce({rows:[],rowCount:0});
  await expect(service.createPurchase('tenant-a','customer-a',{packageId:'package-b',idempotencyKey:'purchase-key-123456'})).rejects.toBeInstanceOf(NotFoundException);
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

 const portalConfig=()=>new ConfigService({JWT_SECRET:'x'.repeat(40),CUSTOMER_PORTAL_PUBLIC_URL:'https://portal.example.com'});
 function setupInvitation(phone:string|null){
  db.query.mockResolvedValueOnce({rows:[{id:'customer-a',fullName:'Ada',username:'ada',tenantSlug:'tenant-a',phone}],rowCount:1});
  const client={query:jest.fn()
    .mockResolvedValueOnce({rows:[],rowCount:0})
    .mockResolvedValueOnce({rows:[],rowCount:0})
    .mockResolvedValueOnce({rows:[{expiresAt:'2026-10-15T00:00:00.000Z'}],rowCount:1})
    .mockResolvedValueOnce({rows:[],rowCount:0}),release:jest.fn()};
  db.connect.mockResolvedValueOnce(client);
  return client;
 }

 it('queues a tenant-scoped, idempotent activation SMS when the provider is configured',async()=>{
  service=makeService(portalConfig());
  const client=setupInvitation('0712345678');
  smsGateway.status.mockResolvedValueOnce({configured:true});
  notifications.enqueueSms.mockResolvedValueOnce({id:'outbox-a',status:'PENDING'});
  const result=await service.issueInvitation('tenant-a','admin-a','customer-a');
  expect(notifications.enqueueSms).toHaveBeenCalledWith('tenant-a',expect.objectContaining({
   recipient:'0712345678',category:'TRANSACTIONAL',idempotencyKey:expect.stringMatching(/^customer-portal-invitation:/),
   message:expect.stringContaining('https://portal.example.com/customer-portal#invite='),
  }));
  expect(result.delivery).toContain('SMS invitation queued');
  expect(result.customer).not.toHaveProperty('phone');
  expect(client.release).toHaveBeenCalled();
  expect(audit.record).toHaveBeenCalledWith('tenant-a','CUSTOMER_PORTAL_INVITATION_ISSUED','customer','customer-a',expect.objectContaining({delivery:expect.stringContaining('SMS invitation queued')}),expect.any(Object));
 });

 it('falls back to private manual delivery when tenant SMS is not configured',async()=>{
  service=makeService(portalConfig());
  setupInvitation('0712345678');
  smsGateway.status.mockResolvedValueOnce({configured:false});
  const result=await service.issueInvitation('tenant-a','admin-a','customer-a');
  expect(notifications.enqueueSms).not.toHaveBeenCalled();
  expect(result.delivery).toContain('SMS is not configured for this tenant');
 });

 it('does not attempt SMS when the customer has no phone number',async()=>{
  service=makeService(portalConfig());
  setupInvitation(null);
  const result=await service.issueInvitation('tenant-a','admin-a','customer-a');
  expect(smsGateway.status).not.toHaveBeenCalled();
  expect(notifications.enqueueSms).not.toHaveBeenCalled();
  expect(result.delivery).toContain('No customer phone number is on file');
 });
});
