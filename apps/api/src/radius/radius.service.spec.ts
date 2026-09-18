import { describe, expect, it } from '@jest/globals';
import { decryptUserPassword, encodeResponse, parsePacket, RADIUS_CODES } from './radius.protocol';
import { createHash } from 'node:crypto';

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
});
