import { authorizeIpc } from './ipc-authorization';
import { SecurityError } from '../shared/security';
import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { CHANNELS } from '../shared/channels';
import { emptyRequest, type Result } from '../shared/contracts';
import { categorySchema,eventDraftSchema,eventQuerySchema,eventRequestSchema,eventRevisionSchema,eventTransitionSchema,transferSchema,LifeEventError } from '../shared/life-events';
import type { WorkspaceStore } from './database/store';
import { isTrustedDocument } from './security';
import { attachDocument,exportDocument,outputEvent } from './event-output';

export function registerLifeEventsIpc(window: BrowserWindow,store:WorkspaceStore,development:boolean,rendererRoot:string) {
  function handle<S extends z.ZodType,T>(channel:string,schema:S,action:(input:z.output<S>)=>T|Promise<T>) {
    ipcMain.handle(channel,async(event,input:unknown):Promise<Result<T>>=>{
      if(event.sender!==window.webContents || !event.senderFrame || event.senderFrame!==event.sender.mainFrame || !isTrustedDocument(event.senderFrame.url,development)) return {ok:false,error:{code:'FORBIDDEN',message:'Request denied.'}};
      try { store.lifeEvents.requireDemo(); const parsed=schema.safeParse(input); if(!parsed.success) return {ok:false,error:{code:'VALIDATION',message:'Check the supplied fields.'}}; authorizeIpc(store.security,channel,parsed.data);return {ok:true,data:await store.security.operation(()=>action(parsed.data))}; }
      catch(error) { return {ok:false,error:{code:error instanceof SecurityError||error instanceof LifeEventError?error.code:'STORAGE',message:'The operation could not be completed.'}}; }
    });
  }
  handle(CHANNELS.events,eventQuerySchema,input=>store.lifeEvents.list(input));
  handle(CHANNELS.event,eventRequestSchema,input=>store.lifeEvents.get(input));
  handle(CHANNELS.saveEvent,eventDraftSchema,input=>store.lifeEvents.save(input));
  handle(CHANNELS.transitionEvent,eventTransitionSchema,input=>store.lifeEvents.transition(input));
  handle(CHANNELS.categories,emptyRequest,()=>store.lifeEvents.categories());
  handle(CHANNELS.saveCategory,categorySchema,input=>store.lifeEvents.saveCategory(input));
  handle(CHANNELS.transfer,transferSchema,input=>store.lifeEvents.transfer(input));
  handle(CHANNELS.transfers,z.object({familyId:z.uuid()}).strict(),input=>store.lifeEvents.transfers(input.familyId));
  handle(CHANNELS.attachDocument,eventRevisionSchema,input=>attachDocument(window,store,input));
  handle(CHANNELS.exportDocument,eventRequestSchema,input=>exportDocument(window,store,input));
  handle(CHANNELS.outputEvent,eventRevisionSchema.extend({format:z.enum(['pdf','print'])}).strict(),input=>outputEvent(window,store,rendererRoot,input));
}
