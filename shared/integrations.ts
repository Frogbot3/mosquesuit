import { z } from 'zod';
import type { Result } from './contracts';
import type { FinanceRole } from './finance';

const text=(max:number)=>z.string().trim().normalize('NFC').max(max).refine(s=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s));
const id=z.string().uuid();const optionalId=z.union([id,z.literal('')]);
export const integrationId=z.object({id}).strict();
export const consentSchema=z.object({familyId:id,phone:z.string().regex(/^\+[1-9]\d{7,14}$/),language:z.enum(['en','ml']),optedIn:z.boolean(),receipts:z.boolean(),reminders:z.boolean(),evidence:text(500).min(5),confirmed:z.literal(true)}).strict();
export const templateSchema=z.object({id:optionalId,name:text(80).min(2),language:z.enum(['en','ml']),kind:z.enum(['reminder','receipt']),body:text(1200).min(10),approvedDemo:z.boolean()}).strict().refine(d=>[...d.body.matchAll(/\{\{(.*?)\}\}/g)].every(m=>['mosque','amount','period','payment_link','receipt_number','receipt_link'].includes(m[1])));
export const previewSchema=z.object({familyId:optionalId,wardId:text(60),templateId:text(80).min(1),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}).strict();
export const queueSchema=z.object({previewId:id}).strict();
export const jobsDecisionSchema=z.object({ids:z.array(id).min(1).max(500),action:z.enum(['approve','cancel','retry','resend']),reason:text(500).min(5)}).strict();
export const scheduleSchema=z.object({id:optionalId,name:text(80).min(2),templateId:text(80).min(1),wardId:text(60),rule:z.enum(['before','due','after','monthly']),day:z.number().int().min(1).max(28),enabled:z.boolean()}).strict();
export const integrationConfigSchema=z.object({autoReceipts:z.boolean(),quietStart:z.number().int().min(0).max(23),quietEnd:z.number().int().min(0).max(23),minHours:z.number().int().min(24).max(720),perMinute:z.number().int().min(1).max(30),wabaId:text(80),senderNumber:text(40)}).strict();
export const mockConfigSchema=z.object({connected:z.boolean(),nextSend:z.enum(['success','rate_limit','uncertain'])}).strict();
export const linkSchema=z.object({key:id,familyId:id,categoryId:text(80).min(1),expiryHours:z.number().int().min(1).max(168)}).strict();
export const simulateSchema=z.object({id:text(120).min(1),event:z.enum(['capture','invalid_signature','replay','delivered','settled'])}).strict();
export const refundOnlineSchema=z.object({key:id,id:text(120).min(1),amountPaise:z.number().int().positive().max(100000000000),reason:text(500).min(5)}).strict();
export const resolveOnlineSchema=z.object({id:text(120).min(1),reason:text(500).min(5)}).strict();
export type ConsentDraft=z.infer<typeof consentSchema>;
export type Template=z.infer<typeof templateSchema>&{revision:number};
export type IntegrationConfig=z.infer<typeof integrationConfigSchema>;
export type ReminderSchedule=z.infer<typeof scheduleSchema>;
export interface Consent extends Omit<ConsentDraft,'confirmed'> {revision:number;guardianId:string;registryPhone:string;effective:boolean;familyCode:string;wardId:string;updatedAt:string}
export type JobStatus='approval'|'queued'|'retry'|'sending'|'sent'|'delivered'|'failed'|'uncertain'|'cancelled'|'suppressed';
export interface NotificationJob {id:string;familyId:string;familyCode:string;wardId:string;kind:'reminder'|'receipt';templateId:string;language:'en'|'ml';body:string;phone:string;consentRevision:number;dueHash:string;status:JobStatus;attempts:number;nextAt:number;createdAt:number;reason:string;providerId:string;receiptId:string;dedupe:string}
export interface NotificationPreview {id:string;expiresAt:number;candidates:Omit<NotificationJob,'id'|'status'|'attempts'|'nextAt'|'createdAt'|'reason'|'providerId'>[];excluded:{familyCode:string;reason:string}[]}
export interface PaymentLink {id:string;familyId:string;familyCode:string;categoryId:string;amountPaise:number;dueIds:string[];dueHash:string;url:string;expiresAt:number;status:'active'|'paid'|'cancelled'|'expired'|'unknown';providerId:string;paymentId:string;settlement:string}
export interface VerifiedEvent {id:string;kind:'capture'|'refund';linkId:string;paymentId:string;refundId:string;amountPaise:number;date:string;createdAt:number}
export interface OnlineEvent extends VerifiedEvent {status:'pending'|'applied'|'conflict';transactionId:string;receiptId:string;reason:string}
export interface IntegrationState {role:FinanceRole;connected:boolean;lastSync:number;workspaceId:string;config:IntegrationConfig;consents:Consent[];templates:Template[];jobs:NotificationJob[];schedules:ReminderSchedule[];links:PaymentLink[];events:OnlineEvent[];attempts:{jobId:string;outcome:string;at:number}[];audit:{action:string;details:string;at:number}[];serviceStatus:string}
export type IntegrationErrorCode='INTEGRATION_DEMO_ONLY'|'INTEGRATION_OFFLINE'|'INTEGRATION_INVALID'|'INTEGRATION_STALE'|'INTEGRATION_CONSENT'|'INTEGRATION_TEMPLATE'|'INTEGRATION_STATE'|'INTEGRATION_SIGNATURE'|'INTEGRATION_REPLAY'|'INTEGRATION_AUTH'|'INTEGRATION_CONFLICT';
export class IntegrationError extends Error {constructor(public readonly code:IntegrationErrorCode){super(code);}}
export interface IntegrationApi {
 getIntegrationState:()=>Promise<Result<IntegrationState>>;
 saveMessagingConsent:(d:ConsentDraft)=>Promise<Result<null>>;
 saveNotificationTemplate:(d:z.infer<typeof templateSchema>)=>Promise<Result<null>>;
 previewNotifications:(d:z.infer<typeof previewSchema>)=>Promise<Result<NotificationPreview>>;
 queueNotifications:(d:z.infer<typeof queueSchema>)=>Promise<Result<{created:number;suppressed:number}>>;
 decideNotifications:(d:z.infer<typeof jobsDecisionSchema>)=>Promise<Result<null>>;
 saveReminderSchedule:(d:ReminderSchedule)=>Promise<Result<null>>;
 runReminderSchedules:()=>Promise<Result<{created:number}>>;
 saveIntegrationConfig:(d:IntegrationConfig)=>Promise<Result<null>>;
 setIntegrationMock:(d:z.infer<typeof mockConfigSchema>)=>Promise<Result<null>>;
 syncIntegrations:()=>Promise<Result<{posted:number;conflicts:number}>>;
 createOnlinePaymentLink:(d:z.infer<typeof linkSchema>)=>Promise<Result<PaymentLink>>;
 cancelOnlinePaymentLink:(d:{id:string})=>Promise<Result<null>>;
 simulateIntegrationEvent:(d:z.infer<typeof simulateSchema>)=>Promise<Result<null>>;
 requestOnlineRefund:(d:z.infer<typeof refundOnlineSchema>)=>Promise<Result<null>>;
 resolveOnlineConflict:(d:z.infer<typeof resolveOnlineSchema>)=>Promise<Result<null>>;
}
export const integrationChannels=Object.fromEntries(['getIntegrationState','saveMessagingConsent','saveNotificationTemplate','previewNotifications','queueNotifications','decideNotifications','saveReminderSchedule','runReminderSchedules','saveIntegrationConfig','setIntegrationMock','syncIntegrations','createOnlinePaymentLink','cancelOnlinePaymentLink','simulateIntegrationEvent','requestOnlineRefund','resolveOnlineConflict'].map(k=>[k,`integration:${k}`])) as Record<keyof IntegrationApi,string>;
export const defaultIntegrationConfig:IntegrationConfig={autoReceipts:false,quietStart:21,quietEnd:8,minHours:168,perMinute:5,wabaId:'',senderNumber:''};
export function quietNow(now:number,start:number,end:number){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(now));return start===end?false:start<end?hour>=start&&hour<end:hour>=start||hour<end;}
