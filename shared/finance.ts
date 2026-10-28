import { z } from 'zod';
import type { Result, Settings } from './contracts';
import { todayInIndia } from './registration';

export const MAX_PAISE = 100_000_000_000;
const text = (max: number) => z.string().trim().transform(v => v.normalize('NFC')).pipe(z.string().max(max).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v), 'invalid'));
const required = (max: number) => text(max).pipe(z.string().min(1, 'required'));
export const paise = z.number().int().min(0).max(MAX_PAISE);
export const positivePaise = paise.refine(v => v > 0, 'amountInvalid');
export const financeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {const date=new Date(`${v}T00:00:00Z`);return v >= '1900-01-01' && v <= '2199-12-31' && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === v;}, 'dateInvalid');
export const postedDate = financeDate.refine(v => v <= todayInIndia(), 'futureDate');
const month = z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/);
const optionalId = z.union([z.uuid(),z.literal('')]);
const reference = text(100).transform(v => v.toUpperCase());
export const methods = ['cash','upi','bank','cheque','other'] as const;
export const financeRoles = ['administrator','accountant','viewer'] as const;
export type FinanceRole = typeof financeRoles[number];
const key = z.uuid();
const confirm = z.literal('CONFIRM DEMO FINANCE');
export const financeIdSchema = z.object({id:z.uuid()}).strict();
export const financeRoleSchema = z.object({role:z.enum(financeRoles)}).strict();

export const planSchema = z.object({
  key,id:optionalId,revision:z.number().int().nonnegative(),name:required(100),nameMl:text(100),description:text(500),
  categoryId:required(80),amountPaise:positivePaise,frequency:z.enum(['monthly','annual','once']),
  effectiveDate:financeDate,dueDay:z.number().int().min(1).max(28),dueMonth:z.number().int().min(1).max(12),
  active:z.boolean(),wardId:text(80),registeredOnly:z.boolean(),requireLiving:z.boolean(),
}).strict().superRefine((v,c)=>{
  if(v.frequency==='monthly'&&!v.effectiveDate.endsWith('-01')||v.frequency==='annual'&&!v.effectiveDate.endsWith('-01-01'))c.addIssue({code:'custom',path:['effectiveDate'],message:'periodBoundary'});
});
export const assignmentSchema = z.object({key,familyId:z.uuid(),planId:z.uuid(),effectiveDate:financeDate,mode:z.enum(['standard','override','discount','waived','paused']),amountPaise:paise,reason:required(500)}).strict();
export const policySchema = z.object({key,familyId:z.uuid(),active:z.boolean(),exempt:z.boolean(),reason:required(500)}).strict();
export const generateSchema = z.object({key,planId:optionalId,from:month,until:month,confirmation:confirm}).strict().refine(v=>v.from<=v.until&&(Number(v.until.slice(0,4))-Number(v.from.slice(0,4)))*12+Number(v.until.slice(5))-Number(v.from.slice(5))<24,'rangeInvalid');
export const allocationSchema = z.object({dueId:z.uuid(),amountPaise:positivePaise}).strict();
const cashFields = {key,amountPaise:positivePaise,date:postedDate,method:z.enum(methods),reference,notes:text(2000),duplicateReason:text(500),confirmation:confirm};
export const paymentSchema = z.object({...cashFields,familyId:z.uuid(),categoryId:required(80),receivedBy:required(100),allocation:z.enum(['oldest','specific','credit']),allocations:z.array(allocationSchema).max(200)}).strict();
export const creditSchema = z.object({key,paymentId:z.uuid(),date:postedDate,confirmation:confirm}).strict();
export const adjustmentSchema = z.object({key,dueId:z.uuid(),kind:z.enum(['waiver','increase','decrease']),amountPaise:positivePaise,date:postedDate,reason:required(500),confirmation:confirm}).strict();
export const correctionSchema = z.object({key,id:z.uuid(),kind:z.enum(['reversal','refund']),amountPaise:positivePaise,date:postedDate,reason:required(500),confirmation:confirm}).strict();
export const fundSchema = z.object({key,id:text(80),revision:z.number().int().nonnegative(),name:required(100),nameMl:text(100),restricted:z.boolean(),active:z.boolean()}).strict();
export const financeCategorySchema = z.object({key,id:text(80),revision:z.number().int().nonnegative(),kind:z.enum(['contribution','expense']),name:required(100),nameMl:text(100),active:z.boolean(),requiresApproval:z.boolean()}).strict();
export const donationSchema = z.object({...cashFields,fundId:required(80),familyId:optionalId,donor:text(150),anonymous:z.boolean(),receivedBy:required(100)}).strict().refine(v=>!v.anonymous||!v.familyId,'anonymousFamily');
export const expenseSchema = z.object({...cashFields,fundId:required(80),categoryId:required(80),wardId:text(80),description:required(500),payee:required(150),billReference:text(200),authorizedBy:required(100),recordedBy:required(100)}).strict();
export const expenseDecisionSchema = z.object({key,id:z.uuid(),decision:z.enum(['approve','reject']),reason:required(500),confirmation:confirm}).strict();
export const financeConfigSchema = z.object({key,revision:z.number().int().nonnegative(),receiptPrefix:z.string().regex(/^[A-Z0-9-]{1,12}$/),approvalThresholdPaise:paise,approveAllExpenses:z.boolean()}).strict();
export const financeFilterSchema = z.object({from:financeDate,until:financeDate,wardId:text(80),categoryId:text(80),search:text(120)}).strict().refine(v=>v.from<=v.until,'rangeInvalid');
export const reportKinds = ['daily','monthly','wards','outstanding','overdue','donations','expenses','funds','methods','ledger','statement'] as const;
export const financeReportSchema = z.object({kind:z.enum(reportKinds),filters:financeFilterSchema,familyId:optionalId}).strict().refine(v=>v.kind!=='statement'||Boolean(v.familyId),'required');
export const financeOutputSchema = z.discriminatedUnion('document',[
  z.object({document:z.literal('receipt'),id:z.uuid(),format:z.enum(['pdf','print']),layout:z.enum(['a4','compact'])}).strict(),
  z.object({document:z.literal('report'),report:financeReportSchema,format:z.enum(['pdf','print','csv','xlsx']),layout:z.literal('a4')}).strict(),
]);
export const financeLogoSchema = z.object({revision:z.number().int().nonnegative(),remove:z.boolean()}).strict();

export type PlanDraft = z.infer<typeof planSchema>;
export type AssignmentDraft = z.infer<typeof assignmentSchema>;
export type PaymentDraft = z.infer<typeof paymentSchema>;
export type DonationDraft = z.infer<typeof donationSchema>;
export type ExpenseDraft = z.infer<typeof expenseSchema>;
export type FinanceFilters = z.infer<typeof financeFilterSchema>;
export type FinanceReportRequest = z.infer<typeof financeReportSchema>;
export type FinanceOutputRequest = z.infer<typeof financeOutputSchema>;
export interface Plan extends Omit<PlanDraft,'key'> {versionId:string}
export interface Assignment extends Omit<AssignmentDraft,'key'> {id:string;planName:string;planNameMl:string}
export interface FinanceCategory extends Omit<z.infer<typeof financeCategorySchema>,'key'> {}
export interface Fund extends Omit<z.infer<typeof fundSchema>,'key'> {balancePaise:number}
export interface FinanceConfig {revision:number;receiptPrefix:string;approvalThresholdPaise:number;approveAllExpenses:boolean;logo:string}
export interface FinanceSession {id:string;role:FinanceRole;fictional:true}
export interface ExpenseRequest extends Omit<ExpenseDraft,'confirmation'|'key'> {id:string;status:'pending'|'approved'|'rejected';transactionId:string}
export interface FinanceSetup {session:FinanceSession;plans:Plan[];categories:FinanceCategory[];funds:Fund[];config:FinanceConfig;pendingExpenses:ExpenseRequest[]}
export interface Due {id:string;familyId:string;familyCode:string;house:string;guardian:string;wardId:string;ward:string;planId:string;planName:string;planNameMl:string;categoryId:string;category:string;period:string;periodStart:string;dueDate:string;amountPaise:number;adjustedPaise:number;paidPaise:number;balancePaise:number;overdue:boolean}
export interface FinanceTransaction {id:string;kind:'payment'|'donation'|'expense'|'reversal'|'refund';amountPaise:number;cashPaise:number;date:string;method:typeof methods[number];reference:string;notes:string;familyId:string;familyCode:string;wardId:string;ward:string;categoryId:string;category:string;fundId:string;fund:string;relatedId:string;status:'posted'|'reversed'|'part_refunded'|'refunded';receiptId:string;receiptNumber:string;creditPaise:number;refundedPaise:number;receivedBy:string;donor:string;anonymous:boolean;payee:string;description:string;authorizedBy:string;recordedBy:string;billReference:string}
export interface FinanceAdjustment {id:string;dueId:string;kind:string;amountPaise:number;date:string;reason:string}
export interface FamilyFinance {id:string;familyCode:string;active:boolean;exempt:boolean;currentPlans:(Plan&{mode:string;effectiveAmountPaise:number})[];assignments:Assignment[];dues:Due[];transactions:FinanceTransaction[];adjustments:FinanceAdjustment[];outstandingPaise:number;creditPaise:number;netPaidPaise:number}
export interface FinanceDashboard {billedPaise:number;settledPaise:number;outstandingPaise:number;overduePaise:number;collectedPaise:number;refundPaise:number;donationPaise:number;expensePaise:number;reversalPaise:number;netCashPaise:number;collectionPercent:number;wards:{ward:string;billedPaise:number;paidPaise:number;outstandingPaise:number}[];recent:FinanceTransaction[]}
export interface FinanceReport {kind:FinanceReportRequest['kind'];filters:FinanceFilters;scope:string[];columns:{key:string;label:string;money?:boolean}[];rows:Record<string,string|number>[];totals:Record<string,number>;generatedAt:string;basis:string}
export interface ReceiptSnapshot {mosque:Pick<Settings,'name'|'nameMl'|'address'|'contact'>;logo:string;familyCode:string;ward:string;house:string;guardian:string;donor:string;anonymous:boolean;date:string;method:string;reference:string;receivedBy:string;totalPaise:number;remainingPaise:number;lines:{category:string;period:string;amountPaise:number}[]}
export interface FinanceReceipt {id:string;number:string;transactionId:string;status:FinanceTransaction['status'];refundPaise:number;snapshot:ReceiptSnapshot;verification:string;qr:string}
export interface FinanceAudit {id:number;action:string;entityId:string;sessionId:string;role:FinanceRole;details:string;createdAt:string}
export type FinanceErrorCode = 'FINANCE_DEMO_ONLY'|'FINANCE_PERMISSION'|'FINANCE_STALE'|'FINANCE_NOT_FOUND'|'FINANCE_INVALID'|'FINANCE_DUPLICATE'|'FINANCE_REFERENCE'|'FINANCE_IDEMPOTENCY'|'FINANCE_ALLOCATION'|'FINANCE_FUND_BALANCE'|'FINANCE_STATE'|'FINANCE_EFFECTIVE'|'FINANCE_LIMIT'|'FINANCE_DATE'|'FINANCE_LOGO';
export class FinanceError extends Error {constructor(public readonly code:FinanceErrorCode){super(code);}}
export interface FinanceApi {
  getFinanceSetup:()=>Promise<Result<FinanceSetup>>;
  setFinanceDemoRole:(input:z.infer<typeof financeRoleSchema>)=>Promise<Result<FinanceSession>>;
  saveFinancePlan:(input:PlanDraft)=>Promise<Result<Plan>>;
  saveFinanceAssignment:(input:AssignmentDraft)=>Promise<Result<null>>;
  saveFinancePolicy:(input:z.infer<typeof policySchema>)=>Promise<Result<null>>;
  generateFinanceDues:(input:z.infer<typeof generateSchema>)=>Promise<Result<{created:number;duplicates:number;skipped:number;amountPaise:number}>>;
  getFamilyFinance:(input:{id:string})=>Promise<Result<FamilyFinance>>;
  recordFinancePayment:(input:PaymentDraft)=>Promise<Result<FinanceTransaction>>;
  applyFinanceCredit:(input:z.infer<typeof creditSchema>)=>Promise<Result<{allocatedPaise:number}>>;
  adjustFinanceDue:(input:z.infer<typeof adjustmentSchema>)=>Promise<Result<null>>;
  correctFinanceTransaction:(input:z.infer<typeof correctionSchema>)=>Promise<Result<FinanceTransaction>>;
  saveFinanceFund:(input:z.infer<typeof fundSchema>)=>Promise<Result<Fund>>;
  saveFinanceCategory:(input:z.infer<typeof financeCategorySchema>)=>Promise<Result<FinanceCategory>>;
  recordFinanceDonation:(input:DonationDraft)=>Promise<Result<FinanceTransaction>>;
  recordFinanceExpense:(input:ExpenseDraft)=>Promise<Result<{id:string;pending:boolean}>>;
  decideFinanceExpense:(input:z.infer<typeof expenseDecisionSchema>)=>Promise<Result<{id:string;pending:boolean}>>;
  getFinanceDashboard:(input:FinanceFilters)=>Promise<Result<FinanceDashboard>>;
  getFinanceReport:(input:FinanceReportRequest)=>Promise<Result<FinanceReport>>;
  getFinanceTransaction:(input:{id:string})=>Promise<Result<FinanceTransaction>>;
  getFinanceReceipt:(input:{id:string})=>Promise<Result<FinanceReceipt>>;
  getFinanceAudit:()=>Promise<Result<FinanceAudit[]>>;
  saveFinanceConfig:(input:z.infer<typeof financeConfigSchema>)=>Promise<Result<FinanceConfig>>;
  chooseFinanceLogo:(input:z.infer<typeof financeLogoSchema>)=>Promise<Result<FinanceConfig|null>>;
  outputFinanceDocument:(input:FinanceOutputRequest)=>Promise<Result<boolean>>;
  backupFinance:()=>Promise<Result<boolean>>;
}
export function parseRupees(value:string):number|null {if(!/^\d+(\.\d{1,2})?$/.test(value.trim()))return null;const [whole,fraction='']=value.trim().split('.');const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(result)&&result<=MAX_PAISE?result:null;}
export function rupeeInput(value:number):string{return `${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`;}
export function money(value:number,locale:'en'|'ml'='en'):string{return new Intl.NumberFormat(locale==='ml'?'ml-IN':'en-IN',{style:'currency',currency:'INR'}).format(value/100);}
export function financeFilters():FinanceFilters{const until=todayInIndia();return {from:`${until.slice(0,7)}-01`,until,wardId:'',categoryId:'',search:''};}
export function blankPlan():PlanDraft {return {key:crypto.randomUUID(),id:'',revision:0,name:'',nameMl:'',description:'',categoryId:'contribution-general',amountPaise:15000,frequency:'monthly',effectiveDate:`${todayInIndia().slice(0,7)}-01`,dueDay:10,dueMonth:4,active:true,wardId:'',registeredOnly:false,requireLiving:true};}
export const DEMO_FINANCE_CONFIRMATION = 'CONFIRM DEMO FINANCE' as const;
