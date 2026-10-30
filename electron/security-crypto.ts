import { argon2Sync,createHash,randomBytes,timingSafeEqual } from 'node:crypto';
const options={memory:65536,passes:3,parallelism:1,tagLength:32};
export const digest=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
export function deriveSecret(secret:string,salt:Buffer){return argon2Sync('argon2id',{...options,message:Buffer.from(secret,'utf8'),nonce:salt});}
export function hashPassword(password:string){const salt=randomBytes(16);const hash=deriveSecret(password,salt);try{return `$argon2id$v=19$m=65536,t=3,p=1$${salt.toString('base64')}$${hash.toString('base64')}`;}finally{hash.fill(0);}}
export function verifyPassword(password:string,encoded:string){const parts=encoded.split('$');if(parts.length!==6||parts[1]!=='argon2id'||parts[2]!=='v=19'||parts[3]!=='m=65536,t=3,p=1')return false;const salt=Buffer.from(parts[4],'base64'),expected=Buffer.from(parts[5],'base64');if(salt.length!==16||expected.length!==32)return false;const actual=deriveSecret(password,salt);try{return timingSafeEqual(actual,expected);}finally{actual.fill(0);}}
