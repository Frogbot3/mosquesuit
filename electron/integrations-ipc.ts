import { authorizeIpc } from './ipc-authorization';
import { SecurityError } from '../shared/security';
import { ipcMain,type BrowserWindow } from 'electron';
import { z } from 'zod';
import { emptyRequest,type Result } from '../shared/contracts';
import { integrationChannels as C,consentSchema,templateSchema,previewSchema,queueSchema,jobsDecisionSchema,scheduleSchema,integrationConfigSchema,mockConfigSchema,linkSchema,simulateSchema,refundOnlineSchema,resolveOnlineSchema,integrationId,IntegrationError } from '../shared/integrations';
import { FinanceError } from '../shared/finance';
import type { WorkspaceStore } from './database/store';
import { isTrustedDocument } from './security';
export function registerIntegrationsIpc(window:BrowserWindow,store:WorkspaceStore,development:boolean){
 function handle<S extends z.ZodType,T>(channel:string,schema:S,run:(d:z.output<S>)=>T|Promise<T>){ipcMain.handle(channel,async(event,input:unknown):Promise<Result<T>>=>{if(event.sender!==window.webContents||!event.senderFrame||event.senderFrame!==event.sender.mainFrame||!isTrustedDocument(event.senderFrame.url,development))return {ok:false,error:{code:'FORBIDDEN',message:'Request denied.'}};try{store.integrations.require();const d=schema.safeParse(input);if(!d.success)return {ok:false,error:{code:'VALIDATION',message:'Check the supplied fields.'}};authorizeIpc(store.security,channel,d.data);return {ok:true,data:await store.security.operation(()=>run(d.data))};}catch(e){return {ok:false,error:{code:e instanceof SecurityError||e instanceof IntegrationError||e instanceof FinanceError?e.code:'STORAGE',message:'The integration operation could not be completed.'}};}});}
 const s=store.integrations;
 handle(C.getIntegrationState,emptyRequest,()=>s.state());handle(C.saveMessagingConsent,consentSchema,d=>s.saveConsent(d));handle(C.saveNotificationTemplate,templateSchema,d=>s.saveTemplate(d));handle(C.previewNotifications,previewSchema,d=>s.preview(d));handle(C.queueNotifications,queueSchema,d=>s.queue(d));handle(C.decideNotifications,jobsDecisionSchema,d=>s.decide(d));handle(C.saveReminderSchedule,scheduleSchema,d=>s.saveSchedule(d));handle(C.runReminderSchedules,emptyRequest,()=>s.runSchedules());handle(C.saveIntegrationConfig,integrationConfigSchema,d=>s.saveConfig(d));handle(C.setIntegrationMock,mockConfigSchema,d=>s.configureMock(d));handle(C.syncIntegrations,emptyRequest,()=>s.sync());handle(C.createOnlinePaymentLink,linkSchema,d=>s.createLink(d));handle(C.cancelOnlinePaymentLink,integrationId,d=>s.cancelLink(d.id));handle(C.simulateIntegrationEvent,simulateSchema,d=>s.simulate(d));handle(C.requestOnlineRefund,refundOnlineSchema,d=>s.refund(d));handle(C.resolveOnlineConflict,resolveOnlineSchema,d=>s.resolve(d));
}
