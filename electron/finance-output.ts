import { externalDestination } from './secure-files';
import { app,BrowserWindow,dialog,nativeImage,type BrowserWindow as Window } from 'electron';
import { open,readdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { financeText } from '../shared/finance-labels';
import { FinanceError,money,type FinanceOutputRequest,type FinanceReceipt,type FinanceReport } from '../shared/finance';
import type { Settings } from '../shared/contracts';
import type { WorkspaceStore } from './database/store';
import { printDocuments } from './event-output';

export const escapeFinance=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const bilingual=(key:string)=>`${financeText('en',key)} / ${financeText('ml',key)}`;
function paper(title:string,body:string,css:string,layout:string){return `<!doctype html><html class="finance-paper-root" lang="en"><head><meta charset="utf-8"><title>${escapeFinance(title)}</title><link rel="stylesheet" href="${escapeFinance(css)}"></head><body class="finance-paper ${layout}"><p class="finance-paper-demo">${escapeFinance(bilingual('fictional'))}</p>${body}</body></html>`;}
export function receiptPaper(receipt:FinanceReceipt,css:string,layout:'a4'|'compact'):string {
  const s=receipt.snapshot;const e=escapeFinance;const field=(key:string,value:unknown)=>value?`<div><dt>${e(bilingual(key))}</dt><dd>${e(value)}</dd></div>`:'';
  const logo=s.logo?`<img class="finance-paper-logo" src="${e(s.logo)}" alt="${e(bilingual('logo'))}">`:'';
  return paper(receipt.number,`<header>${logo}<h1>${e(s.mosque.name)}<br><span lang="ml">${e(s.mosque.nameMl)}</span></h1><p>${e(s.mosque.address)}</p><p>${e(s.mosque.contact)}</p><h2>${e(bilingual('receipt'))}</h2></header><p class="finance-paper-status">${e(bilingual(receipt.status))}</p><dl>${field('receiptNumber',receipt.number)}${field('date',s.date)}${field('familyCode',s.familyCode)}${field('ward',s.ward)}${field('house',s.house)}${field('guardian',s.guardian)}${field('donor',s.anonymous?bilingual('anonymous'):s.donor)}${field('method',bilingual(s.method))}${field('reference',s.reference)}</dl><table><thead><tr><th>${e(bilingual('category'))}</th><th>${e(bilingual('period'))}</th><th>${e(bilingual('amountPaise'))}</th></tr></thead><tbody>${s.lines.map(l=>`<tr><td>${e(l.category==='advanceCredit'?bilingual(l.category):l.category)}</td><td>${e(l.period)}</td><td>${e(money(l.amountPaise))}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">${e(bilingual('total'))}</th><td>${e(money(s.totalPaise))}</td></tr></tfoot></table><dl>${field('remaining',s.familyCode?money(s.remainingPaise):'')}${field('receivedBy',s.receivedBy)}${field('refundPaise',receipt.refundPaise?money(receipt.refundPaise):'')}</dl><div class="finance-paper-verification"><img src="${e(receipt.qr)}" alt="${e(bilingual('verification'))}"><div><p>${e(bilingual('verification'))}</p><code>${e(receipt.id)}</code><p>${e(bilingual('offlineQr'))}</p></div></div><p class="finance-signature">${e(bilingual('signature'))}: ____________________</p><footer>${e(bilingual('manualNotice'))}</footer>`,css,layout==='compact'?'finance-paper-compact':'finance-paper-a4');
}
export function reportPaper(report:FinanceReport,settings:Settings,css:string):string {
  const e=escapeFinance;const label=report.kind==='monthly'?'monthlyReport':report.kind;
  const cell=(value:string|number|undefined,isMoney=false)=>e(isMoney?money(Number(value??0)):bilingual(String(value??''))===`${value} / ${value}`?value:bilingual(String(value??'')));
  return paper(financeText('en',label),`<header><h1>${e(settings.name)} / ${e(settings.nameMl)}</h1><h2>${e(bilingual(label))}</h2><p>${e(report.filters.from)} — ${e(report.filters.until)}</p>${report.scope.map(s=>`<p>${e(s)}</p>`).join('')}</header><p>${e(bilingual(report.basis))}</p><table><thead><tr>${report.columns.map(c=>`<th>${e(bilingual(c.label))}</th>`).join('')}</tr></thead><tbody>${report.rows.map(r=>`<tr>${report.columns.map(c=>`<td>${cell(r[c.key],c.money)}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr>${report.columns.map((c,i)=>`<th>${i===0?e(bilingual('total')):c.money?cell(report.totals[c.key],true):''}</th>`).join('')}</tr></tfoot></table><footer>${e(bilingual('fictional'))}</footer>`,css,'finance-report-paper');
}
export function financeCsv(report:FinanceReport,locale:Settings['locale']):string {
  const safe=(v:unknown)=>{const value=String(v??'');return `"${(/^[\s]*[=+\-@]/.test(value)?`'${value}`:value).replace(/"/g,'""')}"`;};
  const rows=[report.columns.map(c=>financeText(locale,c.label)),...report.rows.map(r=>report.columns.map(c=>c.money?(Number(r[c.key]??0)/100).toFixed(2):financeText(locale,String(r[c.key]??'')))),report.columns.map((c,i)=>i===0?financeText(locale,'total'):c.money?(report.totals[c.key]/100).toFixed(2):'')];
  return '\uFEFF'+rows.map(r=>r.map(safe).join(',')).join('\r\n');
}
export async function financeWorkbook(report:FinanceReport,locale:Settings['locale']):Promise<Buffer>{
  const workbook=new ExcelJS.Workbook();workbook.creator='Mosque Suite fictional demo';workbook.calcProperties.fullCalcOnLoad=true;
  for(const raw of [false,true]){
    const sheet=workbook.addWorksheet(raw?'Integer paise':'Report');sheet.addRow([financeText(locale,report.kind==='monthly'?'monthlyReport':report.kind),report.filters.from,report.filters.until]);sheet.addRow([financeText(locale,report.basis),...report.scope]);sheet.addRow(report.columns.map(c=>financeText(locale,c.label)+(raw&&c.money?' (paise)':'')));
    for(const row of report.rows)sheet.addRow(report.columns.map(c=>c.money?Number(row[c.key]??0)/(raw?1:100):financeText(locale,String(row[c.key]??''))));
    const end=sheet.rowCount;const totals=sheet.addRow(report.columns.map((c,i)=>i===0?financeText(locale,'total'):c.money?report.totals[c.key]/(raw?1:100):''));
    for(const [i,c] of report.columns.entries()){
      const column=sheet.getColumn(i+1);column.width=c.money?22:30;
      if(c.money){column.numFmt=raw?'#,##0':'"₹"#,##0.00;[Red]-"₹"#,##0.00';const letter=column.letter;if(report.rows.length)totals.getCell(i+1).value={formula:report.kind==='statement'&&['outstandingPaise','creditPaise'].includes(c.key)?`${letter}${end}`:`SUM(${letter}4:${letter}${end})`,result:report.totals[c.key]/(raw?1:100)};}
    }
    sheet.getRow(3).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(3).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF145B43'}};totals.font={bold:true};sheet.views=[{state:'frozen',ySplit:3}];sheet.autoFilter={from:{row:3,column:1},to:{row:Math.max(3,end),column:report.columns.length}};sheet.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
export async function chooseFinanceLogo(window:Window,store:WorkspaceStore,input:{revision:number;remove:boolean}){
  store.security.require('finance.configure');store.finance.require('administrator');if(input.remove)return store.finance.setLogo('',input.revision);
  const picked=await dialog.showOpenDialog(window,{title:financeText(store.getSettings().locale,'chooseLogo'),properties:['openFile'],filters:[{name:'PNG',extensions:['png']}]});if(picked.canceled||!picked.filePaths[0])return null;
  const file=await open(picked.filePaths[0],'r');try{const stat=await file.stat();if(!stat.isFile()||stat.size>1048576)throw new FinanceError('FINANCE_LOGO');const buffer=Buffer.alloc(1048577);let size=0;while(size<buffer.length){const r=await file.read(buffer,size,buffer.length-size,null);if(!r.bytesRead)break;size+=r.bytesRead;}const data=buffer.subarray(0,size);
    if(size>1048576||size<24||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||data.toString('ascii',12,16)!=='IHDR'||data.readUInt32BE(16)>1024||data.readUInt32BE(20)>1024)throw new FinanceError('FINANCE_LOGO');const image=nativeImage.createFromBuffer(data);if(image.isEmpty())throw new FinanceError('FINANCE_LOGO');return store.finance.setLogo(image.resize({width:160}).toDataURL(),input.revision);
  }finally{await file.close();}
}
export async function outputFinance(window:Window,store:WorkspaceStore,rendererRoot:string,input:FinanceOutputRequest){
  store.security.require('data.export');store.security.global();store.finance.require();const settings=store.getSettings();const report=input.document==='report'?store.finance.report(input.report):null;
  const receipt=input.document==='receipt'?await store.finance.receipt({id:input.id}):null;
  let destination:string|undefined;if(input.format!=='print'){const picked=await dialog.showSaveDialog(window,{title:financeText(settings.locale,'printPreview'),defaultPath:`Demo-${receipt?.number??report?.kind}.${input.format}`,filters:[{name:input.format.toUpperCase(),extensions:[input.format]}]});if(picked.canceled||!picked.filePath)return false;destination=await externalDestination(picked.filePath,app.getPath('userData'));}
  if(report&&destination&&(input.format==='csv'||input.format==='xlsx')){const bytes=input.format==='csv'?financeCsv(report,settings.locale):await financeWorkbook(report,settings.locale);store.security.require('data.export');await writeFile(destination,bytes);store.security.audit('export.finance','report',report.kind);return true;}
  const css=(await readdir(join(rendererRoot,'assets'))).find(f=>/^index-.*\.css$/.test(f));if(!css)throw new Error('Build assets required');const url=`app://mosque/assets/${css}`;
  const html=receipt?receiptPaper(receipt,url,input.layout):reportPaper(report!,settings,url);const token=`/print/${randomUUID()}`;printDocuments.set(token,html);
  const paper=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,devTools:false}});paper.webContents.setWindowOpenHandler(()=>({action:'deny'}));paper.webContents.on('will-navigate',e=>e.preventDefault());
  try{await paper.loadURL(`app://mosque${token}`);await paper.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.decode())]).then(()=>true)');if(destination){const bytes=await paper.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true});store.security.require('data.export');await writeFile(destination,bytes);}else {store.security.require('data.export');await new Promise<void>((resolve,reject)=>paper.webContents.print({silent:false,printBackground:true},(ok,reason)=>ok?resolve():reject(new Error(reason))));}store.security.audit(receipt?'receipt.reprinted':'export.finance',receipt?'receipt':'report',receipt?.id??report?.kind??'');return true;}
  finally{printDocuments.delete(token);paper.destroy();}
}
