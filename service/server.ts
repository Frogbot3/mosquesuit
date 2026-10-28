import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { createServer as createHttpsServer,type ServerOptions } from 'node:https';
import { createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { IntegrationError,mockConfigSchema,simulateSchema } from '../shared/integrations';
import { IntegrationService,digest,verifySignature } from './engine';
import type { MockProviders } from './mock-providers';
const idRequest=z.object({id:z.string().max(160).min(1)}).strict();
const escaped=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function startIntegrationServer(options:{engine:IntegrationService;deviceToken:string;adminToken:string;webhookSecret:string;mock?:MockProviders;tls?:ServerOptions;port?:number;verifyToken?:string}){
 const {engine}=options;const deviceHash=Buffer.from(digest(options.deviceToken),'hex');const adminHash=Buffer.from(digest(options.adminToken),'hex');if(options.deviceToken.length<32||options.adminToken.length<32)throw new Error('Strong service credentials required');
 let requests=0,windowStart=Date.now();let lastMockEvent:Buffer|null=null;
 async function handler(req:IncomingMessage,res:ServerResponse){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
  const send=(status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try{if(Date.now()-windowStart>=60000){windowStart=Date.now();requests=0;}if(++requests>180)return send(429,{ok:false,code:'INTEGRATION_STATE'});
   const url=new URL(req.url??'/','https://service.invalid');if(req.headers.origin)return send(403,{ok:false,code:'INTEGRATION_AUTH'});
   if(req.method==='GET'&&url.pathname==='/receipt'){const receipt=engine.receipt(url.searchParams.get('token')??'');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Receipt / രസീത്</title><body><p>FICTIONAL DEMO / സാങ്കൽപ്പിക മാതൃക</p><h1>${escaped(receipt.mosque)} / ${escaped(receipt.mosqueMl)}</h1><h2>Receipt / രസീത്</h2><p>${escaped(receipt.number)}</p><p>Date / തീയതി: ${escaped(receipt.date)}</p><p>Total / ആകെ: INR ${(receipt.amountPaise/100).toFixed(2)}</p><p>Private receipt summary. The full issued receipt remains in Mosque Suite.</p></body></html>`);return;}
   if(req.method==='GET'&&url.pathname==='/webhooks/meta'&&options.verifyToken){if(url.searchParams.get('hub.mode')!=='subscribe'||digest(url.searchParams.get('hub.verify_token')??'')!==digest(options.verifyToken))throw new IntegrationError('INTEGRATION_AUTH');res.end(url.searchParams.get('hub.challenge')?.slice(0,200)??'');return;}
   const webhook=url.pathname==='/webhooks/payment'||url.pathname==='/webhooks/meta';let admin=false;
   if(!webhook){const supplied=Buffer.from(digest(String(req.headers.authorization??'').replace(/^Bearer /,'')),'hex');admin=timingSafeEqual(supplied,adminHash);if(!admin&&!timingSafeEqual(supplied,deviceHash))throw new IntegrationError('INTEGRATION_AUTH');if((url.pathname.startsWith('/mock/')||url.pathname==='/refund')&&!admin)throw new IntegrationError('INTEGRATION_AUTH');}
   if(req.method==='GET'&&url.pathname==='/health')return send(200,{ok:true,data:{mode:options.mock?'mock':'test',workspaceId:engine.workspaceId}});
   if(req.method!=='POST')return send(405,{ok:false,code:'INTEGRATION_INVALID'});
   if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(415,{ok:false,code:'INTEGRATION_INVALID'});
   const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const data=Buffer.from(chunk);size+=data.length;if(size>2*1024*1024)return send(413,{ok:false,code:'INTEGRATION_INVALID'});chunks.push(data);}const raw=Buffer.concat(chunks);const input=raw.length?JSON.parse(raw.toString('utf8')):{};let result:unknown=null;
   const sign=(body:Buffer)=>createHmac('sha256',options.webhookSecret).update(body).digest('hex');
   switch(url.pathname){
    case '/sync':result=engine.synchronize(input);break;
    case '/changes':z.object({}).strict().parse(input);result=engine.changes();break;
    case '/dispatch':z.object({}).strict().parse(input);await engine.dispatch();result=engine.changes();break;
    case '/links/create':result=await engine.createLink(input);break;
    case '/links/cancel':await engine.cancelLink(idRequest.parse(input).id);break;
    case '/ack':engine.acknowledge(input);break;
    case '/receipt-token':result=engine.receiptToken(idRequest.parse(input).id);break;
    case '/refund':{const refund=await engine.refund(input);if(options.mock){const link=engine.links().find(l=>l.paymentId===refund.paymentId)!;const body=Buffer.from(JSON.stringify({eventId:randomUUID(),event:'refund',linkId:link.id,paymentId:refund.paymentId,refundId:refund.id,createdAt:engine.now()}));await engine.webhook(body,sign(body));}result=refund;break;}
    case '/mock/config':{if(!options.mock)throw new IntegrationError('INTEGRATION_STATE');options.mock.nextSend=mockConfigSchema.parse(input).nextSend;break;}
    case '/mock/event':{if(!options.mock)throw new IntegrationError('INTEGRATION_STATE');const d=simulateSchema.parse(input);if(d.event==='delivered'){const job=engine.jobs().find(j=>j.id===d.id);if(!job?.providerId)throw new IntegrationError('INTEGRATION_STATE');const body=Buffer.from(JSON.stringify({id:job.providerId,status:'delivered'}));engine.deliveryWebhook(body,sign(body));break;}
     if(d.event==='settled'){const link=engine.links().find(l=>l.id===d.id);if(!link?.paymentId)throw new IntegrationError('INTEGRATION_STATE');engine.observeMockSettlement(link.paymentId);break;}
     if(d.event==='replay'){if(!lastMockEvent)throw new IntegrationError('INTEGRATION_STATE');await engine.webhook(lastMockEvent,sign(lastMockEvent));break;}
     const link=engine.links().find(l=>l.id===d.id);if(!link||link.status!=='active')throw new IntegrationError('INTEGRATION_STATE');if(d.event==='invalid_signature'){await engine.webhook(Buffer.from('{}'),'0'.repeat(64));break;}const payment=options.mock.capture(link.providerId);lastMockEvent=Buffer.from(JSON.stringify({eventId:randomUUID(),event:'capture',linkId:link.id,paymentId:payment.id,refundId:'',createdAt:engine.now()}));await engine.webhook(lastMockEvent,sign(lastMockEvent));break;
    }
    case '/webhooks/payment':{
     const signature=String(req.headers['x-razorpay-signature']??'');if(options.mock){await engine.webhook(raw,signature);break;}
     if(!verifySignature(raw,signature,options.webhookSecret))throw new IntegrationError('INTEGRATION_SIGNATURE');
     const payload=z.object({event:z.literal('payment_link.paid'),created_at:z.number().int(),payload:z.object({payment_link:z.object({entity:z.object({id:z.string()})}),payment:z.object({entity:z.object({id:z.string()})})})}).parse(input);
     const link=engine.links().find(l=>l.providerId===payload.payload.payment_link.entity.id);if(!link)throw new IntegrationError('INTEGRATION_INVALID');const eventId=String(req.headers['x-razorpay-event-id']??'');if(!eventId)throw new IntegrationError('INTEGRATION_INVALID');const normalized=Buffer.from(JSON.stringify({eventId,event:'capture',createdAt:payload.created_at*1000,linkId:link.id,paymentId:payload.payload.payment.entity.id,refundId:''}));await engine.webhook(normalized,sign(normalized));break;
    }
    case '/webhooks/meta':{const signature=String(req.headers['x-hub-signature-256']??'');if(options.mock){engine.deliveryWebhook(raw,signature);break;}if(!verifySignature(raw,signature.replace(/^sha256=/,''),options.webhookSecret))throw new IntegrationError('INTEGRATION_SIGNATURE');const data=z.object({entry:z.array(z.object({changes:z.array(z.object({value:z.object({statuses:z.array(z.object({id:z.string(),status:z.enum(['sent','delivered','read','failed'])})).optional()})}))}))}).parse(input);for(const e of data.entry)for(const c of e.changes)for(const status of c.value.statuses??[]){const body=Buffer.from(JSON.stringify({id:status.id,status:status.status==='read'?'delivered':status.status}));try{engine.deliveryWebhook(body,sign(body));}catch(error){if(!(error instanceof IntegrationError&&error.code==='INTEGRATION_REPLAY'))throw error;}}break;}
    default:return send(404,{ok:false,code:'INTEGRATION_INVALID'});
   }send(200,{ok:true,data:result});
  }catch(error){const code=error instanceof IntegrationError?error.code:error instanceof z.ZodError||error instanceof SyntaxError?'INTEGRATION_INVALID':'INTEGRATION_STATE';if(code==='INTEGRATION_REPLAY'&&req.url?.startsWith('/webhooks/'))send(200,{ok:true,data:{duplicate:true}});else send(code==='INTEGRATION_AUTH'||code==='INTEGRATION_SIGNATURE'?401:code==='INTEGRATION_REPLAY'||code==='INTEGRATION_CONFLICT'?409:400,{ok:false,code});}
 }
 if(!options.mock&&!options.tls)throw new Error('TLS is required for provider test mode');
 const server=options.tls?createHttpsServer(options.tls,(req,res)=>void handler(req,res)):createServer((req,res)=>void handler(req,res));server.requestTimeout=20000;server.headersTimeout=10000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??0,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');return {url:`${options.tls?'https':'http'}://127.0.0.1:${address.port}`,close:()=>new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections();})};
}
