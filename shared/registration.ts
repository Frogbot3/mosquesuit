import { z } from 'zod';

export function todayInIndia(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value && value >= '1800-01-01';
}
export function calculateAge(dob: string | null, on = todayInIndia()): number | null {
  if (!dob || !validDate(dob) || !validDate(on) || dob > on) return null;
  return Number(on.slice(0, 4)) - Number(dob.slice(0, 4)) - (on.slice(5) < dob.slice(5) ? 1 : 0);
}
const text = (max: number) => z.string().trim().max(max, 'tooLong').refine(value => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value), 'invalidText').transform(value => value.normalize('NFC'));
const date = text(10).refine(value => value === '' || validDate(value) && value <= todayInIndia(), 'invalidDate');
const phone = text(30).refine(value => value === '' || /^[+\d() -]+$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15, 'invalidPhone');
export const genders = ['unknown', 'male', 'female', 'other'] as const;
export const relationships = ['guardian', 'spouse', 'son', 'daughter', 'father', 'mother', 'sibling', 'grandparent', 'grandchild', 'other', 'unknown'] as const;
export const maritalStatuses = ['unknown', 'single', 'married', 'divorced', 'widowed'] as const;
export const bloodGroups = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const;

export const memberDraftSchema = z.object({
  clientKey: z.uuid(), id: z.uuid().nullable(),
  name: text(150), nameMl: text(150), relationship: z.enum(relationships), gender: z.enum(genders),
  dob: date, fatherName: text(150), motherName: text(150), maritalStatus: z.enum(maritalStatuses),
  education: text(150), occupation: text(150), bloodGroup: z.enum(bloodGroups), phone,
  remarks: text(1000),
}).strict().refine(member => Boolean(member.name || member.nameMl), { message: 'nameRequired', path: ['name'] });

export const saveFamilySchema = z.object({
  id: z.uuid().nullable(), revision: z.number().int().nonnegative(), wardId: text(80).pipe(z.string().min(1, 'wardRequired')),
  familyNumber: text(24).pipe(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9/-]{0,23}$/, 'invalidFamilyNumber')).transform(value => value.toUpperCase()),
  houseName: text(150), houseNameMl: text(150), houseNumber: text(60), address: text(500), locality: text(150),
  postalCode: text(6).refine(value => value === '' || /^[1-9]\d{5}$/.test(value), 'invalidPostalCode'),
  email: text(254).refine(value => value === '' || z.email().safeParse(value).success, 'invalidEmail'),
  registrationDate: date, notes: text(2000), status: z.enum(['draft', 'registered']),
  guardianKey: z.uuid(), members: z.array(memberDraftSchema).min(1, 'guardianRequired').max(50, 'memberLimit'),
}).strict().superRefine((family, ctx) => {
  const keys = family.members.map(member => member.clientKey);
  const ids = family.members.map(member => member.id).filter(id => id !== null);
  if (new Set(keys).size !== keys.length || new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['members'], message: 'duplicateMember' });
  const guardian = family.members.find(member => member.clientKey === family.guardianKey);
  if (!guardian) ctx.addIssue({ code: 'custom', path: ['guardianKey'], message: 'guardianRequired' });
  family.members.forEach((member, index) => {
    if ((member.clientKey === family.guardianKey) !== (member.relationship === 'guardian')) {
      ctx.addIssue({ code: 'custom', path: ['members', index, 'relationship'], message: 'invalidGuardianRelationship' });
    }
  });
});

export const familyQuerySchema = z.object({ search: text(100), wardId: text(80), page: z.number().int().min(1).max(1_000_000), pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]) }).strict();
export const entityRequestSchema = z.object({ id: z.uuid() }).strict();
export type MemberDraft = z.infer<typeof memberDraftSchema>;
export type FamilyDraft = z.infer<typeof saveFamilySchema>;
export type FamilyQuery = z.infer<typeof familyQuerySchema>;
export type RegistryErrorCode = 'DUPLICATE_FAMILY' | 'NOT_FOUND' | 'STALE_FAMILY' | 'INACTIVE_WARD' | 'INVALID_MEMBER' | 'INVALID_GUARDIAN';
export interface FamilySummary {
  id: string; familyNumber: string; familyCode: string; wardId: string; wardName: string; wardNameMl: string;
  houseName: string; houseNameMl: string; houseNumber: string; guardianName: string; guardianNameMl: string;
  phone: string; livingMembers: number; status: FamilyDraft['status'];
  needsGuardian: boolean;
}
export interface MemberRecord extends Omit<MemberDraft, 'clientKey'> {
  id: string; familyId: string; lifeStatus: 'living' | 'deceased'; archivedAt: string | null; createdAt: string;
}
export interface MemberSummary extends MemberRecord { familyCode: string; houseName: string; houseNameMl: string; wardName: string; wardNameMl: string; isGuardian: boolean }
export type HistoryAction = 'family.created' | 'family.updated' | 'guardian.changed' | 'member.added' | 'member.updated' | 'member.removed';
export interface FamilyHistory { id: number; action: HistoryAction; memberId: string | null; memberName: string | null; memberNameMl: string | null; fields: string[]; createdAt: string }
export interface FamilyAssignment { id: number; wardName: string; wardNameMl: string; familyNumber: string; houseNumber: string; startedAt: string; endedAt: string | null }
export interface FamilyProfile extends Omit<FamilyDraft, 'guardianKey' | 'members' | 'id'> {
  id: string; familyCode: string; wardName: string; wardNameMl: string; guardianMemberId: string; createdAt: string; updatedAt: string;
  needsGuardian: boolean;
  members: MemberRecord[]; history: FamilyHistory[]; assignments: FamilyAssignment[];
  totals: { living: number; male: number; female: number; other: number; unknown: number; deceased: number; removed: number };
}
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }

export function blankMember(guardian = false): MemberDraft {
  return { clientKey: crypto.randomUUID(), id: null, name: '', nameMl: '', relationship: guardian ? 'guardian' : 'unknown', gender: 'unknown', dob: '', fatherName: '', motherName: '', maritalStatus: 'unknown', education: '', occupation: '', bloodGroup: '', phone: '', remarks: '' };
}
export function profileToDraft(profile: FamilyProfile): FamilyDraft {
  return {
    id: profile.id, revision: profile.revision, wardId: profile.wardId, familyNumber: profile.familyNumber,
    houseName: profile.houseName, houseNameMl: profile.houseNameMl, houseNumber: profile.houseNumber, address: profile.address,
    locality: profile.locality, postalCode: profile.postalCode, email: profile.email, registrationDate: profile.registrationDate,
    notes: profile.notes, status: profile.status, guardianKey: profile.guardianMemberId,
    members: profile.members.filter(member => !member.archivedAt).map(member => ({
      clientKey: member.id, id: member.id, name: member.name, nameMl: member.nameMl, relationship: member.relationship,
      gender: member.gender, dob: member.dob, fatherName: member.fatherName, motherName: member.motherName,
      maritalStatus: member.maritalStatus, education: member.education, occupation: member.occupation,
      bloodGroup: member.bloodGroup, phone: member.phone, remarks: member.remarks,
    })),
  };
}
