import { afterEach,describe,expect,it } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { WorkspaceStore, setTestStaffRole } from '../fixtures/authenticated-store';
import { migrate,migrations } from '../../electron/database/migrations';
import { RegistrationStore } from '../../electron/database/registration-store';
import { LifeEventsStore } from '../../electron/database/life-events-store';
import { blankEvent } from '../../shared/life-events';
import { blankPlan,DEMO_FINANCE_CONFIRMATION as confirmation,financeFilters,parseRupees,type PaymentDraft } from '../../shared/finance';
import { fictionalFamily } from '../fixtures/registration';

const stores:WorkspaceStore[]=[];const dirs:string[]=[];
const key=()=>crypto.randomUUID();
function open(path=':memory:',enabled=true){const s=new WorkspaceStore(path,true,enabled);stores.push(s);return s;}
afterEach(()=>{stores.splice(0).forEach(s=>s.close());dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
function fixture(store:WorkspaceStore){const family=store.registration.save(fictionalFamily());const plan=store.finance.savePlan({...blankPlan(),name:'Fictional monthly',nameMl:'മാതൃകാ വരിസംഖ്യ',effectiveDate:'2026-01-01'});store.finance.saveAssignment({key:key(),familyId:family.id,planId:plan.id,effectiveDate:'2026-01-01',mode:'standard',amountPaise:0,reason:'Fictional setup'});return {family,plan};}
function generate(store:WorkspaceStore,planId:string){return store.finance.generate({key:key(),planId,from:'2026-01',until:'2026-02',confirmation});}
function payment(familyId:string,amountPaise:number,date='2026-02-15'):PaymentDraft{return {key:key(),familyId,categoryId:'contribution-general',amountPaise,date,method:'cash',reference:'',receivedBy:'Fictional Clerk',notes:'Fictional payment',duplicateReason:'',allocation:'oldest',allocations:[],confirmation};}
const filters={...financeFilters(),from:'2026-01-01',until:'2026-12-31'};
describe('financial accounting',()=>{
  it('upgrades populated Phase 3 records without rewriting the registry or event history',()=>{
    const dir=mkdtempSync(join(tmpdir(),'mosque-finance-upgrade-'));dirs.push(dir);const path=join(dir,'phase3.sqlite3');const db=new Database(path);let familyId='';let eventId='';
    try{db.pragma('foreign_keys=ON');migrate(db,migrations.slice(0,3));const registrations=new RegistrationStore(db);const family=registrations.save(fictionalFamily());familyId=family.id;const event=new LifeEventsStore(db,true).save({...blankEvent('death'),number:'DE-PRESERVE',memberId:family.guardianMemberId,remarks:'സാങ്കൽപ്പിക ചരിത്രം'});eventId=event.id;db.prepare('UPDATE mosque_settings SET name=?').run('Fictional preserved mosque');}finally{db.close();}
    const upgraded=open(path);expect(upgraded.getSettings().name).toBe('Fictional preserved mosque');expect(upgraded.registration.get({id:familyId}).members).toHaveLength(4);expect(upgraded.lifeEvents.get({id:eventId})).toMatchObject({number:'DE-PRESERVE',remarks:'സാങ്കൽപ്പിക ചരിത്രം',status:'reported'});expect(upgraded.finance.family({id:familyId})).toMatchObject({outstandingPaise:0,transactions:[]});
  });
  it('keeps donations out of credits and reconciles daily statements, early settlements and refund releases',()=>{
    const s=open();const {family,plan}=fixture(s);generate(s,plan.id);const p=s.finance.payment(payment(family.id,35000,'2026-02-05'));
    s.finance.donation({key:key(),amountPaise:20000,date:'2026-02-05',method:'cash',reference:'',notes:'Fictional',duplicateReason:'',confirmation,fundId:'fund-zakat',familyId:family.id,donor:'Fictional donor',anonymous:false,receivedBy:'Fictional Clerk'});
    const early=s.finance.report({kind:'statement',familyId:family.id,filters:{...filters,until:'2026-02-05'}});expect(early.totals).toMatchObject({outstandingPaise:0,creditPaise:5000,netCashPaise:55000});expect(early.scope[0]).toContain(family.familyCode);
    s.finance.correct({key:key(),id:p.id,kind:'refund',amountPaise:10000,date:'2026-03-01',reason:'Fictional refund',confirmation});
    const statement=s.finance.report({kind:'statement',familyId:family.id,filters});expect(statement.totals).toMatchObject({outstandingPaise:5000,creditPaise:0,netCashPaise:45000});expect(statement.rows.every(r=>Number(r.creditPaise)>=0&&Number(r.outstandingPaise)>=0)).toBe(true);
    const opening=s.finance.report({kind:'statement',familyId:family.id,filters:{...filters,from:'2026-03-02'}});expect(opening.rows[0]).toMatchObject({outstandingPaise:5000,creditPaise:0});
  });
  it('requires chronological adjustments and prevents waiving settled money',()=>{
    const s=open();const {family,plan}=fixture(s);generate(s,plan.id);const due=s.finance.family({id:family.id}).dues[0];
    const adjust={key:key(),dueId:due.id,kind:'increase',amountPaise:10000,date:'2026-03-01',reason:'Fictional adjustment',confirmation};s.finance.adjust(adjust);
    expect(()=>s.finance.adjust({...adjust,key:key(),kind:'decrease',date:'2026-02-01',amountPaise:20000})).toThrow('FINANCE_DATE');
    s.finance.payment(payment(family.id,10000,'2026-03-02'));expect(()=>s.finance.adjust({...adjust,key:key(),kind:'waiver',date:'2026-03-03',amountPaise:16000})).toThrow('FINANCE_ALLOCATION');
    s.finance.adjust({...adjust,key:key(),kind:'waiver',date:'2026-03-03',amountPaise:15000});expect(s.finance.family({id:family.id}).dues[0]).toMatchObject({adjustedPaise:10000,paidPaise:10000,balancePaise:0});
  });
  it('prevents spending or reversing fund cash that is unavailable historically',()=>{
    const s=open();const donation=s.finance.donation({key:key(),amountPaise:20000,date:'2026-02-15',method:'cash',reference:'',notes:'Fictional',duplicateReason:'',confirmation,fundId:'fund-zakat',familyId:'',donor:'Fictional donor',anonymous:false,receivedBy:'Fictional Clerk'});
    const expense={key:key(),amountPaise:5000,date:'2026-02-14',method:'cash',reference:'',notes:'Fictional',duplicateReason:'',confirmation,fundId:'fund-zakat',categoryId:'expense-electricity',wardId:'',description:'Fictional electricity',payee:'Fictional Payee',billReference:'DEMO-BILL',authorizedBy:'Fictional Approver',recordedBy:'Fictional Clerk'};
    expect(()=>s.finance.expense(expense)).toThrow('FINANCE_FUND_BALANCE');s.finance.expense({...expense,key:key(),date:'2026-02-16'});
    expect(()=>s.finance.correct({key:key(),id:donation.id,kind:'reversal',amountPaise:20000,date:'2026-02-17',reason:'Fictional correction',confirmation})).toThrow('FINANCE_FUND_BALANCE');expect(s.finance.setup().funds.find(f=>f.id==='fund-zakat')?.balancePaise).toBe(15000);
  });
  it('bills annual and one-time plans once and shows current effective household rates',()=>{
    const s=open();const {family}=fixture(s);
    for(const frequency of ['annual','once'] as const){const plan=s.finance.savePlan({...blankPlan(),name:`Fictional ${frequency}`,frequency,effectiveDate:'2026-01-01'});s.finance.saveAssignment({key:key(),familyId:family.id,planId:plan.id,effectiveDate:'2026-01-01',mode:'discount',amountPaise:5000,reason:'Fictional discount'});expect(s.finance.generate({key:key(),planId:plan.id,from:'2026-01',until:'2026-12',confirmation})).toMatchObject({created:1,amountPaise:10000});expect(s.finance.generate({key:key(),planId:plan.id,from:'2026-01',until:'2026-12',confirmation})).toMatchObject({created:0,duplicates:1});}
    expect(s.finance.family({id:family.id}).currentPlans.filter(p=>p.mode==='discount').map(p=>p.effectiveAmountPaise)).toEqual([10000,10000]);
  });
  it('generates and reconciles two months for 500 fictional households',()=>{
    const s=open();const first=fixture(s);for(let n=2;n<=500;n++){const f=s.registration.save(fictionalFamily(String(1000+n),`ward-${1+(n%4)}`));s.finance.saveAssignment({key:key(),familyId:f.id,planId:first.plan.id,effectiveDate:'2026-01-01',mode:'standard',amountPaise:0,reason:'Fictional volume check'});}
    expect(generate(s,first.plan.id)).toMatchObject({created:1000,amountPaise:15000000});expect(generate(s,first.plan.id)).toMatchObject({created:0,duplicates:1000});expect(s.finance.dashboard(filters).outstandingPaise).toBe(15000000);
  },20000);
  it('bills two ₹150 months, settles partially, issues sequential snapshots and prevents duplicate commands',async()=>{
    const s=open();const {family,plan}=fixture(s);expect(generate(s,plan.id)).toMatchObject({created:2,amountPaise:30000});expect(generate(s,plan.id)).toMatchObject({created:0,duplicates:2});
    const draft=payment(family.id,10000);const p=s.finance.payment(draft);expect(s.finance.payment(draft).id).toBe(p.id);expect(()=>s.finance.payment({...draft,amountPaise:20000})).toThrow('FINANCE_IDEMPOTENCY');
    const profile=s.finance.family({id:family.id});expect(profile.outstandingPaise).toBe(20000);expect(profile.dues.map(d=>d.balancePaise)).toEqual([5000,15000]);
    const second=s.finance.payment(payment(family.id,5000));expect(second.receiptNumber.endsWith('000002')).toBe(true);expect(s.finance.family({id:family.id}).dues[0].balancePaise).toBe(0);
    const receipt=await s.finance.receipt({id:p.receiptId});expect(receipt.snapshot).toMatchObject({totalPaise:10000,remainingPaise:20000});expect(receipt.snapshot.guardian).toContain('അമീൻ');expect(receipt.verification).toBe(`mosque-suite:receipt:${receipt.id}`);expect(receipt.qr.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('keeps effective-dated bills fixed and applies overrides, pauses and exemptions',()=>{
    const s=open();const {family,plan}=fixture(s);generate(s,plan.id);
    const {versionId:_,...draft}=plan;
    s.finance.savePlan({...draft,key:key(),amountPaise:25000,effectiveDate:'2026-03-01'});
    s.finance.saveAssignment({key:key(),familyId:family.id,planId:plan.id,effectiveDate:'2026-03-01',mode:'override',amountPaise:10000,reason:'Fictional discount'});
    s.finance.generate({key:key(),planId:plan.id,from:'2026-03',until:'2026-03',confirmation});expect(s.finance.family({id:family.id}).dues.map(d=>d.amountPaise)).toEqual([15000,15000,10000]);
    s.finance.saveAssignment({key:key(),familyId:family.id,planId:plan.id,effectiveDate:'2026-04-01',mode:'paused',amountPaise:0,reason:'Fictional pause'});
    expect(s.finance.generate({key:key(),planId:plan.id,from:'2026-04',until:'2026-04',confirmation})).toMatchObject({created:0,skipped:1});
    s.finance.savePolicy({key:key(),familyId:family.id,active:true,exempt:true,reason:'Fictional exemption'});expect(generate(s,plan.id).created).toBe(0);expect(s.finance.family({id:family.id}).outstandingPaise).toBe(40000);
  });
  it('stores advance credits and only allocates them on an explicit action',()=>{
    const s=open();const {family,plan}=fixture(s);const p=s.finance.payment({...payment(family.id,40000),allocation:'credit'});expect(p.creditPaise).toBe(40000);generate(s,plan.id);expect(s.finance.family({id:family.id}).outstandingPaise).toBe(30000);
    expect(s.finance.applyCredit({key:key(),paymentId:p.id,date:'2026-03-01',confirmation})).toEqual({allocatedPaise:30000});expect(s.finance.family({id:family.id})).toMatchObject({creditPaise:10000,outstandingPaise:0});
  });
  it('releases allocations on refund and reversal without editing finalized transactions',async()=>{
    const s=open();const {family,plan}=fixture(s);generate(s,plan.id);const p=s.finance.payment(payment(family.id,35000));
    s.finance.correct({key:key(),id:p.id,kind:'refund',amountPaise:10000,date:'2026-03-01',reason:'Fictional refund',confirmation});expect(s.finance.family({id:family.id})).toMatchObject({outstandingPaise:5000,creditPaise:0,netPaidPaise:25000});expect((await s.finance.receipt({id:p.receiptId})).status).toBe('part_refunded');
    expect(()=>s.finance.correct({key:key(),id:p.id,kind:'reversal',amountPaise:35000,date:'2026-03-02',reason:'Fictional correction',confirmation})).toThrow('FINANCE_STATE');
    const q=s.finance.payment(payment(family.id,5000,'2026-03-02'));s.finance.correct({key:key(),id:q.id,kind:'reversal',amountPaise:5000,date:'2026-03-03',reason:'Fictional correction',confirmation});expect(s.finance.family({id:family.id}).outstandingPaise).toBe(5000);expect((await s.finance.receipt({id:q.receiptId})).status).toBe('reversed');
  });
  it('rejects over-allocation, invalid paise, duplicate bank references and unacknowledged similar cash entries',()=>{
    const s=open();const {family,plan}=fixture(s);generate(s,plan.id);const due=s.finance.family({id:family.id}).dues[0];
    expect(()=>s.finance.payment({...payment(family.id,20000),allocation:'specific',allocations:[{dueId:due.id,amountPaise:20000}]})).toThrow('FINANCE_ALLOCATION');expect(s.finance.family({id:family.id}).transactions).toHaveLength(0);
    for(const amount of [-1,0,1.01,Infinity,100000000001])expect(()=>s.finance.payment(payment(family.id,amount))).toThrow();
    s.finance.payment({...payment(family.id,10000),method:'upi',reference:'DEMO-REF'});expect(()=>s.finance.payment({...payment(family.id,5000),method:'upi',reference:'demo-ref'})).toThrow('FINANCE_REFERENCE');
    s.finance.payment(payment(family.id,5000));expect(()=>s.finance.payment(payment(family.id,5000))).toThrow('FINANCE_DUPLICATE');
    expect(parseRupees('150.05')).toBe(15005);expect(parseRupees('1.005')).toBeNull();expect(parseRupees('1e3')).toBeNull();
  });
  it('keeps fund cash separate, requires expense approval and reconciles all cash reports',()=>{
    const s=open();const {family,plan}=fixture(s);generate(s,plan.id);s.finance.payment(payment(family.id,10000));
    s.finance.donation({key:key(),amountPaise:20000,date:'2026-02-15',method:'cash',reference:'',notes:'Fictional',duplicateReason:'',confirmation,fundId:'fund-zakat',familyId:'',donor:'Hidden donor',anonymous:true,receivedBy:'Fictional Clerk'});
    s.finance.saveConfig({key:key(),revision:0,receiptPrefix:'DEMO',approvalThresholdPaise:0,approveAllExpenses:true});
    const request=s.finance.expense({key:key(),amountPaise:5000,date:'2026-02-16',method:'cash',reference:'',notes:'Fictional',duplicateReason:'',confirmation,fundId:'fund-zakat',categoryId:'expense-charity',wardId:'',description:'Fictional relief',payee:'Fictional Payee',billReference:'DEMO-BILL',authorizedBy:'Fictional Approver',recordedBy:'Fictional Clerk'});
    expect(request.pending).toBe(true);expect(s.finance.setup().funds.find(f=>f.id==='fund-zakat')?.balancePaise).toBe(20000);setTestStaffRole(s,'accountant');expect(()=>s.finance.decideExpense({key:key(),id:request.id,decision:'approve',reason:'Fictional approval',confirmation})).toThrow('AUTH_PERMISSION');setTestStaffRole(s,'administrator');
    s.finance.decideExpense({key:key(),id:request.id,decision:'approve',reason:'Fictional approval',confirmation});expect(s.finance.setup().funds.find(f=>f.id==='fund-zakat')?.balancePaise).toBe(15000);
    const dashboard=s.finance.dashboard(filters);expect(dashboard).toMatchObject({collectedPaise:10000,donationPaise:20000,expensePaise:5000,netCashPaise:25000});
    for(const kind of ['daily','methods','ledger'] as const)expect(s.finance.report({kind,filters,familyId:''}).totals.netCashPaise).toBe(25000);
    expect(s.finance.report({kind:'funds',filters,familyId:''}).totals.closingPaise).toBe(25000);
  });
  it('rejects actions outside the isolated demo and enforces host-owned demo roles',()=>{
    const ordinary=open(':memory:',false);expect(()=>ordinary.finance.setup()).toThrow('FINANCE_DEMO_ONLY');expect(()=>ordinary.finance.payment({})).toThrow('FINANCE_DEMO_ONLY');
    const s=open();setTestStaffRole(s,'viewer');expect(s.finance.setup().session.role).toBe('viewer');expect(()=>s.finance.payment({})).toThrow('AUTH_PERMISSION');expect(()=>s.finance.savePlan({})).toThrow('AUTH_PERMISSION');expect(s.finance.dashboard(filters).netCashPaise).toBe(0);
  });
  it('persists financial data and makes a valid SQLite snapshot including WAL transactions',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'mosque-finance-'));dirs.push(dir);const path=join(dir,'workspace.sqlite3');const s=open(path);const {family,plan}=fixture(s);generate(s,plan.id);const p=s.finance.payment(payment(family.id,10000));
    const snapshot=join(dir,'safe-backup.sqlite3');await s.onlineSnapshot(snapshot);const db=new Database(snapshot,{readonly:true});try{expect(db.pragma('quick_check',{simple:true})).toBe('ok');expect(db.prepare('SELECT COUNT(*) AS n FROM receipts').get()).toEqual({n:1});}finally{db.close();}
    s.close();const reopened=open(path);expect(reopened.finance.family({id:family.id}).outstandingPaise).toBe(20000);expect((await reopened.finance.receipt({id:p.receiptId})).snapshot.guardian).toContain('അമീൻ');
    const raw=new Database(path);try{expect(()=>raw.exec('DELETE FROM financial_transactions')).toThrow('immutable');expect(()=>raw.exec("UPDATE receipts SET number='changed'")).toThrow('immutable');raw.exec("CREATE TRIGGER fail_finance_audit BEFORE INSERT ON transaction_audit_log BEGIN SELECT RAISE(ABORT,'simulated failure'); END");}finally{raw.close();}
    expect(()=>reopened.finance.payment(payment(family.id,5000))).toThrow('simulated failure');expect(reopened.finance.family({id:family.id}).transactions).toHaveLength(1);
  });
});
