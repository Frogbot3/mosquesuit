import type Database from 'better-sqlite3';
import { createHash,createHmac,randomBytes,randomUUID,timingSafeEqual } from 'node:crypto';
import { IntegrationError,quietNow,notificationId,type PaymentLink,type VerifiedEvent,type NotificationJob } from '../shared/integrations';
import { serviceSnapshotSchema,serviceLinkSchema,serviceWebhookSchema,serviceRefundSchema,serviceAckSchema,type ServiceSnapshot } from './protocol';
import { DispatchError,type MessageProvider,type PaymentProvider } from './providers';

export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function verifySignature(raw:Buffer,signature:string,secret:string){if(!/^[a-f\d]{64}$/i.test(signature))return false;const expected=createHmac('sha256',secret).update(raw).digest();return timingSafeEqual(expected,Buffer.from(signature,'hex'));}
type RemoteJob=ServiceSnapshot['jobs'][number]&{attempts:number;reason:string;providerId:string;createdAt:number;sentAt:number};
type LinkRecord=PaymentLink&{key:string};
export class IntegrationService {
 private dispatching=false;
 receiptBaseUrl='';
 constructor(readonly db:Database.Database,readonly workspaceId:string,private readonly providers:{payments:PaymentProvider;messages:MessageProvider},private readonly webhookSecret:string,readonly now:()=>number=Date.now){
  const version=db.pragma('user_version',{simple:true}) as number;if(version>1)throw new Error('Newer service database');db.pragma('user_version=1');
  db.pragma('foreign_keys=ON');db.pragma('journal_mode=WAL');db.pragma('synchronous=FULL');db.exec(`
  CREATE TABLE IF NOT EXISTS service_state(id INTEGER PRIMARY KEY CHECK(id=1),workspace_id TEXT NOT NULL,snapshot TEXT NOT NULL,updated_at INTEGER NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS service_jobs(id TEXT PRIMARY KEY,dedupe TEXT NOT NULL UNIQUE,payload TEXT NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS service_links(id TEXT PRIMARY KEY,command_key TEXT NOT NULL UNIQUE,payload TEXT NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS verified_events(id TEXT PRIMARY KEY,payment_id TEXT NOT NULL,refund_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0,receipt_id TEXT NOT NULL DEFAULT '',transaction_id TEXT NOT NULL DEFAULT '',UNIQUE(payment_id,refund_id,kind)) STRICT;
  CREATE TABLE IF NOT EXISTS webhook_event_log(id TEXT PRIMARY KEY,digest TEXT NOT NULL,kind TEXT NOT NULL,at INTEGER NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS service_attempts(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES service_jobs(id),outcome TEXT NOT NULL,at INTEGER NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS service_receipts(id TEXT PRIMARY KEY,payload TEXT NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS receipt_tokens(hash TEXT PRIMARY KEY,receipt_id TEXT NOT NULL REFERENCES service_receipts(id),expires_at INTEGER NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS refund_requests(id TEXT PRIMARY KEY,payment_id TEXT NOT NULL,amount_paise INTEGER NOT NULL,status TEXT NOT NULL,refund_id TEXT NOT NULL DEFAULT '') STRICT;
  CREATE TABLE IF NOT EXISTS settlement_observations(payment_id TEXT PRIMARY KEY,status TEXT NOT NULL,at INTEGER NOT NULL) STRICT;
  CREATE TABLE IF NOT EXISTS service_optouts(phone TEXT PRIMARY KEY,revision INTEGER NOT NULL,at INTEGER NOT NULL) STRICT;
  `);
  const state=db.prepare('SELECT workspace_id FROM service_state').get() as {workspace_id:string}|undefined;if(state&&state.workspace_id!==workspaceId)throw new IntegrationError('INTEGRATION_AUTH');
  // A crash after a provider accepted a send cannot safely be retried blindly.
  for(const job of this.jobs())if(job.status==='sending')this.putJob({...job,status:'uncertain',reason:'Interrupted dispatch; provider outcome unknown'});
 }
 private putJob(job:RemoteJob){this.db.prepare('INSERT INTO service_jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(job.id,job.dedupe,JSON.stringify(job));}
 private putLink(link:LinkRecord){this.db.prepare('INSERT INTO service_links VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(link.id,link.key,JSON.stringify(link));}
 jobs():RemoteJob[]{return (this.db.prepare('SELECT payload FROM service_jobs ORDER BY rowid').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 links():LinkRecord[]{return (this.db.prepare('SELECT payload FROM service_links').all() as {payload:string}[]).map(r=>{const link=JSON.parse(r.payload) as LinkRecord;if(link.status==='active'&&link.expiresAt<=this.now()){link.status='expired';this.putLink(link);}return link;});}
 private snapshot(){const row=this.db.prepare('SELECT snapshot,updated_at FROM service_state WHERE id=1').get() as {snapshot:string;updated_at:number}|undefined;if(!row)throw new IntegrationError('INTEGRATION_STATE');return {...row,data:JSON.parse(row.snapshot) as ServiceSnapshot};}
 synchronize(input:unknown){const snapshot=serviceSnapshotSchema.parse(input);if(snapshot.workspaceId!==this.workspaceId)throw new IntegrationError('INTEGRATION_AUTH');
  this.db.transaction(()=>{this.db.prepare('INSERT INTO service_state VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,updated_at=excluded.updated_at').run(this.workspaceId,JSON.stringify(snapshot),this.now());
   const existing=new Map(this.jobs().map(j=>[j.id,j]));
   for(const incoming of snapshot.jobs){const prior=existing.get(incoming.id);if(prior){if(prior.familyId!==incoming.familyId||prior.dedupe!==incoming.dedupe)throw new IntegrationError('INTEGRATION_CONFLICT');if(incoming.status==='cancelled'&&['approval','queued','retry'].includes(prior.status))this.putJob({...prior,status:'cancelled',reason:'Cancelled by staff'});else if(prior.status==='approval'&&incoming.status==='queued')this.putJob({...prior,status:'queued'});continue;}
    if(!['approval','queued','cancelled','suppressed'].includes(incoming.status))continue;
    if(this.db.prepare('SELECT 1 FROM service_jobs WHERE dedupe=?').get(incoming.dedupe))continue;
    this.putJob({...incoming,attempts:0,reason:'',providerId:'',createdAt:this.now(),sentAt:0});
   }
  }).immediate();return this.changes();
 }
 changes(){return {optouts:this.db.prepare('SELECT phone,revision,at FROM service_optouts').all() as {phone:string;revision:number;at:number}[],jobs:this.jobs(),links:this.links(),events:(this.db.prepare('SELECT payload FROM verified_events WHERE acknowledged=0 ORDER BY rowid').all() as {payload:string}[]).map(r=>JSON.parse(r.payload) as VerifiedEvent),attempts:this.db.prepare('SELECT id,job_id AS jobId,outcome,at FROM service_attempts ORDER BY rowid').all() as {id:string;jobId:string;outcome:string;at:number}[],settlements:this.db.prepare('SELECT payment_id AS paymentId,status,at FROM settlement_observations').all() as {paymentId:string;status:string;at:number}[]};}
 optOut(phone:string,eventId?:string){if(eventId&&this.db.prepare('SELECT 1 FROM webhook_event_log WHERE id=?').get(`stop:${eventId}`))return;if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new IntegrationError('INTEGRATION_INVALID');const revision=Math.max(0,...this.snapshot().data.consents.filter(c=>c.phone===phone).map(c=>c.revision));this.db.transaction(()=>{this.db.prepare('INSERT INTO service_optouts VALUES(?,?,?) ON CONFLICT(phone) DO UPDATE SET revision=MAX(revision,excluded.revision),at=excluded.at').run(phone,revision,this.now());if(eventId)this.db.prepare('INSERT INTO webhook_event_log VALUES(?,?,?,?)').run(`stop:${eventId}`,digest(phone),'optout',this.now());for(const job of this.jobs())if(job.phone===phone&&['approval','queued','retry'].includes(job.status))this.putJob({...job,status:'suppressed',reason:'consent'});})();}
 runSchedules(){
  // The hosted worker prepares batches independently. Each batch still requires
  // staff approval; enabling a schedule never grants blanket sending consent.
  const {data,updated_at}=this.snapshot();if(this.now()-updated_at>86400000)return {created:0};
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(this.now());let created=0;
  this.db.transaction(()=>{for(const schedule of data.schedules.filter(s=>s.enabled)){
   const template=data.templates.find(t=>t.id===schedule.templateId&&t.kind==='reminder'&&t.approvedDemo);if(!template)continue;
   for(const consent of data.consents.filter(c=>c.effective&&c.reminders&&c.language===template.language&&(!schedule.wardId||c.wardId===schedule.wardId))){
    const account=data.accounts.find(a=>a.familyId===consent.familyId&&a.categoryId==='*');if(!account?.dues.length)continue;
    const due=schedule.rule==='monthly'?Number(today.slice(8))===schedule.day:account.dues.some(d=>{const date=new Date(`${d.dueDate}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+(schedule.rule==='before'?-3:schedule.rule==='after'?7:0));return date.toISOString().slice(0,10)===today;});if(!due)continue;
    const dedupe=digest(JSON.stringify([consent.familyId,'reminder',today.slice(0,7),template.id]));if(this.db.prepare('SELECT 1 FROM service_jobs WHERE dedupe=?').get(dedupe))continue;
    const link=this.links().find(l=>l.familyId===consent.familyId&&l.status==='active');const values:Record<string,string>={mosque:template.language==='ml'?data.mosque.nameMl||data.mosque.name:data.mosque.name,amount:(account.dues.reduce((n,d)=>n+d.amountPaise,0)/100).toFixed(2),period:today.slice(0,7),payment_link:link?.url??(template.language==='ml'?'പള്ളിയുമായി ബന്ധപ്പെടുക.':'Contact the mosque for payment options.')};
    const job:RemoteJob={id:notificationId(dedupe),familyId:consent.familyId,kind:'reminder',templateId:template.id,language:template.language,phone:consent.phone,body:template.body.replace(/\{\{(.*?)\}\}/g,(_,key:string)=>values[key]??''),consentRevision:consent.revision,dueHash:account.hash,receiptId:'',dedupe,status:'approval',nextAt:this.now(),attempts:0,reason:'Scheduled batch requires approval',providerId:'',createdAt:this.now(),sentAt:0};if(this.eligible(job))continue;this.putJob(job);created++;
   }
  }}).immediate();return {created};
 }
 private eligible(job:RemoteJob){const {data,updated_at}=this.snapshot();if(this.now()-updated_at>24*3600000)return 'staleSnapshot';const consent=data.consents.find(c=>c.familyId===job.familyId);const optout=this.db.prepare('SELECT revision FROM service_optouts WHERE phone=?').get(job.phone) as {revision:number}|undefined;if(optout&&(!consent||consent.revision<=optout.revision))return 'consent';if(!consent?.effective||consent.revision!==job.consentRevision||consent.phone!==job.phone||!(job.kind==='receipt'?consent.receipts:consent.reminders))return 'consent';
  const template=data.templates.find(t=>t.id===job.templateId);if(!template?.approvedDemo||template.kind!==job.kind||template.language!==job.language)return 'template';
  if(job.kind==='reminder'){
   const accounts=data.accounts.filter(a=>a.familyId===job.familyId);const amount=accounts.flatMap(a=>a.dues).reduce((s,d)=>s+d.amountPaise,0);if(!amount||!accounts.some(a=>a.hash===job.dueHash))return 'paidOrChanged';
   const captured=this.links().some(l=>l.familyId===job.familyId&&this.db.prepare("SELECT 1 FROM verified_events WHERE payment_id=? AND kind='capture' AND acknowledged=0").get(l.paymentId));if(captured)return 'paidOrChanged';
   const urls=job.body.match(/https:\/\/[^\s]+/g)??[];if(urls.some(url=>this.links().some(l=>l.url===url&&(l.status!=='active'||l.expiresAt<=this.now()))))return 'expiredLink';
   if(this.jobs().some(j=>j.id!==job.id&&j.familyId===job.familyId&&j.kind==='reminder'&&j.sentAt&&j.sentAt>this.now()-data.config.minHours*3600000))return 'frequency';
  }
  return '';
 }
 async dispatch(){if(this.dispatching)return;this.dispatching=true;try{const {data}=this.snapshot();if(quietNow(this.now(),data.config.quietStart,data.config.quietEnd))return;const recent=this.db.prepare('SELECT COUNT(*) AS n FROM service_attempts WHERE at>?').get(this.now()-60000) as {n:number};let available=Math.max(0,data.config.perMinute-recent.n);
  for(const job of this.jobs()){if(!available||!['queued','retry'].includes(job.status)||job.nextAt>this.now())continue;const reason=this.eligible(job);if(reason){if(reason==='staleSnapshot')continue;this.putJob({...job,status:'suppressed',reason});continue;}
   const claimed=this.db.prepare('UPDATE service_jobs SET payload=? WHERE id=? AND payload=?').run(JSON.stringify({...job,status:'sending',attempts:job.attempts+1}),job.id,JSON.stringify(job));if(!claimed.changes)continue;available--;let status:NotificationJob['status']='sent',outcome='accepted',providerId='',nextAt=0;
   try{let body=job.body;if(job.kind==='receipt'&&body.includes('{{receipt_link}}')){if(!this.receiptBaseUrl)throw new DispatchError('rejected');const {token}=this.receiptToken(job.receiptId);body=body.replaceAll('{{receipt_link}}',`${this.receiptBaseUrl}/receipt?token=${encodeURIComponent(token)}`);}providerId=(await this.providers.messages.send({jobId:job.id,phone:job.phone,template:job.templateId,language:job.language,body})).id;}
   catch(e){outcome=e instanceof DispatchError?e.outcome:'uncertain';status=outcome==='rate_limit'&&job.attempts<4?'retry':outcome==='uncertain'?'uncertain':'failed';nextAt=this.now()+Math.min(3600000,60000*2**job.attempts);}
   this.db.transaction(()=>{this.putJob({...job,status,attempts:job.attempts+1,reason:outcome,providerId,nextAt,sentAt:status==='sent'?this.now():0});this.db.prepare('INSERT INTO service_attempts VALUES(?,?,?,?)').run(randomUUID(),job.id,outcome,this.now());})();
  }
 }finally{this.dispatching=false;}}
 async createLink(input:unknown){const d=serviceLinkSchema.parse(input);const prior=this.links().find(l=>l.key===d.key);if(prior){if(prior.familyId!==d.familyId||prior.categoryId!==d.categoryId)throw new IntegrationError('INTEGRATION_CONFLICT');return prior;}
  const {data,updated_at}=this.snapshot();if(this.now()-updated_at>24*3600000)throw new IntegrationError('INTEGRATION_STALE');const account=data.accounts.find(a=>a.familyId===d.familyId&&a.categoryId===d.categoryId);if(!account)throw new IntegrationError('INTEGRATION_INVALID');const amountPaise=account.dues.reduce((s,d)=>s+d.amountPaise,0);if(!amountPaise||amountPaise>100000000000)throw new IntegrationError('INTEGRATION_INVALID');
  const duplicate=this.links().find(l=>l.familyId===d.familyId&&l.categoryId===d.categoryId&&['active','unknown','paid'].includes(l.status)&&l.dueHash===account.hash);if(duplicate)return duplicate;
  const id=randomUUID();const expiresAt=this.now()+d.expiryHours*3600000;const pending:LinkRecord={id,key:d.key,familyId:d.familyId,familyCode:'',categoryId:d.categoryId,amountPaise,dueIds:account.dues.map(v=>v.id),dueHash:account.hash,url:'',expiresAt,status:'unknown',providerId:'',paymentId:'',settlement:'not_verified'};this.putLink(pending);
  // Persist uncertainty before the network request. Do not create a second link
  // automatically when a provider response is lost.
  const external=await this.providers.payments.createLink({reference:id,amountPaise,expiresAt});const link={...pending,providerId:external.id,url:external.url,status:'active' as const};this.putLink(link);return link;
 }
 async cancelLink(id:string){const link=this.links().find(l=>l.id===id);if(!link||link.status!=='active')throw new IntegrationError('INTEGRATION_STATE');await this.providers.payments.cancelLink(link.providerId);this.putLink({...link,status:'cancelled'});}
 async webhook(raw:Buffer,signature:string){if(!verifySignature(raw,signature,this.webhookSecret))throw new IntegrationError('INTEGRATION_SIGNATURE');const event=serviceWebhookSchema.parse(JSON.parse(raw.toString('utf8')));if(event.createdAt>this.now()+300000)throw new IntegrationError('INTEGRATION_INVALID');
  const existing=this.db.prepare('SELECT digest FROM webhook_event_log WHERE id=?').get(event.eventId) as {digest:string}|undefined;if(existing){if(existing.digest!==digest(raw.toString('utf8')))throw new IntegrationError('INTEGRATION_CONFLICT');throw new IntegrationError('INTEGRATION_REPLAY');}
  const link=this.links().find(l=>l.id===event.linkId);if(!link)throw new IntegrationError('INTEGRATION_INVALID');const payment=await this.providers.payments.payment(event.paymentId,link.providerId);if(!['captured','refunded'].includes(payment.status)||payment.currency!=='INR'||payment.amountPaise!==link.amountPaise||payment.id!==event.paymentId)throw new IntegrationError('INTEGRATION_INVALID');
  let amountPaise=payment.amountPaise;let createdAt=payment.createdAt;
  if(event.event==='refund'){const refund=await this.providers.payments.fetchRefund(event.refundId);if(refund.id!==event.refundId||refund.paymentId!==payment.id||refund.status!=='processed')throw new IntegrationError('INTEGRATION_INVALID');amountPaise=refund.amountPaise;createdAt=refund.createdAt;}
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(createdAt);
  this.db.transaction(()=>{const insert=(value:VerifiedEvent)=>this.db.prepare('INSERT OR IGNORE INTO verified_events(id,payment_id,refund_id,kind,payload) VALUES(?,?,?,?,?)').run(value.id,value.paymentId,value.refundId,value.kind,JSON.stringify(value));
   // Refunds can arrive before the capture webhook. Persist the authoritative
   // capture first so desktop reconciliation always has the original posting.
   insert({id:`capture:${payment.id}`,kind:'capture',linkId:link.id,paymentId:payment.id,refundId:'',amountPaise:payment.amountPaise,date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(payment.createdAt),createdAt:payment.createdAt});
   if(event.event==='refund'){const refunded=(this.db.prepare("SELECT COALESCE(SUM(json_extract(payload,'$.amountPaise')),0) AS n FROM verified_events WHERE payment_id=? AND kind='refund' AND refund_id!=?").get(payment.id,event.refundId) as {n:number}).n;if(!Number.isSafeInteger(amountPaise)||amountPaise<=0||refunded+amountPaise>payment.amountPaise)throw new IntegrationError('INTEGRATION_INVALID');insert({id:`refund:${event.refundId}`,kind:'refund',linkId:link.id,paymentId:payment.id,refundId:event.refundId,amountPaise,date,createdAt});}
   this.putLink({...link,status:'paid',paymentId:payment.id});this.db.prepare('INSERT INTO webhook_event_log VALUES(?,?,?,?)').run(event.eventId,digest(raw.toString('utf8')),event.event,this.now());
  }).immediate();
 }
 acknowledge(input:unknown){const d=serviceAckSchema.parse(input);const row=this.db.prepare('SELECT acknowledged,transaction_id,receipt_id FROM verified_events WHERE id=?').get(d.eventId) as {acknowledged:number;transaction_id:string;receipt_id:string}|undefined;if(!row)throw new IntegrationError('INTEGRATION_INVALID');if(row.acknowledged&&(row.transaction_id!==d.transactionId||row.receipt_id!==d.receiptId))throw new IntegrationError('INTEGRATION_CONFLICT');this.db.transaction(()=>{this.db.prepare('UPDATE verified_events SET acknowledged=1,transaction_id=?,receipt_id=? WHERE id=?').run(d.transactionId,d.receiptId,d.eventId);if(d.receipt&&d.receiptId)this.db.prepare('INSERT OR IGNORE INTO service_receipts VALUES(?,?)').run(d.receiptId,JSON.stringify(d.receipt));})();}
 receiptToken(receiptId:string){if(!this.db.prepare('SELECT 1 FROM service_receipts WHERE id=?').get(receiptId))throw new IntegrationError('INTEGRATION_INVALID');const token=randomBytes(32).toString('base64url');const expiresAt=this.now()+600000;this.db.prepare('INSERT INTO receipt_tokens VALUES(?,?,?)').run(digest(token),receiptId,expiresAt);return {token,expiresAt};}
 receipt(token:string){const row=this.db.prepare('SELECT r.payload FROM receipt_tokens t JOIN service_receipts r ON r.id=t.receipt_id WHERE t.hash=? AND t.expires_at>?').get(digest(token),this.now()) as {payload:string}|undefined;if(!row)throw new IntegrationError('INTEGRATION_AUTH');return JSON.parse(row.payload) as NonNullable<ReturnType<typeof serviceAckSchema.parse>['receipt']>;}
 async refund(input:unknown){const d=serviceRefundSchema.parse(input);const previous=this.db.prepare('SELECT * FROM refund_requests WHERE id=?').get(d.key) as {payment_id:string;amount_paise:number;status:string;refund_id:string}|undefined;if(previous){if(previous.payment_id!==d.paymentId||previous.amount_paise!==d.amountPaise)throw new IntegrationError('INTEGRATION_CONFLICT');if(previous.status==='processed')return this.providers.payments.fetchRefund(previous.refund_id);throw new IntegrationError('INTEGRATION_STATE');}
  const link=this.links().find(l=>l.paymentId===d.paymentId);if(!link)throw new IntegrationError('INTEGRATION_INVALID');const reserved=(this.db.prepare('SELECT COALESCE(SUM(amount_paise),0) AS n FROM refund_requests WHERE payment_id=?').get(d.paymentId) as {n:number}).n;if(reserved+d.amountPaise>link.amountPaise)throw new IntegrationError('INTEGRATION_INVALID');this.db.prepare('INSERT INTO refund_requests(id,payment_id,amount_paise,status) VALUES(?,?,?,?)').run(d.key,d.paymentId,d.amountPaise,'unknown');const refund=await this.providers.payments.refund(d.key,d.paymentId,d.amountPaise);this.db.prepare('UPDATE refund_requests SET status=?,refund_id=? WHERE id=?').run(refund.status,refund.id,d.key);return refund;
 }
 deliveryWebhook(raw:Buffer,signature:string){if(!verifySignature(raw,signature.replace(/^sha256=/,''),this.webhookSecret))throw new IntegrationError('INTEGRATION_SIGNATURE');const data=JSON.parse(raw.toString('utf8')) as {id?:unknown;status?:unknown};if(typeof data.id!=='string'||!['sent','delivered','failed'].includes(String(data.status)))throw new IntegrationError('INTEGRATION_INVALID');const job=this.jobs().find(j=>j.providerId===data.id);if(!job)throw new IntegrationError('INTEGRATION_INVALID');const hash=digest(raw.toString('utf8'));if(this.db.prepare('SELECT 1 FROM webhook_event_log WHERE id=?').get(hash))throw new IntegrationError('INTEGRATION_REPLAY');this.db.transaction(()=>{this.db.prepare('INSERT INTO webhook_event_log VALUES(?,?,?,?)').run(hash,hash,'delivery',this.now());if(job.status!=='delivered')this.putJob({...job,status:data.status==='delivered'?'delivered':data.status==='failed'?'failed':job.status});})();}
 observeMockSettlement(paymentId:string){if(!this.links().some(l=>l.paymentId===paymentId))throw new IntegrationError('INTEGRATION_INVALID');this.db.prepare('INSERT INTO settlement_observations VALUES(?,?,?) ON CONFLICT(payment_id) DO UPDATE SET status=excluded.status,at=excluded.at').run(paymentId,'mock_settled',this.now());}
}
