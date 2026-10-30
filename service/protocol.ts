import { z } from 'zod';
import { integrationConfigSchema,templateSchema,scheduleSchema } from '../shared/integrations';
const id=z.string().uuid();const label=z.string().max(160);const amount=z.number().int().min(0).max(100000000000);
export const serviceSnapshotSchema=z.object({
 workspaceId:id,config:integrationConfigSchema,
 mosque:z.object({name:label,nameMl:label}).strict().default({name:'Mosque',nameMl:''}),
 schedules:z.array(scheduleSchema).max(100).default([]),
 consents:z.array(z.object({familyId:id,wardId:label.default(''),revision:z.number().int().positive(),phone:z.string().regex(/^\+[1-9]\d{7,14}$/),language:z.enum(['en','ml']),effective:z.boolean(),reminders:z.boolean(),receipts:z.boolean()}).strict()).max(10000),
 templates:z.array(templateSchema.safeExtend({revision:z.number().int().positive()})).max(200),
 accounts:z.array(z.object({familyId:id,categoryId:label,dues:z.array(z.object({id,amountPaise:amount,dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict()).max(2000),hash:label}).strict()).max(20000),
 jobs:z.array(z.object({id,familyId:id,kind:z.enum(['reminder','receipt']),templateId:label,language:z.enum(['en','ml']),phone:z.string().max(16),body:z.string().max(3000),consentRevision:z.number().int().positive(),dueHash:label,receiptId:z.union([id,z.literal('')]),dedupe:label,status:z.enum(['approval','queued','retry','sending','sent','delivered','failed','uncertain','cancelled','suppressed']),nextAt:z.number().int().nonnegative()}).strict()).max(10000),
}).strict();
export type ServiceSnapshot=z.infer<typeof serviceSnapshotSchema>;
export const serviceLinkSchema=z.object({key:id,familyId:id,categoryId:label,expiryHours:z.number().int().min(1).max(168)}).strict();
export const serviceAckSchema=z.object({eventId:label,receiptId:z.union([id,z.literal('')]),transactionId:id,receipt:z.object({number:label,date:label,amountPaise:amount,mosque:label,mosqueMl:label}).strict().nullable()}).strict();
export const serviceRefundSchema=z.object({key:id,paymentId:label,amountPaise:amount.refine(v=>v>0)}).strict();
export const serviceWebhookSchema=z.object({eventId:label.min(1),event:z.enum(['capture','refund']),linkId:id,paymentId:label.min(1),refundId:label,createdAt:z.number().int().positive()}).strict();
