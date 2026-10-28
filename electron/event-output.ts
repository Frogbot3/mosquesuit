import { BrowserWindow, dialog, type BrowserWindow as Window } from 'electron';
import { open, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { lifeText } from '../shared/life-labels';
import { LifeEventError, type EventRecord } from '../shared/life-events';
import type { Settings } from '../shared/contracts';
import type { WorkspaceStore } from './database/store';

export const printDocuments = new Map<string,string>();
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function eventPaper(event: EventRecord, settings: Settings, css: string): string {
  const t = (key: string) => `${lifeText('en',key)} / ${lifeText('ml',key)}`;
  const field = (key: string, value: unknown) => `<div class="paper-field"><dt>${escape(t(key==='marriageNumber'?'marriageId':key))}</dt><dd>${escape(value || t('empty'))}</dd></div>`;
  const optionalField = (key: string, value: unknown) => String(value ?? '').trim() ? field(key,value) : '';
  const person = (label: string, p: NonNullable<EventRecord['member']>) => `<section><h2>${escape(t(label))}</h2><dl>${optionalField('name',p.name)}${optionalField('nameMl',p.nameMl)}${field('memberId',p.memberId || t('external'))}${optionalField('family',p.familyCode)}${optionalField('ward',`${p.ward} ${p.wardMl}`.trim())}${optionalField('house',`${p.house} ${p.houseMl}`.trim())}${optionalField('phone',p.phone)}${optionalField('guardian',p.guardian)}</dl></section>`;
  const detailKeys: (keyof EventRecord)[] = event.kind === 'marriage' ? ['guardianInfo','officiant','venue','mahr'] : event.kind === 'divorce' ? ['marriageNumber','categoryName','categoryNameMl'] : ['place','burialDate','burialLocation','informant','informantPhone','documentReferences'];
  const details = detailKeys.map(key=>optionalField(key,event[key])).join('') + optionalField('remarks',event.remarks);
  const witnesses = event.witnesses.length ? `<section><h2>${escape(t('witnesses'))}</h2>${event.witnesses.map(w=>`<p>${escape(w.name)} · ${escape(w.phone)}</p>`).join('')}</section>` : '';
  const documents = event.documents.length ? `<section><h2>${escape(t('documents'))}</h2>${event.documents.map(d=>`<p>${escape(d.name)}</p>`).join('')}</section>` : '';
  return `<!doctype html><html class="event-paper-root" lang="${settings.locale}"><head><meta charset="utf-8"><title>${escape(event.number)}</title><link rel="stylesheet" href="${escape(css)}"></head><body class="event-paper"><header><p class="paper-demo">${escape(t('fictional'))}</p><h1>${escape(settings.name)}<br><span lang="ml">${escape(settings.nameMl)}</span></h1><p>${escape(settings.address)}</p><h2>${escape(t(event.kind))}</h2><p>${escape(t('mosqueRecord'))}</p></header><dl>${field('number',event.number)}${field('status',t(event.status))}${field('eventDate',event.eventDate)}${field('registrationDate',event.registrationDate)}</dl>${event.member ? person('member',event.member) : event.parties.map((p,i)=>person(event.kind === 'marriage' ? i ? 'bride':'groom' : i ? 'wife':'husband',p)).join('')}${details ? `<section><dl>${details}</dl></section>` : ''}${witnesses}${documents}<footer><p>${escape(t('administrative'))}</p><p>${escape(t('notGovernment'))}</p><p>${escape(t('fictional'))}</p></footer></body></html>`;
}
export async function attachDocument(window: Window, store: WorkspaceStore, request: {id:string;revision:number}) {
  store.lifeEvents.requireDemo(); const existing = store.lifeEvents.get({id:request.id}); if(existing.revision!==request.revision) throw new LifeEventError('EVENT_STALE');
  const choice = await dialog.showOpenDialog(window,{title:lifeText(store.getSettings().locale,'attach'),properties:['openFile'],filters:[{name:'PDF / PNG / JPEG',extensions:['pdf','png','jpg','jpeg']}]});
  if(choice.canceled || !choice.filePaths[0]) return null;
  const path = choice.filePaths[0]; const file = await open(path,'r');
  try {
    const info = await file.stat(); if(!info.isFile() || info.size>10485760) throw new LifeEventError('DOCUMENT_INVALID');
    // Cap the read even if a selected file grows after its size check.
    const buffer=Buffer.alloc(10485761); let size=0;
    while(size<buffer.length) {const read=await file.read(buffer,size,buffer.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
    return store.lifeEvents.addDocument(request,basename(path),buffer.subarray(0,size));
  } finally {await file.close();}
}
export async function exportDocument(window: Window, store: WorkspaceStore, request: {id:string}) {
  const document = store.lifeEvents.document(request);
  const choice = await dialog.showSaveDialog(window,{title:lifeText(store.getSettings().locale,'exportDocument'),defaultPath:document.name});
  if(choice.canceled || !choice.filePath) return false; await writeFile(choice.filePath,document.content); return true;
}
export async function outputEvent(window: Window, store: WorkspaceStore, rendererRoot: string, request: {id:string;revision:number;format:'pdf'|'print'}) {
  store.lifeEvents.requireDemo(); const event = store.lifeEvents.get({id:request.id}); if(event.revision!==request.revision) throw new LifeEventError('EVENT_STALE');
  const css = (await readdir(join(rendererRoot,'assets'))).find(file=>/^index-.*\.css$/.test(file)); if(!css) throw new Error('Build assets required');
  let destination: string | undefined;
  if(request.format==='pdf') { const result = await dialog.showSaveDialog(window,{title:lifeText(store.getSettings().locale,'savePdf'),defaultPath:`Demo-${event.kind}-${event.number.replace(/[^A-Za-z0-9-]/g,'-')}.pdf`,filters:[{name:'PDF',extensions:['pdf']}]}); if(result.canceled || !result.filePath) return false; destination=result.filePath; }
  const token = `/print/${randomUUID()}`; printDocuments.set(token,eventPaper(event,store.getSettings(),`app://mosque/assets/${css}`));
  const paper = new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,devTools:false}});
  paper.webContents.setWindowOpenHandler(()=>({action:'deny'})); paper.webContents.on('will-navigate',event=>event.preventDefault());
  try {
    await paper.loadURL(`app://mosque${token}`); await paper.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    if(destination) { const pdf = await paper.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true}); await writeFile(destination,pdf); }
    else await new Promise<void>((resolve,reject)=>paper.webContents.print({silent:false,printBackground:true},(success,reason)=>success?resolve():reject(new Error(reason))));
    return true;
  } finally { printDocuments.delete(token); paper.destroy(); }
}
