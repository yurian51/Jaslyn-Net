import { describe, expect, it } from '@jest/globals';
import { decryptUserPassword, encodeRequest, encodeResponse, parsePacket, RADIUS_CODES, ATTR, makeString } from './radius.protocol';
import { createHash } from 'node:crypto';
import { RadiusService } from './radius.service';
import type { Pool } from 'pg';
import type { ConfigService } from '@nestjs/config';


describe('RADIUS protocol',()=>{
 it('round-trips an Access-Accept response authenticator',()=>{
  const secret=Buffer.from('secret'); const requestAuth=Buffer.alloc(16,1);
  const response=encodeResponse(RADIUS_CODES.ACCESS_ACCEPT,7,requestAuth,[],secret);
  const parsed=parsePacket(response);
  const expected=createHash('md5').update(Buffer.concat([response.subarray(0,4),requestAuth,response.subarray(20),secret])).digest();
  expect(parsed.authenticator.equals(expected)).toBe(true);
 });
 it('parses malformed packet safely',()=>expect(()=>parsePacket(Buffer.alloc(19))).toThrow());
 it('decrypts RFC 2865 User-Password blocks',()=>{
  const secret=Buffer.from('secret'); const auth=Buffer.alloc(16,2); const clear=Buffer.from('password');
  const padded=Buffer.concat([clear,Buffer.alloc(8)]);
  const cipher=createHash('md5').update(Buffer.concat([secret,auth])).digest();
  const encrypted=Buffer.alloc(16);for(let i=0;i<16;i++)encrypted[i]=padded[i]^cipher[i];
  expect(decryptUserPassword(encrypted,secret,auth).toString()).toBe('password');
 });
 it('encodes an outbound Disconnect-Request with an RFC-sized packet',()=>{ const packet=encodeRequest(RADIUS_CODES.DISCONNECT_REQUEST,9,[makeString(ATTR.USER_NAME,'subscriber')]); const parsed=parsePacket(packet); expect(parsed.code).toBe(RADIUS_CODES.DISCONNECT_REQUEST); expect(parsed.identifier).toBe(9); expect(parsed.authenticator).toHaveLength(16); expect(parsed.attributes[0]?.value.toString()).toBe('subscriber'); });
});


describe('RADIUS NAS tenant isolation',()=>{
 it('rejects an incoming packet when its source address matches NAS records in multiple tenants',async()=>{
  const db={query:jest.fn().mockResolvedValue({rowCount:0,rows:[]})} as unknown as Pool;
  const config={get:jest.fn().mockReturnValue('false')} as unknown as ConfigService;
  const secure={decrypt:jest.fn()};
  const service=new RadiusService(db,config,{} as never,secure as never,{enqueue:jest.fn()} as never);
  const packet=encodeRequest(RADIUS_CODES.ACCESS_REQUEST,3,[]);
  const handlePacket=Reflect.get(service,'handlePacket') as (raw:Buffer,remote:{address:string;port:number},kind:'auth'|'accounting')=>Promise<void>;

  await handlePacket.call(service,packet,{address:'192.0.2.8',port:1812},'auth');

  expect(db.query).toHaveBeenCalledWith(expect.stringContaining('(SELECT count(*) FROM radius_nas_clients matched WHERE matched.address=$1::inet AND matched.enabled=true)=1'),['192.0.2.8']);
  expect(secure.decrypt).not.toHaveBeenCalled();
 });
});
