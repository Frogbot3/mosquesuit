import type Database from 'better-sqlite3';
import type { Assignment, Due, ExpenseRequest, FinanceCategory, FinanceConfig, FinanceFilters, FinanceTransaction, Fund, Plan } from '../../shared/finance';
import { todayInIndia } from '../../shared/registration';

export function financeConfig(db:Database.Database):FinanceConfig {
  const r=db.prepare('SELECT revision,receipt_prefix AS receiptPrefix,approval_threshold_paise AS approvalThresholdPaise,approve_all_expenses AS approveAllExpenses,logo FROM finance_settings WHERE id=1').get() as FinanceConfig;
  return {...r,approveAllExpenses:Boolean(r.approveAllExpenses)};
}
export function financeCategories(db:Database.Database):FinanceCategory[] {
  return (db.prepare('SELECT id,kind,name,name_ml AS nameMl,active,requires_approval AS requiresApproval,revision FROM finance_categories ORDER BY kind,name').all() as FinanceCategory[]).map(r=>({...r,active:Boolean(r.active),requiresApproval:Boolean(r.requiresApproval)}));
}
export function financeFunds(db:Database.Database,until='2199-12-31'):Fund[] {
  return (db.prepare(`SELECT f.id,f.name,f.name_ml AS nameMl,f.restricted,f.active,f.revision,COALESCE((SELECT SUM(cash_paise) FROM financial_transactions t WHERE t.fund_id=f.id AND t.date<=?),0) AS balancePaise FROM funds f ORDER BY name`).all(until) as Fund[]).map(r=>({...r,active:Boolean(r.active),restricted:Boolean(r.restricted)}));
}
export function financePlans(db:Database.Database,asOf?:string):Plan[] {
  const rows=db.prepare(`SELECT p.id,p.frequency,p.category_id AS categoryId,v.id AS versionId,v.revision,v.name,v.name_ml AS nameMl,v.description,v.amount_paise AS amountPaise,v.effective_date AS effectiveDate,v.due_day AS dueDay,v.due_month AS dueMonth,v.active,COALESCE(v.ward_id,'') AS wardId,v.registered_only AS registeredOnly,v.require_living AS requireLiving FROM contribution_plans p JOIN contribution_plan_versions v ON v.plan_id=p.id WHERE v.effective_date=(SELECT MAX(effective_date) FROM contribution_plan_versions WHERE plan_id=p.id AND effective_date<=?) ORDER BY v.name`).all(asOf??'2199-12-31') as Plan[];
  return rows.map(r=>({...r,active:Boolean(r.active),registeredOnly:Boolean(r.registeredOnly),requireLiving:Boolean(r.requireLiving)}));
}
export function financeAssignments(db:Database.Database,familyId:string):Assignment[] {
  return db.prepare(`SELECT a.id,a.family_id AS familyId,a.plan_id AS planId,a.effective_date AS effectiveDate,a.mode,a.amount_paise AS amountPaise,a.reason,v.name AS planName,v.name_ml AS planNameMl FROM family_contribution_assignments a JOIN contribution_plan_versions v ON v.plan_id=a.plan_id AND v.revision=(SELECT MAX(revision) FROM contribution_plan_versions WHERE plan_id=a.plan_id) WHERE a.family_id=? ORDER BY a.effective_date DESC`).all(familyId) as Assignment[];
}
export function financeDues(db:Database.Database,until='2199-12-31',familyId=''):Due[] {
  const rows=db.prepare(`SELECT d.id,d.family_id AS familyId,fw.code||'/'||f.family_number AS familyCode,f.house_name||' '||f.house_name_ml AS house,m.name||' '||m.name_ml AS guardian,d.ward_id AS wardId,w.name||' '||w.name_ml AS ward,d.plan_id AS planId,v.name AS planName,v.name_ml AS planNameMl,d.category_id AS categoryId,c.name||' '||c.name_ml AS category,d.period,d.period_start AS periodStart,d.due_date AS dueDate,d.amount_paise AS amountPaise,d.amount_paise+COALESCE((SELECT SUM(amount_paise) FROM financial_adjustments a WHERE a.due_id=d.id AND a.date<=@until),0) AS adjustedPaise,COALESCE((SELECT SUM(amount_paise) FROM payment_allocations a WHERE a.due_id=d.id AND a.date<=@until),0) AS paidPaise FROM dues d JOIN families f ON f.id=d.family_id JOIN wards fw ON fw.id=f.ward_id JOIN members m ON m.id=f.guardian_member_id JOIN wards w ON w.id=d.ward_id JOIN contribution_plan_versions v ON v.id=d.version_id JOIN finance_categories c ON c.id=d.category_id WHERE d.period_start<=@until AND (@familyId='' OR d.family_id=@familyId) ORDER BY d.due_date,d.period,d.id`).all({until,familyId}) as Due[];
  const cutoff=until<todayInIndia()?until:todayInIndia();
  return rows.map(r=>({...r,balancePaise:r.adjustedPaise-r.paidPaise,overdue:r.dueDate<cutoff&&r.adjustedPaise>r.paidPaise}));
}
export function financeTransactions(db:Database.Database,until='2199-12-31',familyId='',transactionId=''):FinanceTransaction[] {
  const rows=db.prepare(`SELECT t.id,t.kind,t.amount_paise AS amountPaise,t.cash_paise AS cashPaise,t.date,t.method,t.reference,t.notes,COALESCE(t.family_id,'') AS familyId,COALESCE(fw.code||'/'||f.family_number,'') AS familyCode,COALESCE(t.ward_id,'') AS wardId,COALESCE(w.name||' '||w.name_ml,'') AS ward,COALESCE(t.category_id,'') AS categoryId,COALESCE(c.name||' '||c.name_ml,'') AS category,t.fund_id AS fundId,u.name||' '||u.name_ml AS fund,COALESCE(t.related_id,'') AS relatedId,
      CASE WHEN EXISTS(SELECT 1 FROM financial_transactions r WHERE r.related_id=t.id AND r.kind='reversal' AND r.date<=@until) THEN 'reversed' WHEN COALESCE((SELECT SUM(amount_paise) FROM financial_transactions r WHERE r.related_id=t.id AND r.kind='refund' AND r.date<=@until),0)>=t.amount_paise THEN 'refunded' WHEN EXISTS(SELECT 1 FROM financial_transactions r WHERE r.related_id=t.id AND r.kind='refund' AND r.date<=@until) THEN 'part_refunded' ELSE 'posted' END AS status,
      COALESCE(rc.id,'') AS receiptId,COALESCE(rc.number,'') AS receiptNumber,
      CASE WHEN t.kind='payment' THEN t.amount_paise+COALESCE((SELECT SUM(cash_paise) FROM financial_transactions r WHERE r.related_id=t.id AND r.date<=@until),0)-COALESCE((SELECT SUM(amount_paise) FROM payment_allocations a WHERE a.payment_id=t.id AND a.date<=@until),0) ELSE 0 END AS creditPaise,
      COALESCE((SELECT SUM(amount_paise) FROM financial_transactions r WHERE r.related_id=t.id AND r.kind='refund' AND r.date<=@until),0) AS refundedPaise,
      COALESCE(p.received_by,n.received_by,'') AS receivedBy,COALESCE(n.donor,'') AS donor,COALESCE(n.anonymous,0) AS anonymous,COALESCE(e.payee,'') AS payee,COALESCE(e.description,'') AS description,COALESCE(e.authorized_by,'') AS authorizedBy,COALESCE(e.recorded_by,'') AS recordedBy,COALESCE(e.bill_reference,'') AS billReference
      FROM financial_transactions t LEFT JOIN families f ON f.id=t.family_id LEFT JOIN wards fw ON fw.id=f.ward_id LEFT JOIN wards w ON w.id=t.ward_id LEFT JOIN finance_categories c ON c.id=t.category_id JOIN funds u ON u.id=t.fund_id LEFT JOIN receipts rc ON rc.transaction_id=t.id LEFT JOIN payments p ON p.id=t.id LEFT JOIN donations n ON n.id=t.id LEFT JOIN expenses e ON e.id=t.id WHERE t.date<=@until AND (@familyId='' OR t.family_id=@familyId) AND (@transactionId='' OR t.id=@transactionId) ORDER BY t.date DESC,t.sequence DESC`).all({until,familyId,transactionId}) as FinanceTransaction[];
  return rows.map(r=>({...r,anonymous:Boolean(r.anonymous)}));
}
export function pendingExpenses(db:Database.Database):ExpenseRequest[] {
  return db.prepare(`SELECT r.id,r.amount_paise AS amountPaise,r.date,r.method,r.reference,r.notes,r.duplicate_reason AS duplicateReason,r.fund_id AS fundId,r.category_id AS categoryId,COALESCE(r.ward_id,'') AS wardId,r.description,r.payee,r.bill_reference AS billReference,r.authorized_by AS authorizedBy,r.recorded_by AS recordedBy,CASE WHEN d.decision='approve' THEN 'approved' WHEN d.decision='reject' THEN 'rejected' ELSE 'pending' END AS status,COALESCE(d.transaction_id,'') AS transactionId FROM expense_requests r LEFT JOIN expense_decisions d ON d.request_id=r.id ORDER BY (d.id IS NULL) DESC,r.created_at DESC`).all() as ExpenseRequest[];
}
export function matchesFinance(row:{wardId:string;categoryId:string},filters:FinanceFilters):boolean {
  return (!filters.wardId||row.wardId===filters.wardId)&&(!filters.categoryId||row.categoryId===filters.categoryId)&&(!filters.search||JSON.stringify(row).normalize('NFC').toLocaleLowerCase().includes(filters.search.normalize('NFC').toLocaleLowerCase()));
}
