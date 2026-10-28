import type Database from 'better-sqlite3';
import type { FinanceDashboard, FinanceFilters, FinanceReport, FinanceReportRequest, FinanceTransaction } from '../../shared/finance';
import { financeDues, financeFunds, financeTransactions, matchesFinance } from './finance-queries';

const sum=<T>(rows:T[],amount:(row:T)=>number)=>rows.reduce((s,r)=>s+amount(r),0);
function flows(rows:FinanceTransaction[]){return {
  collectedPaise:sum(rows.filter(t=>t.kind==='payment'),t=>t.amountPaise),donationPaise:sum(rows.filter(t=>t.kind==='donation'),t=>t.amountPaise),
  expensePaise:sum(rows.filter(t=>t.kind==='expense'),t=>t.amountPaise),refundPaise:sum(rows.filter(t=>t.kind==='refund'),t=>t.amountPaise),
  reversalPaise:sum(rows.filter(t=>t.kind==='reversal'),t=>t.cashPaise),netCashPaise:sum(rows,t=>t.cashPaise),
};}
export function financialDashboard(db:Database.Database,f:FinanceFilters):FinanceDashboard {
  const dues=financeDues(db,f.until).filter(d=>d.dueDate<=f.until&&matchesFinance(d,f));const period=dues.filter(d=>d.dueDate>=f.from);
  const transactions=financeTransactions(db,f.until).filter(t=>t.date>=f.from&&matchesFinance(t,f));
  const billedPaise=sum(period,d=>d.adjustedPaise);const settledPaise=sum(period,d=>d.paidPaise);
  const wards=[...new Set(dues.map(d=>d.ward))].map(ward=>({ward,billedPaise:sum(period.filter(d=>d.ward===ward),d=>d.adjustedPaise),paidPaise:sum(period.filter(d=>d.ward===ward),d=>d.paidPaise),outstandingPaise:sum(dues.filter(d=>d.ward===ward),d=>d.balancePaise)}));
  return {billedPaise,settledPaise,outstandingPaise:sum(dues,d=>d.balancePaise),overduePaise:sum(dues.filter(d=>d.overdue),d=>d.balancePaise),collectionPercent:billedPaise?Math.round(settledPaise/billedPaise*10000)/100:0,...flows(transactions),wards,recent:transactions.slice(0,10)};
}
export function financialReport(db:Database.Database,request:FinanceReportRequest):FinanceReport {
  // Statements reconcile the entire selected household. Only dates narrow them;
  // slicing payment and charge text independently can invent credit balances.
  const f=request.kind==='statement'?{...request.filters,wardId:'',categoryId:'',search:''}:request.filters;const all=financeTransactions(db,f.until,request.familyId).filter(t=>matchesFinance(t,f));const transactions=all.filter(t=>t.date>=f.from);
  const dues=financeDues(db,f.until,request.familyId).filter(d=>(request.kind==='statement'||d.dueDate<=f.until)&&matchesFinance(d,f));
  let columns:FinanceReport['columns']=[];let rows:FinanceReport['rows']=[];let basis='cashBasis';
  const col=(key:string,money=false)=>({key,label:key,money});
  if(request.kind==='daily'||request.kind==='methods'){
    const field=request.kind==='daily'?'date':'method';columns=[col(field),...['collectedPaise','donationPaise','expensePaise','refundPaise','reversalPaise','netCashPaise'].map(k=>col(k,true))];
    rows=[...new Set(transactions.map(t=>t[field]))].sort().map(value=>({[field]:value,...flows(transactions.filter(t=>t[field]===value))}));
  }else if(request.kind==='monthly'){
    basis='duesBasis';columns=[col('period'),col('billedPaise',true),col('adjustmentPaise',true),col('settledPaise',true),col('outstandingPaise',true)];
    const period=dues.filter(d=>d.dueDate>=f.from);rows=[...new Set(period.map(d=>d.period))].sort().map(value=>{const group=period.filter(d=>d.period===value);return {period:value,billedPaise:sum(group,d=>d.amountPaise),adjustmentPaise:sum(group,d=>d.adjustedPaise-d.amountPaise),settledPaise:sum(group,d=>d.paidPaise),outstandingPaise:sum(group,d=>d.balancePaise)};});
  }else if(request.kind==='wards'){
    basis='wardBasis';columns=[col('ward'),col('billedPaise',true),col('collectedPaise',true),col('refundPaise',true),col('outstandingPaise',true),col('netCashPaise',true)];
    rows=[...new Set([...dues.map(d=>d.ward),...transactions.map(t=>t.ward||'unassigned')])].sort().map(ward=>{const ds=dues.filter(d=>d.ward===ward);const ts=transactions.filter(t=>(t.ward||'unassigned')===ward);return {ward,billedPaise:sum(ds.filter(d=>d.dueDate>=f.from),d=>d.adjustedPaise),...flows(ts),outstandingPaise:sum(ds,d=>d.balancePaise)};});
  }else if(request.kind==='outstanding'||request.kind==='overdue'){
    basis='balanceBasis';columns=[col('familyCode'),col('guardian'),col('ward'),col('outstandingPaise',true),col('overduePaise',true)];
    const outstanding=dues.filter(d=>d.balancePaise>0&&(request.kind!=='overdue'||d.overdue));rows=[...new Set(outstanding.map(d=>d.familyId))].map(id=>{const ds=outstanding.filter(d=>d.familyId===id);return {familyCode:ds[0].familyCode,guardian:ds[0].guardian,ward:ds[0].ward,outstandingPaise:sum(ds,d=>d.balancePaise),overduePaise:sum(ds.filter(d=>d.overdue),d=>d.balancePaise)};});
  }else if(request.kind==='funds'){
    basis='fundBasis';columns=[col('fund'),col('restriction'),col('openingPaise',true),col('inflowPaise',true),col('outflowPaise',true),col('closingPaise',true)];
    rows=financeFunds(db,f.until).map(fund=>{const ts=all.filter(t=>t.fundId===fund.id);const period=ts.filter(t=>t.date>=f.from);return {fund:`${fund.name} ${fund.nameMl}`,restriction:fund.restricted?'restricted':'unrestricted',openingPaise:sum(ts.filter(t=>t.date<f.from),t=>t.cashPaise),inflowPaise:sum(period.filter(t=>t.cashPaise>0),t=>t.cashPaise),outflowPaise:sum(period.filter(t=>t.cashPaise<0),t=>-t.cashPaise),closingPaise:sum(ts,t=>t.cashPaise)};});
  }else if(request.kind==='statement'){
    basis='statementBasis';columns=[col('date'),col('description'),col('billedPaise',true),col('settledPaise',true),col('netCashPaise',true),col('outstandingPaise',true),col('creditPaise',true)];
    type Entry={date:string;description:string;billedPaise:number;settledPaise:number;netCashPaise:number;creditMovement?:number;order:number};const entries:Entry[]=[];
    for(const due of dues)entries.push({date:due.periodStart,description:`${due.planName} ${due.planNameMl} · ${due.period}`,billedPaise:due.amountPaise,settledPaise:0,netCashPaise:0,order:0});
    const allowed=new Set(dues.map(d=>d.id));
    const adjustments=db.prepare('SELECT due_id AS dueId,date,kind,reason,amount_paise AS amount FROM financial_adjustments WHERE date<=?').all(f.until) as {dueId:string;date:string;kind:string;reason:string;amount:number}[];
    for(const a of adjustments)if(allowed.has(a.dueId))entries.push({date:a.date,description:`${a.kind}: ${a.reason}`,billedPaise:a.amount,settledPaise:0,netCashPaise:0,order:1});
    for(const t of all)entries.push({date:t.date,description:`${t.kind} · ${t.receiptNumber||t.id}`,billedPaise:0,settledPaise:0,netCashPaise:t.cashPaise,creditMovement:t.kind==='payment'||t.relatedId&&all.some(p=>p.id===t.relatedId&&p.kind==='payment')?t.cashPaise:0,order:2});
    const allocations=db.prepare('SELECT due_id AS dueId,date,amount_paise AS amount FROM payment_allocations WHERE date<=?').all(f.until) as {dueId:string;date:string;amount:number}[];
    for(const a of allocations)if(allowed.has(a.dueId))entries.push({date:a.date,description:a.amount>0?'allocation':'allocationReleased',billedPaise:0,settledPaise:a.amount,netCashPaise:0,order:3});
    entries.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order);let outstanding=0;let credit=0;
    for(const e of entries.filter(e=>e.date<f.from)){outstanding+=e.billedPaise-e.settledPaise;credit+=(e.creditMovement??0)-e.settledPaise;}
    rows.push({date:f.from,description:'openingBalance',billedPaise:0,settledPaise:0,netCashPaise:0,outstandingPaise:outstanding,creditPaise:credit});
    // A refund and its released allocations are one atomic operation. Aggregate
    // each day's movements so the statement never shows an artificial overdraft
    // between the two sides of that operation.
    for(const date of [...new Set(entries.filter(e=>e.date>=f.from).map(e=>e.date))]){const group=entries.filter(e=>e.date===date);const billedPaise=sum(group,e=>e.billedPaise);const settledPaise=sum(group,e=>e.settledPaise);const netCashPaise=sum(group,e=>e.netCashPaise);outstanding+=billedPaise-settledPaise;credit+=sum(group,e=>e.creditMovement??0)-settledPaise;rows.push({date,description:[...new Set(group.map(e=>e.description))].join(' · '),billedPaise,settledPaise,netCashPaise,outstandingPaise:outstanding,creditPaise:credit});}
  }else{
    const kind=request.kind==='donations'?'donation':request.kind==='expenses'?'expense':null;
    columns=[col('date'),col('kind'),col('receiptNumber'),col(kind==='donation'?'donor':kind==='expense'?'payee':'familyCode'),col('fund'),col('method'),col('reference'),col('netCashPaise',true)];
    if(kind==='expense')columns.splice(4,0,col('category'),col('description'),col('billReference'),col('authorizedBy'),col('recordedBy'));
    rows=transactions.filter(t=>!kind||t.kind===kind||t.relatedId&&all.find(o=>o.id===t.relatedId)?.kind===kind).map(t=>{const source=t.relatedId?all.find(o=>o.id===t.relatedId)??t:t;return {date:t.date,kind:t.kind,receiptNumber:t.receiptNumber||t.id,donor:source.anonymous?'anonymous':source.donor,payee:source.payee,familyCode:t.familyCode,description:source.description,category:source.category,billReference:source.billReference,authorizedBy:source.authorizedBy,recordedBy:source.recordedBy,fund:t.fund,method:t.method,reference:t.reference,netCashPaise:t.cashPaise};});
  }
  const totals:Record<string,number>={};for(const c of columns)if(c.money)totals[c.key]=request.kind==='statement'&&['outstandingPaise','creditPaise'].includes(c.key)?Number(rows.at(-1)?.[c.key]??0):sum(rows,r=>Number(r[c.key]??0));
  const scope:string[]=[];
  if(request.familyId){const family=db.prepare("SELECT w.code||'/'||f.family_number||' · '||f.house_name||' '||f.house_name_ml AS label FROM families f JOIN wards w ON w.id=f.ward_id WHERE f.id=?").get(request.familyId) as {label:string}|undefined;scope.push(`Family / കുടുംബം: ${family?.label??request.familyId}`);}
  if(f.wardId){const ward=db.prepare('SELECT name||\' \'||name_ml AS label FROM wards WHERE id=?').get(f.wardId) as {label:string}|undefined;scope.push(`Ward / വാർഡ്: ${ward?.label??f.wardId}`);}
  if(f.categoryId){const category=db.prepare('SELECT name||\' \'||name_ml AS label FROM finance_categories WHERE id=?').get(f.categoryId) as {label:string}|undefined;scope.push(`Category / വിഭാഗം: ${category?.label??f.categoryId}`);}
  if(f.search)scope.push(`Search / തിരയുക: ${f.search}`);
  return {kind:request.kind,filters:f,scope,columns,rows,totals,generatedAt:new Date().toISOString(),basis};
}
