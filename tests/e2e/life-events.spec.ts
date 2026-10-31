import {authenticate} from '../fixtures/electron-auth';
import { test,expect,_electron as electron,type ElectronApplication,type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join,resolve,relative } from 'node:path';
import { rm,readFile,copyFile } from 'node:fs/promises';
import { fictionalFamily } from '../fixtures/registration';
import { blankEvent,blankParty,eventToDraft,type EventRecord } from '../../shared/life-events';
import type { FamilyProfile } from '../../shared/registration';

let app:ElectronApplication|undefined;let page:Page;let profile:string;let userData:string;let errors:string[];let a:FamilyProfile;let b:FamilyProfile;
async function launch(){const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((e):e is [string,string]=>e[1]!==undefined)),MOSQUE_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.MOSQUE_DEV_URL;app=await electron.launch({args:['.'],env});page=await app.firstWindow();await authenticate(app,page);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await expect(page.getByRole('heading',{name:'A place for every family.'})).toBeVisible();userData=await app.evaluate(({app})=>app.getPath('userData'));}
test.beforeEach(async()=>{test.skip(Boolean(process.env.MOSQUE_PACKAGED_EXE));profile=`test-${randomUUID()}`;userData='';errors=[];app=undefined;await launch();for(const draft of [fictionalFamily('101'),fictionalFamily('202','ward-2')]){if(draft.familyNumber==='202'){draft.members[0].name='Fictional Basheer';draft.members[0].nameMl='മാതൃകാ ബഷീർ';draft.members[1].name='Fictional Hana';draft.members[1].nameMl='മാതൃകാ ഹന';}const result=await page.evaluate(d=>window.mosque!.saveFamily(d),draft);if(!result.ok)throw new Error(result.error.code);if(draft.familyNumber==='101')a=result.data;else b=result.data;}});
test.afterEach(async()=>{if(app){await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();}).catch(()=>{});await app.close();}if(userData){const root=resolve(process.env.APPDATA!,'Mosque Suite Development');if(relative(root,userData)!==profile||!/^test-[\da-f-]{36}$/.test(profile))throw new Error('Unsafe cleanup');await rm(userData,{recursive:true,force:true});}expect(errors).toEqual([]);});
async function seedMarriage(external=false){const result=await page.evaluate(d=>window.mosque!.saveEvent(d),{...blankEvent('marriage'),number:'M-101',eventDate:'2020-01-01',parties:[{...blankParty(),memberId:a.guardianMemberId},external?{...blankParty(),name:'Fictional External',nameMl:'മാതൃകാ പങ്കാളി'}:{...blankParty(),memberId:b.members[1].id}],remarks:'സാങ്കൽപ്പിക വിവരം',officiant:'Fictional Qazi',venue:'Fictional Mosque'});if(!result.ok)throw new Error(result.error.code);return result.data;}
async function confirm(event:EventRecord){const result=await page.evaluate(e=>window.mosque!.transitionEvent({id:e.id,revision:e.revision,action:'confirm',confirmation:'CONFIRM DEMO ACTION'}),event);if(!result.ok)throw new Error(result.error.code);return result.data;}

test('creates a marriage through the UI and explicitly links two existing members across restarts',async()=>{
  await page.getByRole('link',{name:'Marriage Registry',exact:true}).click();await page.getByRole('link',{name:'Add new record',exact:true}).first().click();
  await page.getByLabel('Registration number',{exact:false}).fill('M-UI');await page.getByLabel('Marriage date',{exact:false}).fill('2020-01-01');
  await page.getByRole('region',{name:'Groom',exact:true}).getByRole('button',{name:/Fictional Ameen/}).click();
  await page.getByRole('region',{name:'Bride',exact:true}).getByRole('button',{name:/Fictional Hana/}).click();
  await page.getByLabel('Administrative remarks').fill('മാതൃകാ വിവാഹം');await page.getByRole('button',{name:'Save record',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Marriage Registry · M-UI',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Confirm demo record',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm demo record',exact:true}).click();
  await expect(page.locator('.status').filter({hasText:'Confirmed'})).toBeVisible();
  expect(await page.evaluate(id=>window.mosque!.getMember({id}),a.guardianMemberId)).toMatchObject({ok:true,data:{maritalStatus:'married',familyId:a.id}});
  await app!.close();app=undefined;await launch();await page.context().setOffline(true);await page.getByRole('link',{name:'Marriage Registry',exact:true}).click();await page.getByRole('searchbox',{name:'Search records'}).fill('അമീൻ');await page.getByRole('link',{name:'M-UI',exact:true}).click();await expect(page.getByText('മാതൃകാ വിവാഹം',{exact:true})).toBeVisible();
});
test('registers an external spouse and an associated administrative divorce without erasing the marriage',async()=>{
  const married=await confirm(await seedMarriage(true));await page.getByRole('link',{name:'Divorce Registry',exact:true}).click();await page.getByRole('link',{name:'Add new record',exact:true}).first().click();
  await page.getByLabel('Registration number',{exact:false}).fill('D-101');await page.getByLabel('Event date',{exact:false}).fill('2021-01-01');await page.getByRole('button',{name:/M-101 · 2020-01-01/}).click();
  await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByRole('heading',{name:'Divorce Registry · D-101'})).toBeVisible();
  await page.getByRole('button',{name:'Mark under review',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Mark under review',exact:true}).click();await expect(page.locator('.status').filter({hasText:'Under Review'})).toBeVisible();
  await page.getByRole('button',{name:'Confirm demo record',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('does not determine legal or religious validity');await page.getByRole('dialog').getByRole('button',{name:'Confirm demo record',exact:true}).click();await expect(page.locator('.status').filter({hasText:'Confirmed'})).toBeVisible();
  expect(await page.evaluate(id=>window.mosque!.getEvent({id}),married.id)).toMatchObject({ok:true,data:{status:'confirmed'}});
  expect(await page.evaluate(id=>window.mosque!.getMember({id}),a.guardianMemberId)).toMatchObject({ok:true,data:{maritalStatus:'divorced'}});
});
test('confirms a guardian death, preserves the member and warns about reassignment',async()=>{
  await page.getByRole('link',{name:'Death Registry',exact:true}).click();await page.getByRole('link',{name:'Add new record',exact:true}).first().click();
  await page.getByLabel('Registration number',{exact:false}).fill('DE-101');await page.getByRole('region',{name:'Member',exact:true}).getByRole('button',{name:/Fictional Ameen/}).click();await page.getByRole('button',{name:'Save record',exact:true}).click();
  await page.getByRole('button',{name:'Confirm demo record',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm demo record',exact:true}).click();await expect(page.getByText(/Guardian reassignment required/)).toBeVisible();
  await page.getByRole('link',{name:'W1/101',exact:true}).click();await expect(page.getByText(/Guardian reassignment required/)).toBeVisible();
  expect(await page.evaluate(id=>window.mosque!.getFamily({id}),a.id)).toMatchObject({ok:true,data:{needsGuardian:true,totals:{living:3,deceased:1}}});
  const duplicate=await page.evaluate(d=>window.mosque!.saveEvent(d),{...blankEvent('death'),number:'DE-102',memberId:a.guardianMemberId});expect(duplicate).toMatchObject({ok:false,error:{code:'DUPLICATE_DEATH'}});
});
test('transfers a non-guardian only after a separate confirmation and shows both histories',async()=>{
  await page.goto('app://mosque/index.html#/household-transfer');await page.getByRole('region',{name:'Member',exact:true}).getByRole('button',{name:/Fictional Hana/}).click();
  await page.getByRole('button',{name:/W1\/101 · Fictional Green House/}).click();await page.getByLabel('Reason for transfer').fill('Fictional household transfer');await page.getByRole('button',{name:'Confirm household transfer',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('W2/202 → W1/101');await page.getByRole('dialog').getByRole('button',{name:'Confirm household transfer',exact:true}).click();await expect(page.getByText('Member transferred. Both household histories were kept.')).toBeVisible();
  expect(await page.evaluate(id=>window.mosque!.getMember({id}),b.members[1].id)).toMatchObject({ok:true,data:{familyId:a.id}});await page.goto(`app://mosque/index.html#/families/${b.id}`);await expect(page.getByText('Fictional household transfer',{exact:true})).toBeVisible();
});
test('keeps invalid/unsaved forms, edits with history, and configures divorce categories',async()=>{
  const saved=await seedMarriage();await page.goto(`app://mosque/index.html#/events/marriage/${saved.id}/edit`);await page.getByLabel('Marriage date',{exact:false}).fill('2099-01-01');await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByText('Enter a valid date no later than today.')).toBeVisible();await page.getByRole('link',{name:'Death Registry',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Keep editing'}).click();await page.getByLabel('Marriage date',{exact:false}).fill('2020-01-01');await page.getByLabel('Administrative remarks').fill('Fictional corrected note');await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByText('Record edited',{exact:true})).toBeVisible();
  await page.goto('app://mosque/index.html#/event-categories');await page.getByLabel('Category name (English)').fill('Fictional category');await page.getByLabel('Category name (Malayalam)').fill('മാതൃകാ വിഭാഗം');await page.getByRole('button',{name:'Save record',exact:true}).click();await expect(page.getByText(/Fictional category · മാതൃകാ വിഭാഗം/)).toBeVisible();
  expect(await page.evaluate(d=>window.mosque!.saveEvent({...d,role:'admin'} as typeof d),eventToDraft(saved))).toMatchObject({ok:false,error:{code:'VALIDATION'}});
});
test('exports actual bilingual PDFs, persists attachments and keeps all event screens accessible',async()=>{
  test.setTimeout(120_000);const marriage=await confirm(await seedMarriage());const divorced=await page.evaluate(d=>window.mosque!.saveEvent(d),{...blankEvent('divorce'),number:'D-PDF',eventDate:'2021-01-01',marriageId:marriage.id,parties:eventToDraft(marriage).parties});if(!divorced.ok)throw new Error(divorced.error.code);const divorce=await confirm(divorced.data);
  const died=await page.evaluate(d=>window.mosque!.saveEvent(d),{...blankEvent('death'),number:'DE-PDF',memberId:a.members[2].id});if(!died.ok)throw new Error(died.error.code);const death=await confirm(died.data);
  for(const record of [marriage,divorce,death]){
    const path=join(tmpdir(),`mosque-suite-${record.kind}-${profile}.pdf`);await app!.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},path);await page.goto(`app://mosque/index.html#/events/${record.kind}/${record.id}`);await page.getByRole('button',{name:'Save PDF',exact:true}).click();await expect.poll(async()=>{try{return (await readFile(path)).subarray(0,5).toString();}catch{return '';}}).toBe('%PDF-');await copyFile(path,join(tmpdir(),`mosque-suite-${record.kind}-demo.pdf`));await rm(path);await expect(page.getByText('Output completed.',{exact:true})).toBeVisible();
    const scan=await new AxeBuilder({page}).setLegacyMode().withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  }
  await page.goto(`app://mosque/index.html#/events/marriage/${marriage.id}`);const attachment=join(tmpdir(),'mosque-suite-marriage-demo.pdf');await app!.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},attachment);await page.getByRole('button',{name:'Attach document',exact:true}).click();await expect(page.getByText(/mosque-suite-marriage-demo.pdf ·/)).toBeVisible();
  await app!.close();app=undefined;await launch();await page.goto(`app://mosque/index.html#/events/marriage/${marriage.id}`);await expect(page.getByText(/mosque-suite-marriage-demo.pdf ·/)).toBeVisible();
  for(const route of ['/events/marriage','/events/divorce/new','/events/death/new','/household-transfer','/event-categories']){await page.goto(`app://mosque/index.html#${route}`);await expect(page.locator('h1')).toBeVisible();const scan=await new AxeBuilder({page}).setLegacyMode().withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(scan.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);}
  await page.goto(`app://mosque/index.html#/events/marriage/${marriage.id}`);await page.getByLabel('Language',{exact:true}).selectOption('ml');await expect(page.locator('html')).toHaveAttribute('lang','ml');await page.getByRole('button',{name:'രൂപഭാവം മാറ്റുക'}).click();await app!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1000,720));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await expect(page.getByRole('heading',{level:1})).toContainText('M-101'); expect((await new AxeBuilder({page}).setLegacyMode().withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]); await page.screenshot({path:join(tmpdir(),'mosque-suite-life-events-ml.png'),fullPage:true});
});
