import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { IntegrationError,type IntegrationErrorCode } from '../shared/integrations';
import { IntegrationService } from '../service/engine';
import { MockProviders } from '../service/mock-providers';
import { startIntegrationServer } from '../service/server';
export interface IntegrationClient {url:string;call<T>(path:string,input?:unknown,admin?:boolean):Promise<T>;close():Promise<void>}
export async function createMockIntegrationClient(filename:string,workspaceId:string):Promise<IntegrationClient>{
 const db=new Database(filename);const mock=new MockProviders(db);const webhookSecret=randomBytes(32).toString('hex');const deviceToken=randomBytes(32).toString('hex');const adminToken=randomBytes(32).toString('hex');const engine=new IntegrationService(db,workspaceId,{payments:mock,messages:mock},webhookSecret);const server=await startIntegrationServer({engine,mock,deviceToken,adminToken,webhookSecret});
 return {url:server.url,async call<T>(path:string,input:unknown={},admin=false){let response:Response;try{response=await fetch(`${server.url}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${admin?adminToken:deviceToken}`},body:JSON.stringify(input),signal:AbortSignal.timeout(20000),redirect:'error'});}catch{throw new IntegrationError('INTEGRATION_OFFLINE');}const result=await response.json() as {ok:boolean;data:T;code?:IntegrationErrorCode};if(!result.ok)throw new IntegrationError(result.code??'INTEGRATION_STATE');return result.data;},async close(){await server.close();db.close();}};
}
