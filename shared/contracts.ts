import { z } from 'zod';
import type { FamilyDraft, FamilyProfile, FamilyQuery, FamilySummary, MemberSummary, PageResult, RegistryErrorCode } from './registration';
import type { LifeEventsApi, LifeEventErrorCode } from './life-events';
import type { FinanceApi, FinanceErrorCode } from './finance';

const plainText = (max: number) => z.string().trim().max(max).refine(
  value => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value),
  'Control characters are not allowed.',
);

export const settingsSchema = z.object({
  name: plainText(120).pipe(z.string().min(2, 'Enter at least 2 characters.')),
  nameMl: plainText(120),
  address: plainText(400),
  contact: plainText(40).refine(value => value === '' || /^[+\d()\s-]{7,40}$/.test(value), 'Enter a valid contact number.'),
  locale: z.enum(['en', 'ml']),
  theme: z.enum(['light', 'dark', 'system']),
  revision: z.number().int().nonnegative(),
}).strict();

export const emptyRequest = z.object({}).strict();
export const resetSchema = z.object({ confirmation: z.literal('RESET DEMO') }).strict();
export type Settings = z.infer<typeof settingsSchema>;
export type Locale = Settings['locale'];
export interface Ward { id: string; code: string; name: string; nameMl: string; active: boolean }
export interface AuditEvent { id: number; kind: 'workspace.created' | 'settings.updated' | 'demo.reset'; createdAt: string }
export interface StorageHealth { integrity: 'ok'; schemaVersion: number; foreignKeys: boolean; journalMode: string }
export interface Snapshot {
  settings: Settings;
  wards: Ward[];
  activity: AuditEvent[];
  environment: 'development' | 'test' | 'preview';
  version: string;
  canResetDemo: boolean;
  schemaVersion: number;
  registryCounts: { families: number; livingMembers: number };
  lifeEventsDemo: boolean;
  financeDemo: boolean;
}

export type ErrorCode = 'VALIDATION' | 'FORBIDDEN' | 'CONFLICT' | 'STORAGE' | 'INTERNAL' | RegistryErrorCode | LifeEventErrorCode | FinanceErrorCode;
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

// Deliberately no generic invoke, filesystem path, SQL, credentials, or event object.
export interface DesktopApi extends LifeEventsApi, FinanceApi {
  getSnapshot: () => Promise<Result<Snapshot>>;
  saveSettings: (settings: Settings) => Promise<Result<Settings>>;
  checkStorage: () => Promise<Result<StorageHealth>>;
  resetDemo: (request: z.infer<typeof resetSchema>) => Promise<Result<null>>;
  listFamilies: (query: FamilyQuery) => Promise<Result<PageResult<FamilySummary>>>;
  getFamily: (request: { id: string }) => Promise<Result<FamilyProfile>>;
  saveFamily: (family: FamilyDraft) => Promise<Result<FamilyProfile>>;
  listMembers: (query: FamilyQuery) => Promise<Result<PageResult<MemberSummary>>>;
  getMember: (request: { id: string }) => Promise<Result<MemberSummary>>;
}

