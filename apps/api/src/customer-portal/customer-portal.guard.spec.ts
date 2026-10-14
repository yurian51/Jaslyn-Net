import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { SignJWT } from 'jose';
import { CustomerPortalGuard, CustomerPortalRequest } from './customer-portal.guard';

describe('CustomerPortalGuard',()=>{
 const secret='customer-portal-test-secret-key-with-enough-entropy';
 const db={query:jest.fn()};
 let guard:CustomerPortalGuard;
 beforeEach(()=>{jest.clearAllMocks();guard=new CustomerPortalGuard(new ConfigService({JWT_SECRET:secret}),db as unknown as Pool);});

 async function context(){
  const token=await new SignJWT({tenantId:'tenant-a',role:'CUSTOMER',sid:'session-a',username:'subscriber-a'})
   .setProtectedHeader({alg:'HS256'}).setIssuer('jaslyn-net').setAudience('jaslyn-customer-portal')
   .setSubject('customer-a').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secret));
  const req:CustomerPortalRequest={headers:{authorization:'Bearer '+token}};
  const ctx={switchToHttp:()=>({getRequest:()=>req})} as unknown as ExecutionContext;
  return {ctx,req};
 }

 it('binds the portal identity to a live database session and customer in the same tenant',async()=>{
  db.query.mockResolvedValueOnce({rows:[{id:'session-a'}],rowCount:1}).mockResolvedValueOnce({rowCount:1,rows:[]});
  const {ctx,req}=await context();
  await expect(guard.canActivate(ctx)).resolves.toBe(true);
  expect(req.customerPortal).toEqual({customerId:'customer-a',tenantId:'tenant-a',sessionId:'session-a',username:'subscriber-a'});
  expect(db.query).toHaveBeenNthCalledWith(1,expect.stringContaining('s.customer_id=$3'),['session-a','tenant-a','customer-a']);
 });

 it('rejects revoked or expired portal sessions',async()=>{
  db.query.mockResolvedValueOnce({rows:[],rowCount:0});
  const {ctx,req}=await context();
  await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(req.customerPortal).toBeUndefined();
 });

 it('rejects a token issued for the operator API audience',async()=>{
  const token=await new SignJWT({tenantId:'tenant-a',role:'CUSTOMER',sid:'session-a',username:'subscriber-a'})
   .setProtectedHeader({alg:'HS256'}).setIssuer('jaslyn-net').setAudience('jaslyn-net-api')
   .setSubject('customer-a').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secret));
  const ctx={switchToHttp:()=>({getRequest:()=>({headers:{authorization:'Bearer '+token}})})} as unknown as ExecutionContext;
  await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(db.query).not.toHaveBeenCalled();
 });
});
