import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { BrowserWindow } from 'electron';
const handlers=vi.hoisted(()=>new Map<string,(event:unknown,input:unknown)=>Promise<unknown>>());
vi.mock('electron',()=>({ipcMain:{handle:vi.fn((channel,handler)=>handlers.set(channel,handler))}}));
import { registerIntegrationsIpc } from '../../electron/integrations-ipc';
import { WorkspaceStore } from '../../electron/database/store';
import { integrationChannels as C } from '../../shared/integrations';
const stores:WorkspaceStore[]=[];
beforeEach(()=>handlers.clear());afterEach(()=>stores.splice(0).forEach(s=>s.close()));
function fixture(enabled:boolean){const store=new WorkspaceStore(':memory:',true,true,enabled);stores.push(store);const frame={url:'app://mosque/index.html'};const contents={mainFrame:frame};const event={sender:contents,senderFrame:frame};registerIntegrationsIpc({webContents:contents} as unknown as BrowserWindow,store,false);return {store,event};}
describe('integration IPC boundary',()=>{
 it('denies all 16 methods outside the integration profile',async()=>{const {event}=fixture(false);expect(handlers.size).toBe(16);for(const handle of handlers.values())expect(await handle(event,{})).toMatchObject({ok:false,error:{code:'INTEGRATION_DEMO_ONLY'}});});
 it('rejects untrusted windows, subframes, renderer credentials and forged approval fields',async()=>{const {event}=fixture(true);const state=handlers.get(C.getIntegrationState)!;expect(await state({...event,sender:{}},{})).toMatchObject({ok:false,error:{code:'FORBIDDEN'}});expect(await state({...event,senderFrame:{url:'https://attacker.invalid'}},{})).toMatchObject({ok:false,error:{code:'FORBIDDEN'}});expect(await state(event,{sql:'SELECT secrets'})).toMatchObject({ok:false,error:{code:'VALIDATION'}});expect(await handlers.get(C.setIntegrationMock)!(event,{connected:true,nextSend:'success',token:'forged'})).toMatchObject({ok:false,error:{code:'VALIDATION'}});});
});
