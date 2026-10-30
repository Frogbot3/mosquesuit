// Real provider adapters are used only by the separately built service entry.
// Electron imports the shared error/type definitions; unused adapters are removed.
import { z } from 'zod';
export interface GatewayLink {id:string;url:string;status:string}
export interface GatewayPayment {id:string;linkId:string;amountPaise:number;currency:string;status:string;createdAt:number}
export interface GatewayRefund {id:string;paymentId:string;amountPaise:number;status:string;createdAt:number}
export interface PaymentProvider {
 createLink(input:{reference:string;amountPaise:number;expiresAt:number}):Promise<GatewayLink>;
 cancelLink(id:string):Promise<void>;
 payment(id:string,linkId:string):Promise<GatewayPayment>;
 refund(key:string,paymentId:string,amountPaise:number):Promise<GatewayRefund>;
 fetchRefund(id:string):Promise<GatewayRefund>;
}
export interface MessageProvider {send(input:{jobId:string;phone:string;template:string;language:string;body:string}):Promise<{id:string}>}
export class DispatchError extends Error {constructor(public readonly outcome:'rate_limit'|'uncertain'|'rejected'){super(outcome);}}
const paymentShape=z.object({id:z.string(),amount:z.number().int(),currency:z.string(),status:z.string(),created_at:z.number().int()});
const refundShape=z.object({id:z.string(),payment_id:z.string(),amount:z.number().int(),status:z.string(),created_at:z.number().int()});
export class RazorpayTestAdapter implements PaymentProvider {
 constructor(private readonly keyId:string,private readonly keySecret:string,private readonly request:typeof fetch=fetch){if(!/^rzp_test_[A-Za-z0-9]+$/.test(keyId)||keySecret.length<16)throw new Error('Test-mode backend configuration required');}
 private async call(path:string,body?:unknown){const response=await this.request(`https://api.razorpay.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Gateway request rejected');return response.json();}
 async createLink(d:{reference:string;amountPaise:number;expiresAt:number}){const r=z.object({id:z.string(),short_url:z.string().url(),status:z.string()}).parse(await this.call('payment_links',{amount:d.amountPaise,currency:'INR',accept_partial:false,expire_by:Math.floor(d.expiresAt/1000),reference_id:d.reference,description:'Mosque contribution - test',notify:{sms:false,email:false},reminder_enable:false}));if(new URL(r.short_url).protocol!=='https:')throw new Error('Invalid gateway URL');return {id:r.id,url:r.short_url,status:r.status};}
 async cancelLink(id:string){await this.call(`payment_links/${encodeURIComponent(id)}/cancel`,{});}
 async payment(id:string,linkId:string){const [raw,link]=await Promise.all([this.call(`payments/${encodeURIComponent(id)}`),this.call(`payment_links/${encodeURIComponent(linkId)}`)]);const p=paymentShape.parse(raw);const l=z.object({id:z.string(),payments:z.array(z.object({payment_id:z.string()})).default([])}).parse(link);if(l.id!==linkId||!l.payments.some(v=>v.payment_id===id))throw new Error('Payment/link association mismatch');return {id:p.id,linkId:l.id,amountPaise:p.amount,currency:p.currency,status:p.status,createdAt:p.created_at*1000};}
 async refund(key:string,paymentId:string,amountPaise:number){const p=refundShape.parse(await this.call(`payments/${encodeURIComponent(paymentId)}/refund`,{amount:amountPaise,receipt:key,notes:{request_id:key}}));return {id:p.id,paymentId:p.payment_id,amountPaise:p.amount,status:p.status,createdAt:p.created_at*1000};}
 async fetchRefund(id:string){const p=refundShape.parse(await this.call(`refunds/${encodeURIComponent(id)}`));return {id:p.id,paymentId:p.payment_id,amountPaise:p.amount,status:p.status,createdAt:p.created_at*1000};}
}
export interface ApprovedMetaTemplate {name:string;language:string;locale:'en'|'ml';body:string}
export class MetaCloudAdapter implements MessageProvider {
 constructor(private readonly config:{token:string;senderId:string;graphVersion:string;approved:Record<string,ApprovedMetaTemplate>;allowedTestRecipients:string[]},private readonly request:typeof fetch=fetch){if(!/^v\d+\.\d+$/.test(config.graphVersion)||!/^\d+$/.test(config.senderId)||!config.token)throw new Error('Backend configuration required');}
 async send(d:{jobId:string;phone:string;template:string;language:string;body:string}){
  const approved=this.config.approved[d.template];if(!approved||approved.locale!==d.language||!this.config.allowedTestRecipients.includes(d.phone))throw new DispatchError('rejected');
  // The server-owned manifest binds a local template to the provider-approved
  // name, language and exact static text. Only approved text slots may vary.
  const slots=[...approved.body.matchAll(/\{\{(.*?)\}\}/g)];if(slots.some(m=>!['mosque','amount','period','payment_link','receipt_number','receipt_link'].includes(m[1])))throw new DispatchError('rejected');
  const escape=(s:string)=>s.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');let expression='^',offset=0;
  for(const slot of slots){expression+=escape(approved.body.slice(offset,slot.index))+'([\\s\\S]{0,500}?)';offset=slot.index!+slot[0].length;}
  expression+=escape(approved.body.slice(offset))+'$';const match=new RegExp(expression,'u').exec(d.body);if(!match)throw new DispatchError('rejected');
  const parameters=match.slice(1);let response:Response;
  try{response=await this.request('https://graph.facebook.com/'+this.config.graphVersion+'/'+this.config.senderId+'/messages',{method:'POST',headers:{Authorization:'Bearer '+this.config.token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:d.phone,type:'template',template:{name:approved.name,language:{code:approved.language},components:parameters.length?[{type:'body',parameters:parameters.map(text=>({type:'text',text}))}]:[]},biz_opaque_callback_data:d.jobId}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new DispatchError('uncertain');}
  if(response.status===429)throw new DispatchError('rate_limit');if(response.status>=500)throw new DispatchError('uncertain');if(!response.ok)throw new DispatchError('rejected');
  try{return {id:z.object({messages:z.array(z.object({id:z.string()})).min(1)}).parse(await response.json()).messages[0].id};}catch{throw new DispatchError('uncertain');}
 }
}
export class DisabledAdapter implements MessageProvider {async send():Promise<{id:string}>{throw new DispatchError('rejected');}}
// Future channels accept a channel-appropriate address. They must go through
// the same consent/approval queue when implemented; neither is routed today.
export interface OptionalNotificationAdapter {readonly channel:'email'|'sms';readonly enabled:boolean;send(input:{jobId:string;to:string;language:'en'|'ml';body:string}):Promise<{id:string}>}
export class DisabledChannelAdapter implements OptionalNotificationAdapter {readonly enabled=false;constructor(readonly channel:'email'|'sms'){}async send():Promise<{id:string}>{throw new DispatchError('rejected');}}
export const optionalNotificationAdapters={email:new DisabledChannelAdapter('email'),sms:new DisabledChannelAdapter('sms')};
