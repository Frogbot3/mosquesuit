import { z } from 'zod';
import { todayInIndia, validDate, relationships, type PageResult } from './registration';

const text = (max: number) => z.string().trim().max(max).refine(value => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value), 'invalid').transform(value => value.normalize('NFC'));
export const eventDate = text(10).refine(value => validDate(value) && value <= todayInIndia(), 'invalidDate');
const optionalDate = text(10).refine(value => !value || validDate(value) && value <= todayInIndia(), 'invalidDate');
const phone = text(30).refine(value => !value || /^[+\d() -]+$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15, 'invalidPhone');
export const eventKinds = ['marriage', 'divorce', 'death'] as const;
export type EventKind = typeof eventKinds[number];
export const eventStatuses = ['reported', 'under_review', 'confirmed', 'closed'] as const;
export type EventStatus = typeof eventStatuses[number];
export const partySchema = z.object({ memberId: z.uuid().nullable(), externalId: z.uuid().nullable(), name: text(150), nameMl: text(150), phone, guardian: text(300) }).strict().superRefine((party, ctx) => {
  if (party.memberId && (party.externalId || party.name || party.nameMl || party.phone || party.guardian)) ctx.addIssue({ code: 'custom', message: 'invalid', path: ['memberId'] });
  if (!party.memberId && !party.name && !party.nameMl) ctx.addIssue({ code: 'custom', message: 'nameRequired', path: ['name'] });
});
export const eventDraftSchema = z.object({
  id: z.uuid().nullable(), revision: z.number().int().nonnegative(), kind: z.enum(eventKinds),
  number: text(40).pipe(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9/-]{0,39}$/)).transform(value => value.toUpperCase()),
  eventDate, registrationDate: eventDate, remarks: text(3000),
  parties: z.array(partySchema).max(2),
  guardianInfo: text(500), witnesses: z.array(z.object({ name: text(150).pipe(z.string().min(1)), phone }).strict()).max(8),
  officiant: text(150), venue: text(300), mahr: text(500),
  marriageId: z.uuid().nullable(), categoryId: text(80),
  memberId: z.uuid().nullable(), place: text(300), burialDate: optionalDate, burialLocation: text(300), informant: text(150), informantPhone: phone, documentReferences: text(1000),
}).strict().superRefine((event, ctx) => {
  if (event.registrationDate < event.eventDate || event.burialDate && event.burialDate < event.eventDate) ctx.addIssue({ code: 'custom', message: 'dateOrder', path: ['registrationDate'] });
  if (event.kind === 'death' ? !event.memberId || event.parties.length !== 0 : event.memberId !== null || event.parties.length !== 2) ctx.addIssue({ code: 'custom', message: 'partiesRequired', path: ['parties'] });
  if (event.parties.length === 2 && (event.parties[0].memberId && event.parties[0].memberId === event.parties[1].memberId || event.parties[0].externalId && event.parties[0].externalId === event.parties[1].externalId)) ctx.addIssue({ code: 'custom', message: 'samePerson', path: ['parties'] });
  if (event.kind === 'divorce' && !event.categoryId) ctx.addIssue({ code: 'custom', message: 'categoryRequired', path: ['categoryId'] });
});
export type PartyDraft = z.infer<typeof partySchema>;
export type EventDraft = z.infer<typeof eventDraftSchema>;
export const eventQuerySchema = z.object({ kind: z.enum(eventKinds), search: text(100), status: z.union([z.literal(''), z.enum(eventStatuses)]), from: optionalDate, until: optionalDate, page: z.number().int().min(1).max(1_000_000), pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]) }).strict().refine(q => !q.from || !q.until || q.from <= q.until, 'dateOrder');
export type EventQuery = z.infer<typeof eventQuerySchema>;
export const eventRequestSchema = z.object({ id: z.uuid() }).strict();
export const eventRevisionSchema = z.object({ id: z.uuid(), revision: z.number().int().nonnegative() }).strict();
export const eventTransitionSchema = eventRevisionSchema.extend({ action: z.enum(['review', 'confirm', 'close']), confirmation: z.literal('CONFIRM DEMO ACTION') }).strict();
export type EventTransition = z.infer<typeof eventTransitionSchema>;
export const transferSchema = z.object({ memberId: z.uuid(), fromFamilyId: z.uuid(), toFamilyId: z.uuid(), fromRevision: z.number().int().nonnegative(), toRevision: z.number().int().nonnegative(), relationship: z.enum(relationships).refine(value => value !== 'guardian'), reason: text(500).pipe(z.string().min(1)), confirmation: z.literal('CONFIRM DEMO TRANSFER') }).strict();
export type TransferDraft = z.infer<typeof transferSchema>;
export const categorySchema = z.object({ id: text(80), name: text(80).pipe(z.string().min(1)), nameMl: text(80), active: z.boolean() }).strict();
export type DivorceCategory = z.infer<typeof categorySchema>;
export interface EventParty extends PartyDraft { familyId: string | null; familyCode: string; ward: string; wardMl: string; house: string; houseMl: string; lifeStatus: string }
export interface EventDocument { id: string; name: string; mime: string; size: number; createdAt: string }
export interface EventHistory { id: number; action: string; fields: string[]; createdAt: string }
export interface EventRecord extends Omit<EventDraft, 'id' | 'parties'> {
  id: string; status: EventStatus; parties: EventParty[]; member: EventParty | null; documents: EventDocument[]; history: EventHistory[]; categoryName: string; categoryNameMl: string; marriageNumber: string; guardianRequired: boolean;
}
export interface EventSummary { id: string; kind: EventKind; number: string; eventDate: string; registrationDate: string; status: EventStatus; names: string; namesMl: string }
export interface TransferHistory { id: number; memberId: string; memberName: string; memberNameMl: string; fromCode: string; toCode: string; reason: string; createdAt: string }
export type LifeEventErrorCode = 'DEMO_ONLY' | 'EVENT_DUPLICATE' | 'EVENT_NOT_FOUND' | 'EVENT_STALE' | 'EVENT_STATE' | 'EVENT_PARTY' | 'EVENT_DATE' | 'EVENT_LOCKED' | 'DUPLICATE_DEATH' | 'GUARDIAN_TRANSFER' | 'EVENT_STATUS_MANAGED' | 'DOCUMENT_INVALID' | 'DOCUMENT_LIMIT';
export class LifeEventError extends Error { constructor(public readonly code: LifeEventErrorCode) { super(code); } }
export interface LifeEventsApi {
  listEvents: (query: EventQuery) => Promise<import('./contracts').Result<PageResult<EventSummary>>>;
  getEvent: (request: { id: string }) => Promise<import('./contracts').Result<EventRecord>>;
  saveEvent: (draft: EventDraft) => Promise<import('./contracts').Result<EventRecord>>;
  transitionEvent: (request: EventTransition) => Promise<import('./contracts').Result<EventRecord>>;
  getEventCategories: () => Promise<import('./contracts').Result<DivorceCategory[]>>;
  saveEventCategory: (request: DivorceCategory) => Promise<import('./contracts').Result<DivorceCategory[]>>;
  transferMember: (request: TransferDraft) => Promise<import('./contracts').Result<null>>;
  getTransfers: (request: { familyId: string }) => Promise<import('./contracts').Result<TransferHistory[]>>;
  attachEventDocument: (request: { id: string; revision: number }) => Promise<import('./contracts').Result<EventRecord | null>>;
  exportEventDocument: (request: { id: string }) => Promise<import('./contracts').Result<boolean>>;
  outputEvent: (request: { id: string; revision: number; format: 'pdf' | 'print' }) => Promise<import('./contracts').Result<boolean>>;
}
export function blankParty(): PartyDraft { return { memberId: null, externalId: null, name: '', nameMl: '', phone: '', guardian: '' }; }
export function blankEvent(kind: EventKind): EventDraft { return { id: null, revision: 0, kind, number: '', eventDate: todayInIndia(), registrationDate: todayInIndia(), remarks: '', parties: kind === 'death' ? [] : [blankParty(), blankParty()], guardianInfo: '', witnesses: [], officiant: '', venue: '', mahr: '', marriageId: null, categoryId: kind === 'divorce' ? 'other' : '', memberId: null, place: '', burialDate: '', burialLocation: '', informant: '', informantPhone: '', documentReferences: '' }; }
export function eventToDraft(record: EventRecord): EventDraft {
  const draft = blankEvent(record.kind);
  for (const key of Object.keys(draft) as (keyof EventDraft)[]) if (key !== 'parties') Object.assign(draft, { [key]: record[key] });
  draft.parties = record.parties.map(party => party.memberId ? { ...blankParty(), memberId: party.memberId } : { memberId: null, externalId: party.externalId, name: party.name, nameMl: party.nameMl, phone: party.phone, guardian: party.guardian });
  return draft;
}
