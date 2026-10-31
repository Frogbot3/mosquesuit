import { auditSummary } from '../audit-summary';
import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import QRCode from 'qrcode';
import { adjustmentSchema, assignmentSchema, correctionSchema, creditSchema, donationSchema, expenseDecisionSchema, expenseSchema, financeCategorySchema, financeConfigSchema, financeFilterSchema, financeIdSchema, financeReportSchema, financeRoleSchema, fundSchema, generateSchema, paymentSchema, planSchema, policySchema, FinanceError, type FinanceSession, type FinanceRole, type FinanceTransaction, type FamilyFinance, type FinanceReceipt, type ReceiptSnapshot, type PaymentDraft, type ExpenseDraft, type FinanceAudit } from '../../shared/finance';

import { financeAssignments, financeCategories, financeConfig, financeDues, financeFunds, financePlans, financeTransactions, pendingExpenses } from './finance-queries';
import { financialDashboard, financialReport } from './finance-reports';
import { todayInIndia } from '../../shared/registration';

const now=()=>new Date().toISOString();
type Household={id:string;wardId:string;familyCode:string;house:string;guardian:string;ward:string;status:string;living:number;active:number;exempt:number};
type CashInput={amountPaise:number;date:string;method:string;reference:string;notes:string;familyId:string;wardId:string;categoryId:string;fundId:string;relatedId?:string};
export class FinanceStore {
  private session:FinanceSession={id:'',role:'administrator',fictional:true};
  constructor(private readonly db:Database.Database,public readonly enabled=false){if(enabled)this.startSession('administrator');}
  require(role:FinanceRole='viewer'):void {
    if(!this.enabled)throw new FinanceError('FINANCE_DEMO_ONLY');
    const rank={viewer:0,accountant:1,administrator:2};if(rank[this.session.role]<rank[role])throw new FinanceError('FINANCE_PERMISSION');
  }
  private startSession(role:FinanceRole){this.session={id:randomUUID(),role,fictional:true};this.db.prepare('INSERT INTO financial_sessions(id,role,created_at) VALUES(?,?,?)').run(this.session.id,role,now());}
  setRole(input:unknown){this.require();const {role}=financeRoleSchema.parse(input);this.db.transaction(()=>{this.startSession(role);this.audit('session.started',this.session.id,{role});})();return this.session;}
  private audit(action:string,entityId:string,details:unknown={}){this.db.prepare('INSERT INTO transaction_audit_log(action,entity_id,session_id,details,created_at) VALUES(?,?,?,?,?)').run(action,entityId,this.session.id,auditSummary(details),now());}
  private command<T extends {key:string},R>(role:FinanceRole,operation:string,schema:z.ZodType<T>,input:unknown,perform:(data:T)=>R):R {
    this.require(role);const data=schema.parse(input);const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
    try{return this.db.transaction(()=>{
      const previous=this.db.prepare('SELECT operation,payload_hash AS hash,result FROM financial_commands WHERE key=?').get(data.key) as {operation:string;hash:string;result:string}|undefined;
      if(previous){if(previous.operation!==operation||previous.hash!==hash)throw new FinanceError('FINANCE_IDEMPOTENCY');return JSON.parse(previous.result) as R;}
      const result=perform(data);this.db.prepare('INSERT INTO financial_commands(key,operation,payload_hash,result) VALUES(?,?,?,?)').run(data.key,operation,hash,JSON.stringify(result));return result;
    }).immediate();}catch(error){
      if(error instanceof FinanceError)throw error;
      const message=error instanceof Error?error.message:'';
      if(message.includes('Insufficient fund balance'))throw new FinanceError('FINANCE_FUND_BALANCE');
      if(message.includes('Duplicate financial reference'))throw new FinanceError('FINANCE_REFERENCE');
      if(message.includes('Invalid payment allocation')||message.includes('Invalid due adjustment'))throw new FinanceError('FINANCE_ALLOCATION');
      if(message.includes('Financial integer limit'))throw new FinanceError('FINANCE_LIMIT');
      throw error;
    }
  }
  setup(){this.require();return {session:this.session,plans:financePlans(this.db),categories:financeCategories(this.db),funds:financeFunds(this.db),config:financeConfig(this.db),pendingExpenses:pendingExpenses(this.db)};}
  auditHistory():FinanceAudit[]{this.require();return (this.db.prepare('SELECT a.id,a.action,a.entity_id AS entityId,a.session_id AS sessionId,s.role,a.details,a.created_at AS createdAt FROM transaction_audit_log a JOIN financial_sessions s ON s.id=a.session_id ORDER BY a.id DESC LIMIT 500').all() as FinanceAudit[]).map(row=>({...row,details:'{}'}));}
  private household(id:string):Household {
    const family=this.db.prepare(`SELECT f.id,f.ward_id AS wardId,w.code||'/'||f.family_number AS familyCode,trim(f.house_name||' '||f.house_name_ml) AS house,trim(m.name||' '||m.name_ml) AS guardian,w.name||' '||w.name_ml AS ward,f.status,(SELECT COUNT(*) FROM members WHERE family_id=f.id AND archived_at IS NULL AND life_status='living') AS living,COALESCE(p.active,1) AS active,COALESCE(p.exempt,0) AS exempt FROM families f JOIN wards w ON w.id=f.ward_id JOIN members m ON m.id=f.guardian_member_id LEFT JOIN family_finance_policy p ON p.family_id=f.id WHERE f.id=?`).get(id) as Household|undefined;
    if(!family)throw new FinanceError('FINANCE_NOT_FOUND');return family;
  }
  private category(id:string,kind:'contribution'|'expense',active=true){const c=financeCategories(this.db).find(c=>c.id===id&&c.kind===kind&&(!active||c.active));if(!c)throw new FinanceError('FINANCE_INVALID');return c;}
  private fund(id:string,active=true){const f=financeFunds(this.db).find(f=>f.id===id&&(!active||f.active));if(!f)throw new FinanceError('FINANCE_INVALID');return f;}
  private ward(id:string){if(id&&!this.db.prepare('SELECT 1 FROM wards WHERE id=?').get(id))throw new FinanceError('FINANCE_INVALID');}
  savePlan(input:unknown){return this.command('administrator','plan.version',planSchema,input,d=>{
    this.category(d.categoryId,'contribution');this.ward(d.wardId);let id=d.id;
    if(id){const previous=financePlans(this.db).find(p=>p.id===id);if(!previous)throw new FinanceError('FINANCE_NOT_FOUND');if(previous.revision!==d.revision)throw new FinanceError('FINANCE_STALE');if(previous.frequency!==d.frequency||previous.categoryId!==d.categoryId||previous.effectiveDate>=d.effectiveDate)throw new FinanceError('FINANCE_EFFECTIVE');}
    else{if(d.revision!==0)throw new FinanceError('FINANCE_STALE');id=randomUUID();this.db.prepare('INSERT INTO contribution_plans(id,frequency,category_id) VALUES(?,?,?)').run(id,d.frequency,d.categoryId);}
    this.db.prepare(`INSERT INTO contribution_plan_versions(id,plan_id,revision,name,name_ml,description,amount_paise,effective_date,due_day,due_month,active,ward_id,registered_only,require_living) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(),id,d.revision+1,d.name,d.nameMl,d.description,d.amountPaise,d.effectiveDate,d.dueDay,d.dueMonth,+d.active,d.wardId||null,+d.registeredOnly,+d.requireLiving);
    this.audit('plan.version',id,d);return financePlans(this.db).find(p=>p.id===id)!;
  });}
  saveAssignment(input:unknown){return this.command('administrator','assignment.created',assignmentSchema,input,d=>{
    this.household(d.familyId);const p=financePlans(this.db).find(p=>p.id===d.planId);if(!p)throw new FinanceError('FINANCE_NOT_FOUND');
    if(p.frequency==='monthly'&&!d.effectiveDate.endsWith('-01')||p.frequency==='annual'&&!d.effectiveDate.endsWith('-01-01'))throw new FinanceError('FINANCE_EFFECTIVE');
    if(this.db.prepare('SELECT 1 FROM family_contribution_assignments WHERE family_id=? AND plan_id=? AND effective_date=?').get(d.familyId,d.planId,d.effectiveDate))throw new FinanceError('FINANCE_EFFECTIVE');
    const id=randomUUID();this.db.prepare('INSERT INTO family_contribution_assignments(id,family_id,plan_id,effective_date,mode,amount_paise,reason) VALUES(?,?,?,?,?,?,?)').run(id,d.familyId,d.planId,d.effectiveDate,d.mode,d.amountPaise,d.reason);this.audit('assignment.created',id,d);return null;
  });}
  savePolicy(input:unknown){return this.command('administrator','household.policy',policySchema,input,d=>{this.household(d.familyId);this.db.prepare('INSERT INTO family_finance_policy(family_id,active,exempt) VALUES(?,?,?) ON CONFLICT(family_id) DO UPDATE SET active=excluded.active,exempt=excluded.exempt').run(d.familyId,+d.active,+d.exempt);this.audit('household.policy',d.familyId,d);return null;});}
  generate(input:unknown){return this.command('administrator','dues.generated',generateSchema,input,d=>{
    const months:string[]=[];for(let month=d.from;month<=d.until;){months.push(month);const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7);}
    const result={created:0,duplicates:0,skipped:0,amountPaise:0};
    const roots=financePlans(this.db).filter(p=>!d.planId||p.id===d.planId);if(d.planId&&!roots.length)throw new FinanceError('FINANCE_NOT_FOUND');
    for(const root of roots){
      const families=this.db.prepare('SELECT DISTINCT family_id AS id FROM family_contribution_assignments WHERE plan_id=?').all(root.id) as {id:string}[];
      for(const {id} of families){const family=this.household(id);let periods=months.map(m=>`${m}-01`);
        if(root.frequency==='annual')periods=periods.filter(p=>p.endsWith('-01-01'));
        if(root.frequency==='once'){const firstPlan=(this.db.prepare('SELECT MIN(effective_date) AS date FROM contribution_plan_versions WHERE plan_id=?').get(root.id) as {date:string}).date;const firstAssignment=(this.db.prepare('SELECT MIN(effective_date) AS date FROM family_contribution_assignments WHERE family_id=? AND plan_id=?').get(id,root.id) as {date:string}).date;const start=firstPlan>firstAssignment?firstPlan:firstAssignment;periods=start.slice(0,7)>=d.from&&start.slice(0,7)<=d.until?[start]:[];}
        for(const start of periods){
          const p=financePlans(this.db,start).find(p=>p.id===root.id);const a=financeAssignments(this.db,id).find(a=>a.planId===root.id&&a.effectiveDate<=start);
          if(!p||!a||!p.active||!family.active||family.exempt||a.mode==='paused'||a.mode==='waived'||p.wardId&&p.wardId!==family.wardId||p.registeredOnly&&family.status!=='registered'||p.requireLiving&&family.living===0){result.skipped++;continue;}
          const amount=a.mode==='override'?a.amountPaise:a.mode==='discount'?Math.max(0,p.amountPaise-a.amountPaise):p.amountPaise;if(!amount){result.skipped++;continue;}
          const period=p.frequency==='monthly'?start.slice(0,7):p.frequency==='annual'?start.slice(0,4):'once';
          if(this.db.prepare('SELECT 1 FROM dues WHERE family_id=? AND plan_id=? AND period=?').get(id,p.id,period)){result.duplicates++;continue;}
          const dueDate=p.frequency==='once'?start:`${start.slice(0,4)}-${p.frequency==='annual'?String(p.dueMonth).padStart(2,'0'):start.slice(5,7)}-${String(p.dueDay).padStart(2,'0')}`;
          const dueId=randomUUID();this.db.prepare('INSERT INTO dues(id,family_id,ward_id,plan_id,version_id,assignment_id,category_id,period,period_start,due_date,amount_paise,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(dueId,id,family.wardId,p.id,p.versionId,a.id,p.categoryId,period,start,dueDate,amount,now());
          this.audit('due.created',dueId,{familyId:id,planId:p.id,period,amountPaise:amount});result.created++;result.amountPaise+=amount;
        }
      }
    }
    this.audit('dues.generated',d.key,result);return result;
  });}
  family(input:unknown):FamilyFinance {
    this.require();const {id}=financeIdSchema.parse(input);const f=this.household(id);const dues=financeDues(this.db,'2199-12-31',id);const transactions=financeTransactions(this.db,'2199-12-31',id);
    const assignments=financeAssignments(this.db,id);const currentPlans=financePlans(this.db,todayInIndia()).flatMap(p=>{const a=assignments.find(a=>a.planId===p.id&&a.effectiveDate<=todayInIndia());if(!a)return [];const active=p.active&&Boolean(f.active)&&!f.exempt&&a.mode!=='paused'&&a.mode!=='waived'&&(!p.requireLiving||f.living>0)&&(!p.registeredOnly||f.status==='registered')&&(!p.wardId||p.wardId===f.wardId);return [{...p,active,mode:a.mode,effectiveAmountPaise:active?(a.mode==='override'?a.amountPaise:a.mode==='discount'?Math.max(0,p.amountPaise-a.amountPaise):p.amountPaise):0}];});
    return {id,familyCode:f.familyCode,active:Boolean(f.active),exempt:Boolean(f.exempt),currentPlans,assignments:financeAssignments(this.db,id),dues,transactions,adjustments:this.db.prepare('SELECT a.id,a.due_id AS dueId,a.kind,a.amount_paise AS amountPaise,a.date,a.reason FROM financial_adjustments a JOIN dues d ON d.id=a.due_id WHERE d.family_id=? ORDER BY a.date DESC,a.created_at DESC').all(id) as FamilyFinance['adjustments'],outstandingPaise:dues.reduce((s,d)=>s+d.balancePaise,0),creditPaise:transactions.reduce((s,t)=>s+t.creditPaise,0),netPaidPaise:transactions.filter(t=>t.kind==='payment'||t.relatedId&&transactions.some(p=>p.id===t.relatedId&&p.kind==='payment')).reduce((s,t)=>s+t.cashPaise,0)};
  }
  transaction(input:unknown):FinanceTransaction {this.require();const {id}=financeIdSchema.parse(input);const t=financeTransactions(this.db,'2199-12-31','',id)[0];if(!t)throw new FinanceError('FINANCE_NOT_FOUND');return t;}
  private cash(kind:FinanceTransaction['kind'],d:CashInput,cashPaise:number):string {
    const id=randomUUID();this.db.prepare('INSERT INTO financial_transactions(id,kind,amount_paise,cash_paise,date,method,reference,notes,family_id,ward_id,category_id,fund_id,related_id,session_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,kind,d.amountPaise,cashPaise,d.date,d.method,d.reference,d.notes,d.familyId||null,d.wardId||null,d.categoryId||null,d.fundId,d.relatedId||null,this.session.id,now());return id;
  }
  private duplicate(kind:string,d:{familyId?:string;amountPaise:number;date:string;method:string;reference:string;duplicateReason:string},fundId:string){
    if(this.db.prepare(`SELECT 1 FROM financial_transactions t WHERE t.kind=? AND COALESCE(t.family_id,'')=? AND t.amount_paise=? AND t.date=? AND t.method=? AND t.reference=? AND t.fund_id=? AND NOT EXISTS(SELECT 1 FROM financial_transactions r WHERE r.related_id=t.id AND r.kind='reversal')`).get(kind,d.familyId||'',d.amountPaise,d.date,d.method,d.reference,fundId)&&d.duplicateReason.length<5)throw new FinanceError('FINANCE_DUPLICATE');
  }
  private allocate(paymentId:string,amount:number,date:string,specific?:PaymentDraft['allocations']):number {
    const payment=this.transaction({id:paymentId});if(payment.kind!=='payment'||payment.status==='reversed'||date<payment.date||amount>payment.creditPaise)throw new FinanceError('FINANCE_ALLOCATION');
    const dues=financeDues(this.db,date,payment.familyId).filter(d=>d.categoryId===payment.categoryId&&d.balancePaise>0);let allocated=0;
    if(specific&&new Set(specific.map(a=>a.dueId)).size!==specific.length)throw new FinanceError('FINANCE_ALLOCATION');
    const allocations=specific??dues.map(d=>{const value=Math.min(d.balancePaise,amount-allocated);allocated+=value;return {dueId:d.id,amountPaise:value};});allocated=0;
    for(const a of allocations){if(!a.amountPaise)continue;const due=dues.find(d=>d.id===a.dueId);if(!due||a.amountPaise>due.balancePaise||allocated+a.amountPaise>amount)throw new FinanceError('FINANCE_ALLOCATION');this.db.prepare('INSERT INTO payment_allocations(id,payment_id,due_id,amount_paise,date,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),paymentId,a.dueId,a.amountPaise,date,now());allocated+=a.amountPaise;}
    return allocated;
  }
  payment(input:unknown){return this.command('accountant','payment.posted',paymentSchema,input,d=>{
    const f=this.household(d.familyId);this.category(d.categoryId,'contribution');this.fund('fund-general');this.duplicate('payment',d,'fund-general');
    if(d.allocation!=='specific'&&d.allocations.length)throw new FinanceError('FINANCE_ALLOCATION');
    const id=this.cash('payment',{...d,fundId:'fund-general',wardId:f.wardId},d.amountPaise);this.db.prepare('INSERT INTO payments(id,received_by) VALUES(?,?)').run(id,d.receivedBy);
    if(d.allocation!=='credit')this.allocate(id,d.amountPaise,d.date,d.allocation==='specific'?d.allocations:undefined);
    this.issueReceipt(id);this.audit('payment.posted',id,d);return this.transaction({id});
  });}
  applyCredit(input:unknown){return this.command('accountant','credit.allocated',creditSchema,input,d=>{const p=this.transaction({id:d.paymentId});const allocatedPaise=this.allocate(p.id,p.creditPaise,d.date);this.audit('credit.allocated',p.id,{allocatedPaise,date:d.date});return {allocatedPaise};});}
  adjust(input:unknown){return this.command('administrator','due.adjusted',adjustmentSchema,input,d=>{
    const due=financeDues(this.db).find(v=>v.id===d.dueId);if(!due)throw new FinanceError('FINANCE_NOT_FOUND');
    const latest=this.db.prepare('SELECT MAX(date) AS date FROM (SELECT date FROM payment_allocations WHERE due_id=? UNION ALL SELECT date FROM financial_adjustments WHERE due_id=?)').get(d.dueId,d.dueId) as {date:string|null};if(d.date<due.periodStart||latest.date&&d.date<latest.date)throw new FinanceError('FINANCE_DATE');
    const amount=d.kind==='increase'?d.amountPaise:-d.amountPaise;if(due.balancePaise+amount<0)throw new FinanceError('FINANCE_ALLOCATION');const id=randomUUID();
    this.db.prepare('INSERT INTO financial_adjustments(id,due_id,kind,amount_paise,date,reason,session_id,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,d.dueId,d.kind,amount,d.date,d.reason,this.session.id,now());this.audit('due.adjusted',id,d);return null;
  });}
  correct(input:unknown){return this.command('administrator','transaction.corrected',correctionSchema,input,d=>{
    const t=this.transaction({id:d.id});if(!['payment','donation','expense'].includes(t.kind)||t.status==='reversed'||d.kind==='refund'&&t.kind!=='payment'||d.kind==='reversal'&&t.refundedPaise>0||d.kind==='reversal'&&d.amountPaise!==t.amountPaise||d.amountPaise>t.amountPaise-t.refundedPaise)throw new FinanceError('FINANCE_STATE');
    const latest=this.db.prepare('SELECT MAX(date) AS date FROM payment_allocations WHERE payment_id=?').get(t.id) as {date:string|null};if(d.date<t.date||latest.date&&d.date<latest.date)throw new FinanceError('FINANCE_DATE');
    if(t.kind==='payment'){
      let release=Math.max(0,d.amountPaise-t.creditPaise);
      const allocations=this.db.prepare('SELECT due_id AS dueId,SUM(amount_paise) AS amount FROM payment_allocations WHERE payment_id=? GROUP BY due_id HAVING amount>0 ORDER BY MAX(date) DESC,MAX(created_at) DESC,due_id DESC').all(t.id) as {dueId:string;amount:number}[];
      for(const a of allocations){const amount=Math.min(release,a.amount);if(amount){this.db.prepare('INSERT INTO payment_allocations(id,payment_id,due_id,amount_paise,date,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),t.id,a.dueId,-amount,d.date,now());release-=amount;}}
      if(release)throw new FinanceError('FINANCE_ALLOCATION');
    }
    const id=this.cash(d.kind,{...t,amountPaise:d.amountPaise,date:d.date,reference:'',notes:d.reason,relatedId:t.id},t.cashPaise>0?-d.amountPaise:d.amountPaise);this.audit('transaction.corrected',id,d);return this.transaction({id});
  });}
  donation(input:unknown){return this.command('accountant','donation.posted',donationSchema,input,d=>{
    this.fund(d.fundId);const family=d.familyId?this.household(d.familyId):null;this.duplicate('donation',d,d.fundId);
    const id=this.cash('donation',{...d,wardId:family?.wardId||'',categoryId:''},d.amountPaise);this.db.prepare('INSERT INTO donations(id,donor,anonymous,received_by) VALUES(?,?,?,?)').run(id,d.anonymous?'':d.donor,+d.anonymous,d.receivedBy);this.issueReceipt(id);this.audit('donation.posted',id,{...d,donor:d.anonymous?'':d.donor});return this.transaction({id});
  });}
  private postExpense(d:ExpenseDraft):string {
    this.fund(d.fundId);this.category(d.categoryId,'expense');this.ward(d.wardId);this.duplicate('expense',d,d.fundId);
    const id=this.cash('expense',{...d,familyId:''},-d.amountPaise);this.db.prepare('INSERT INTO expenses(id,description,payee,bill_reference,authorized_by,recorded_by) VALUES(?,?,?,?,?,?)').run(id,d.description,d.payee,d.billReference,d.authorizedBy,d.recordedBy);return id;
  }
  expense(input:unknown){return this.command('accountant','expense.recorded',expenseSchema,input,d=>{
    this.fund(d.fundId);const category=this.category(d.categoryId,'expense');this.ward(d.wardId);const config=financeConfig(this.db);
    if(config.approveAllExpenses||category.requiresApproval||d.amountPaise>=config.approvalThresholdPaise){
      const id=randomUUID();this.db.prepare('INSERT INTO expense_requests(id,amount_paise,date,method,reference,notes,duplicate_reason,fund_id,category_id,ward_id,description,payee,bill_reference,authorized_by,recorded_by,session_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,d.amountPaise,d.date,d.method,d.reference,d.notes,d.duplicateReason,d.fundId,d.categoryId,d.wardId||null,d.description,d.payee,d.billReference,d.authorizedBy,d.recordedBy,this.session.id,now());this.audit('expense.requested',id,d);return {id,pending:true};
    }
    const id=this.postExpense(d);this.audit('expense.posted',id,d);return {id,pending:false};
  });}
  decideExpense(input:unknown){return this.command('administrator','expense.decided',expenseDecisionSchema,input,d=>{
    const request=pendingExpenses(this.db).find(r=>r.id===d.id);if(!request||request.status!=='pending')throw new FinanceError('FINANCE_STATE');
    const id=d.decision==='approve'?this.postExpense({...request,key:d.key,confirmation:'CONFIRM DEMO FINANCE'}):'';
    this.db.prepare('INSERT INTO expense_decisions(id,request_id,decision,reason,transaction_id,session_id,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),d.id,d.decision,d.reason,id||null,this.session.id,now());this.audit('expense.decided',d.id,{...d,transactionId:id});return {id:id||d.id,pending:false};
  });}
  saveFund(input:unknown){return this.command('administrator','fund.saved',fundSchema,input,d=>{
    let id=d.id;if(id){const old=this.fund(id,false);if(old.revision!==d.revision)throw new FinanceError('FINANCE_STALE');if(old.restricted!==d.restricted&&this.db.prepare('SELECT 1 FROM financial_transactions WHERE fund_id=?').get(id)||id==='fund-general'&&d.restricted)throw new FinanceError('FINANCE_STATE');this.db.prepare('UPDATE funds SET name=?,name_ml=?,restricted=?,active=?,revision=revision+1 WHERE id=?').run(d.name,d.nameMl,+d.restricted,+d.active,id);}
    else{id=randomUUID();this.db.prepare('INSERT INTO funds(id,name,name_ml,restricted,active) VALUES(?,?,?,?,?)').run(id,d.name,d.nameMl,+d.restricted,+d.active);}
    this.audit('fund.saved',id,d);return this.fund(id,false);
  });}
  saveCategory(input:unknown){return this.command('administrator','category.saved',financeCategorySchema,input,d=>{
    let id=d.id;if(id){const old=this.category(id,d.kind,false);if(old.revision!==d.revision)throw new FinanceError('FINANCE_STALE');this.db.prepare('UPDATE finance_categories SET name=?,name_ml=?,active=?,requires_approval=?,revision=revision+1 WHERE id=?').run(d.name,d.nameMl,+d.active,+d.requiresApproval,id);}
    else{id=randomUUID();this.db.prepare('INSERT INTO finance_categories(id,kind,name,name_ml,active,requires_approval) VALUES(?,?,?,?,?,?)').run(id,d.kind,d.name,d.nameMl,+d.active,+d.requiresApproval);}
    this.audit('category.saved',id,d);return this.category(id,d.kind,false);
  });}
  saveConfig(input:unknown){return this.command('administrator','finance.config',financeConfigSchema,input,d=>{if(financeConfig(this.db).revision!==d.revision)throw new FinanceError('FINANCE_STALE');this.db.prepare('UPDATE finance_settings SET receipt_prefix=?,approval_threshold_paise=?,approve_all_expenses=?,revision=revision+1 WHERE id=1').run(d.receiptPrefix,d.approvalThresholdPaise,+d.approveAllExpenses);this.audit('finance.config','1',d);return financeConfig(this.db);});}
  setLogo(logo:string,revision:number){this.require('administrator');return this.db.transaction(()=>{if(financeConfig(this.db).revision!==revision)throw new FinanceError('FINANCE_STALE');this.db.prepare('UPDATE finance_settings SET logo=?,revision=revision+1 WHERE id=1').run(logo);this.audit('finance.logo','1',{removed:!logo});return financeConfig(this.db);}).immediate();}
  private issueReceipt(id:string){
    const t=this.transaction({id});const config=financeConfig(this.db);const year=Number(t.date.slice(0,4));
    this.db.prepare('INSERT INTO receipt_sequences(year,next_number) VALUES(?,1) ON CONFLICT(year) DO NOTHING').run(year);
    const sequence=(this.db.prepare('SELECT next_number AS number FROM receipt_sequences WHERE year=?').get(year) as {number:number}).number;
    this.db.prepare('UPDATE receipt_sequences SET next_number=next_number+1 WHERE year=?').run(year);
    const f=t.familyId?this.household(t.familyId):null;const mosque=this.db.prepare('SELECT name,name_ml AS nameMl,address,contact FROM mosque_settings WHERE id=1').get() as ReceiptSnapshot['mosque'];
    const lines=t.kind==='payment'?this.db.prepare(`SELECT c.name||' '||c.name_ml AS category,d.period,a.amount_paise AS amountPaise FROM payment_allocations a JOIN dues d ON d.id=a.due_id JOIN finance_categories c ON c.id=d.category_id WHERE a.payment_id=? ORDER BY d.due_date,d.id`).all(id) as ReceiptSnapshot['lines']:[{category:t.fund,period:'',amountPaise:t.amountPaise}];
    if(t.creditPaise)lines.push({category:'advanceCredit',period:'',amountPaise:t.creditPaise});
    const snapshot:ReceiptSnapshot={mosque,logo:config.logo,familyCode:f?.familyCode||'',ward:f?.ward||'',house:f?.house||'',guardian:f?.guardian||'',donor:t.donor,anonymous:t.anonymous,date:t.date,method:t.method,reference:t.reference,receivedBy:t.receivedBy,totalPaise:t.amountPaise,remainingPaise:f?this.family({id:f.id}).outstandingPaise:0,lines};
    this.db.prepare('INSERT INTO receipts(id,number,transaction_id,snapshot,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),`${config.receiptPrefix}-R-${year}-${String(sequence).padStart(6,'0')}`,id,JSON.stringify(snapshot),now());
  }
  async receipt(input:unknown):Promise<FinanceReceipt>{
    this.require();const {id}=financeIdSchema.parse(input);const row=this.db.prepare('SELECT id,number,transaction_id AS transactionId,snapshot FROM receipts WHERE id=?').get(id) as {id:string;number:string;transactionId:string;snapshot:string}|undefined;if(!row)throw new FinanceError('FINANCE_NOT_FOUND');const t=this.transaction({id:row.transactionId});const verification=`mosque-suite:receipt:${row.id}`;
    return {...row,snapshot:JSON.parse(row.snapshot) as ReceiptSnapshot,status:t.status,refundPaise:t.refundedPaise,verification,qr:await QRCode.toDataURL(verification,{errorCorrectionLevel:'M',margin:4,width:160})};
  }
  dashboard(input:unknown){this.require();return financialDashboard(this.db,financeFilterSchema.parse(input));}
  report(input:unknown){this.require();const request=financeReportSchema.parse(input);if(request.familyId)this.household(request.familyId);return financialReport(this.db,request);}
  async backup(destination:string){this.require('administrator');const source=resolve(this.db.name).toLowerCase();if([source,`${source}-wal`,`${source}-shm`].includes(resolve(destination).toLowerCase()))throw new FinanceError('FINANCE_INVALID');await this.db.backup(destination);this.audit('backup.created','snapshot');}
}
