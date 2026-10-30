// Standalone service entry point. This file and its environment are never
// packaged with Electron. Starting it does not deploy or enable live payments.
import Database from 'better-sqlite3';
import { readFileSync,mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { z } from 'zod';
import { IntegrationService } from './engine';
import { MockProviders } from './mock-providers';
import { RazorpayTestAdapter,MetaCloudAdapter,DisabledAdapter,type MessageProvider } from './providers';
import { startIntegrationServer } from './server';
const required=(name:string)=>{const value=process.env[name];if(!value)throw new Error(`Missing server configuration: ${name}`);return value;};
async function main(){
 const workspaceId=z.string().uuid().parse(required('MOSQUE_WORKSPACE_ID'));
 const deviceToken=z.string().min(32).parse(required('MOSQUE_DEVICE_TOKEN'));
 const adminToken=z.string().min(32).parse(required('MOSQUE_ADMIN_TOKEN'));
 const webhookSecret=z.string().min(32).parse(required('MOSQUE_WEBHOOK_SECRET'));
 if(deviceToken===adminToken)throw new Error('Device and admin credentials must differ');
 const mode=z.enum(['mock','razorpay-test']).parse(process.env.MOSQUE_PROVIDER_MODE??'mock');
 const path=resolve(required('MOSQUE_SERVICE_DATABASE'));mkdirSync(dirname(path),{recursive:true});const db=new Database(path);
 const mock=new MockProviders(db);const payments=mode==='mock'?mock:new RazorpayTestAdapter(required('RAZORPAY_KEY_ID'),required('RAZORPAY_KEY_SECRET'));
 let messages:MessageProvider=mode==='mock'?mock:new DisabledAdapter();
 if(process.env.MOSQUE_ENABLE_META_TEST==='AUTHORIZED_TEST_RECIPIENTS_ONLY'){
  if(mode==='mock')throw new Error('External messaging cannot be enabled in mock mode');
  const approved=z.record(z.string(),z.object({name:z.string().regex(/^[a-z0-9_]+$/),language:z.string(),locale:z.enum(['en','ml']),body:z.string().min(1)}).strict()).parse(JSON.parse(readFileSync(required('META_TEMPLATE_MANIFEST'),'utf8')));
  messages=new MetaCloudAdapter({token:required('META_ACCESS_TOKEN'),senderId:required('META_SENDER_ID'),graphVersion:required('META_GRAPH_VERSION'),approved,allowedTestRecipients:required('META_ALLOWED_RECIPIENTS').split(',').map(s=>z.string().regex(/^\+[1-9]\d{7,14}$/).parse(s.trim()))});
 }
 const tls=mode==='mock'?undefined:{key:readFileSync(required('MOSQUE_TLS_KEY_FILE')),cert:readFileSync(required('MOSQUE_TLS_CERT_FILE')),minVersion:'TLSv1.2' as const};
 const engine=new IntegrationService(db,workspaceId,{payments,messages},webhookSecret);
 const server=await startIntegrationServer({engine,deviceToken,adminToken,webhookSecret,mock:mode==='mock'?mock:undefined,tls,port:z.coerce.number().int().min(1024).max(65535).parse(process.env.MOSQUE_SERVICE_PORT??'8787'),publicBaseUrl:mode==='mock'?undefined:required('MOSQUE_PUBLIC_ORIGIN'),metaAppSecret:process.env.META_APP_SECRET,metaWabaId:process.env.META_WABA_ID,metaSenderId:process.env.META_SENDER_ID,verifyToken:process.env.META_VERIFY_TOKEN});
 let active=false;
 const timer=setInterval(()=>{if(active)return;active=true;void (async()=>{try{if(db.prepare('SELECT 1 FROM service_state').get()){engine.runSchedules();await engine.dispatch();}}catch{process.stderr.write('Service worker paused this cycle; review authenticated status.\n');}finally{active=false;}})();},30000);
 const shutdown=async()=>{clearInterval(timer);await server.close();db.close();process.exit(0);};process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());
 process.stdout.write(`Mosque integration service listening on loopback, mode: ${mode}. No public deployment performed.\n`);
}
void main().catch(()=>{process.stderr.write('Service could not start. Check required configuration, TLS and database access. No secret values are logged.\n');process.exitCode=1;});
