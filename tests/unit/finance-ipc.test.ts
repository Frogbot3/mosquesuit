import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import type { BrowserWindow } from 'electron';
const handlers=vi.hoisted(()=>new Map<string,(event:unknown,input:unknown)=>Promise<unknown>>());
vi.mock('electron',()=>({ipcMain:{handle:vi.fn((channel,handler)=>handlers.set(channel,handler))}}));
vi.mock('../../electron/finance-output',()=>({chooseFinanceLogo:vi.fn(),outputFinance:vi.fn(),backupFinance:vi.fn()}));
import { registerFinanceIpc } from '../../electron/finance-ipc';
import { WorkspaceStore } from '../../electron/database/store';
import { FINANCE_CHANNELS as C } from '../../shared/finance-channels';
const stores:WorkspaceStore[]=[];
beforeEach(()=>handlers.clear());afterEach(()=>stores.splice(0).forEach(s=>s.close()));
function fixture(enabled:boolean){const store=new WorkspaceStore(':memory:',false,enabled);stores.push(store);const frame={url:'app://mosque/index.html'};const contents={mainFrame:frame};const event={sender:contents,senderFrame:frame};registerFinanceIpc({webContents:contents} as unknown as BrowserWindow,store,false,'unused');return {store,event};}
describe('financial IPC boundary',()=>{
  it('denies every finance endpoint in ordinary workspaces',async()=>{const {event}=fixture(false);expect(handlers.size).toBe(25);for(const handler of handlers.values())expect(await handler(event,{})).toMatchObject({ok:false,error:{code:'FINANCE_DEMO_ONLY'}});});
  it('rejects other windows, subframes, forged roles and arbitrary filesystem fields',async()=>{const {event}=fixture(true);const setup=handlers.get(C.getFinanceSetup)!;expect(await setup({...event,sender:{}},{})).toMatchObject({ok:false,error:{code:'FORBIDDEN'}});expect(await setup({...event,senderFrame:{url:'app://mosque/index.html'}},{})).toMatchObject({ok:false,error:{code:'FORBIDDEN'}});expect(await setup(event,{sql:'SELECT * FROM payments'})).toMatchObject({ok:false,error:{code:'VALIDATION'}});expect(await handlers.get(C.backupFinance)!(event,{path:'C:\\untrusted.sqlite3'})).toMatchObject({ok:false,error:{code:'VALIDATION'}});expect(await handlers.get(C.setFinanceDemoRole)!(event,{role:'administrator',session:'forged'})).toMatchObject({ok:false,error:{code:'VALIDATION'}});});
});
