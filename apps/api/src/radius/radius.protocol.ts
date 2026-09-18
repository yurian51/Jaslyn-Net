import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type RadiusAttribute = { type: number; value: Buffer };
export type RadiusPacket = { code: number; identifier: number; authenticator: Buffer; attributes: RadiusAttribute[] };

export const RADIUS_CODES = {
  ACCESS_REQUEST: 1, ACCESS_ACCEPT: 2, ACCESS_REJECT: 3, ACCOUNTING_REQUEST: 4, ACCOUNTING_RESPONSE: 5,
  DISCONNECT_REQUEST: 40, DISCONNECT_ACK: 41, DISCONNECT_NAK: 42, COA_REQUEST: 43, COA_ACK: 44, COA_NAK: 45,
} as const;

export const ATTR = {
  USER_NAME: 1, USER_PASSWORD: 2, CHAP_PASSWORD: 3, NAS_IP_ADDRESS: 4, FRAMED_IP_ADDRESS: 8, FILTER_ID: 11,
  SESSION_TIMEOUT: 27, CALLED_STATION_ID: 30, CALLING_STATION_ID: 31, NAS_IDENTIFIER: 32, NAS_PORT: 5,
  REPLY_MESSAGE: 18, ACCT_STATUS_TYPE: 40, ACCT_SESSION_ID: 44, ACCT_SESSION_TIME: 46,
  ACCT_INPUT_OCTETS: 42, ACCT_OUTPUT_OCTETS: 43, ACCT_TERMINATE_CAUSE: 49, ACCT_INTERIM_INTERVAL: 85,
  VENDOR_SPECIFIC: 26,
} as const;

export function parsePacket(buffer: Buffer): RadiusPacket {
  if (buffer.length < 20) throw new Error('RADIUS packet is shorter than header');
  const code = buffer.readUInt8(0), identifier = buffer.readUInt8(1), length = buffer.readUInt16BE(2);
  if (length < 20 || length > buffer.length) throw new Error('Invalid RADIUS packet length');
  const authenticator = buffer.subarray(4, 20);
  const attributes: RadiusAttribute[] = [];
  let offset = 20;
  while (offset < length) {
    if (offset + 2 > length) throw new Error('Truncated RADIUS attribute header');
    const type = buffer.readUInt8(offset), attrLength = buffer.readUInt8(offset + 1);
    if (attrLength < 2 || offset + attrLength > length) throw new Error('Invalid RADIUS attribute length');
    attributes.push({ type, value: Buffer.from(buffer.subarray(offset + 2, offset + attrLength)) });
    offset += attrLength;
  }
  return { code, identifier, authenticator: Buffer.from(authenticator), attributes };
}

export function attribute(packet: RadiusPacket, type: number) { return packet.attributes.find(a => a.type === type)?.value; }
export function stringAttribute(packet: RadiusPacket, type: number) { const v=attribute(packet,type); return v?.toString('utf8'); }
export function uint32Attribute(packet: RadiusPacket, type: number) { const v=attribute(packet,type); return v && v.length===4 ? v.readUInt32BE(0) : undefined; }

export function decryptUserPassword(value: Buffer, secret: Buffer, requestAuthenticator: Buffer): Buffer {
  if (!value.length || value.length % 16 !== 0) throw new Error('Invalid User-Password attribute');
  const out = Buffer.alloc(value.length);
  let previous = requestAuthenticator;
  for (let offset=0; offset<value.length; offset+=16) {
    const digest = createHash('md5').update(Buffer.concat([secret, previous])).digest();
    for(let i=0;i<16;i++) out[offset+i]=value[offset+i]^digest[i];
    previous = value.subarray(offset, offset+16);
  }
  let end=out.length;
  while(end>0 && out[end-1]===0) end--;
  return out.subarray(0,end);
}

function encodeAttributes(attributes: RadiusAttribute[]) {
  const chunks: Buffer[] = [];
  for (const attr of attributes) {
    if (attr.value.length > 253) throw new Error('RADIUS attribute exceeds 253 bytes');
    const b=Buffer.alloc(attr.value.length+2); b[0]=attr.type; b[1]=b.length; attr.value.copy(b,2); chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export function encodeResponse(code:number, identifier:number, requestAuthenticator:Buffer, attributes:RadiusAttribute[], secret:Buffer) {
  const attrs=encodeAttributes(attributes);
  const header=Buffer.alloc(20); header.writeUInt8(code,0); header.writeUInt8(identifier,1); header.writeUInt16BE(20+attrs.length,2);
  const responseAuth=createHash('md5').update(Buffer.concat([header.subarray(0,4),requestAuthenticator,attrs,secret])).digest();
  responseAuth.copy(header,4);
  return Buffer.concat([header,attrs]);
}

export function verifyRequestAuthenticator(packet:RadiusPacket, raw:Buffer, secret:Buffer) {
  if (packet.code === RADIUS_CODES.ACCESS_REQUEST) return true;
  const attrs=raw.subarray(20, raw.readUInt16BE(2));
  const header=Buffer.from(raw.subarray(0,20)); packet.authenticator.copy(header,4);
  const expected=createHash('md5').update(Buffer.concat([raw.subarray(0,4),Buffer.alloc(16),attrs,secret])).digest();
  return timingSafeEqual(expected, packet.authenticator);
}

export function makeString(type:number,value:string):RadiusAttribute { return {type,value:Buffer.from(value,'utf8')}; }
export function makeUInt32(type:number,value:number):RadiusAttribute { const b=Buffer.alloc(4);b.writeUInt32BE(value>>>0);return {type,value:b}; }
