import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { IntegrationError } from '../shared/integrations';
import { IntegrationService,verifySignature } from './engine';
const entityId=z.string().min(1).max(160);
export async function paymentWebhook(engine:IntegrationService,raw:Buffer,signature:string,eventId:string,secret:string){
 if(!verifySignature(raw,signature,secret))throw new IntegrationError('INTEGRATION_SIGNATURE');
 const body=z.object({event:z.enum(['payment_link.paid','refund.processed']),created_at:z.number().int().positive(),payload:z.object({payment_link:z.object({entity:z.object({id:entityId})}).optional(),payment:z.object({entity:z.object({id:entityId})}).optional(),refund:z.object({entity:z.object({id:entityId,payment_id:entityId})}).optional()})}).parse(JSON.parse(raw.toString('utf8')));
 if(!eventId||eventId.length>160)throw new IntegrationError('INTEGRATION_INVALID');
 const paymentId=body.event==='refund.processed'?body.payload.refund?.entity.payment_id:body.payload.payment?.entity.id;
 const link=engine.links().find(l=>body.event==='refund.processed'?l.paymentId===paymentId:l.providerId===body.payload.payment_link?.entity.id);
 // An unmatched refund is rejected so the provider retries after capture/link
 // association becomes available. No guessed family or ledger association.
 if(!link||!paymentId)throw new IntegrationError('INTEGRATION_STATE');
 const normalized=Buffer.from(JSON.stringify({eventId,event:body.event==='refund.processed'?'refund':'capture',createdAt:body.created_at*1000,linkId:link.id,paymentId,refundId:body.payload.refund?.entity.id??''}));
 await engine.webhook(normalized,createHmac('sha256',secret).update(normalized).digest('hex'));
}
export function metaWebhook(engine:IntegrationService,raw:Buffer,signature:string,config:{appSecret:string;wabaId:string;senderId:string;internalSecret:string}){
 if(!config.wabaId||!config.senderId||!config.appSecret||!signature.startsWith('sha256=')||!verifySignature(raw,signature.slice(7),config.appSecret))throw new IntegrationError('INTEGRATION_SIGNATURE');
 const body=z.object({object:z.literal('whatsapp_business_account'),entry:z.array(z.object({id:entityId,changes:z.array(z.object({field:z.string(),value:z.object({metadata:z.object({phone_number_id:entityId}),statuses:z.array(z.object({id:entityId,status:z.enum(['sent','delivered','read','failed'])})).optional(),messages:z.array(z.object({id:entityId,from:z.string().regex(/^[1-9]\d{7,14}$/),type:z.string(),text:z.object({body:z.string().max(4096)}).optional()})).optional()})}))}))}).parse(JSON.parse(raw.toString('utf8')));
 for(const entry of body.entry)for(const change of entry.changes){if(entry.id!==config.wabaId||change.value.metadata.phone_number_id!==config.senderId||change.field!=='messages')throw new IntegrationError('INTEGRATION_AUTH');
  for(const message of change.value.messages??[])if(message.type==='text'&&/^(stop|unsubscribe|നിർത്തുക)$/iu.test(message.text?.body.trim()??''))engine.optOut(`+${message.from}`,message.id);
  for(const status of change.value.statuses??[]){const normalized=Buffer.from(JSON.stringify({id:status.id,status:status.status==='read'?'delivered':status.status}));try{engine.deliveryWebhook(normalized,createHmac('sha256',config.internalSecret).update(normalized).digest('hex'));}catch(error){if(!(error instanceof IntegrationError&&error.code==='INTEGRATION_REPLAY'))throw error;}}
 }
}
