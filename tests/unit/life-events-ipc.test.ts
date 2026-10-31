import { describe,it,expect,vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { WorkspaceStore } from '../fixtures/authenticated-store';
import { CHANNELS } from '../../shared/channels';
const handlers=vi.hoisted(()=>new Map<string,(event:unknown,input:unknown)=>Promise<unknown>>());
vi.mock('electron',()=>({ipcMain:{handle:(channel:string,handler:(event:unknown,input:unknown)=>Promise<unknown>)=>handlers.set(channel,handler)}}));
import { registerLifeEventsIpc } from '../../electron/life-events-ipc';
describe('life-event IPC privacy boundary',()=>{
  it('denies normal workspace access before validation and rejects foreign senders and subframes',async()=>{
    const store=new WorkspaceStore(':memory:');const frame={url:'app://mosque/index.html'};const contents={mainFrame:frame};
    try{registerLifeEventsIpc({webContents:contents} as unknown as BrowserWindow,store,false,'unused');for(const handler of handlers.values())expect(await handler({sender:contents,senderFrame:frame},{})).toMatchObject({ok:false,error:{code:'DEMO_ONLY'}});expect(await handlers.get(CHANNELS.events)!({sender:{},senderFrame:frame},{})).toMatchObject({ok:false,error:{code:'FORBIDDEN'}});expect(await handlers.get(CHANNELS.events)!({sender:contents,senderFrame:{url:frame.url}},{})).toMatchObject({ok:false,error:{code:'FORBIDDEN'}});}finally{store.close();}
  });
  it('rejects unrecognized file paths, roles and transition fields even in the demo',async()=>{
    const store=new WorkspaceStore(':memory:',true);const frame={url:'app://mosque/index.html'};const contents={mainFrame:frame};const event={sender:contents,senderFrame:frame};
    try{registerLifeEventsIpc({webContents:contents} as unknown as BrowserWindow,store,false,'unused');for(const channel of [CHANNELS.attachDocument,CHANNELS.outputEvent,CHANNELS.transitionEvent,CHANNELS.saveEvent])expect(await handlers.get(channel)!(event,{path:'C:\\secret',role:'admin',sql:'SELECT *'})).toMatchObject({ok:false,error:{code:'VALIDATION'}});}finally{store.close();}
  });
});
