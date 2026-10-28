import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DispatchError,type PaymentProvider,type MessageProvider,type GatewayPayment,type GatewayRefund } from './providers';
export class MockProviders implements PaymentProvider,MessageProvider {
 nextSend:'success'|'rate_limit'|'uncertain'='success';
 constructor(private readonly db:Database.Database,private readonly now:()=>number=Date.now){db.exec('CREATE TABLE IF NOT EXISTS mock_provider_objects(id TEXT PRIMARY KEY,payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT');}
 private get<T>(id:string):T{const row=this.db.prepare('SELECT payload FROM mock_provider_objects WHERE id=?').get(id) as {payload:string}|undefined;if(!row)throw new Error('Mock object absent');return JSON.parse(row.payload);}
 private put(id:string,payload:unknown){this.db.prepare('INSERT INTO mock_provider_objects VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(id,JSON.stringify(payload));}
 async createLink(d:{reference:string;amountPaise:number;expiresAt:number}){const id=`plink_mock_${d.reference}`;this.put(id,d);return {id,url:`https://payments.invalid/mock/${d.reference}`,status:'created'};}
 async cancelLink(id:string){this.put(`cancel:${id}`,true);}
 capture(linkId:string){const l=this.get<{amountPaise:number}>(linkId);const id=`pay_mock_${randomUUID()}`;const payment={id,linkId,amountPaise:l.amountPaise,currency:'INR',status:'captured',createdAt:this.now()};this.put(id,payment);return payment;}
 async payment(id:string,linkId:string){const p=this.get<GatewayPayment>(id);if(p.linkId!==linkId)throw new Error('Mock link mismatch');return p;}
 async refund(key:string,paymentId:string,amountPaise:number){const id=`rfnd_mock_${key}`;try{return this.get<GatewayRefund>(id);}catch{const value={id,paymentId,amountPaise,status:'processed',createdAt:this.now()};this.put(id,value);return value;}}
 async fetchRefund(id:string){return this.get<GatewayRefund>(id);}
 async send(d:{jobId:string}){const outcome=this.nextSend;this.nextSend='success';if(outcome!=='success')throw new DispatchError(outcome);const id=`wamid.mock.${d.jobId}`;this.put(id,{at:this.now()});return {id};}
}
