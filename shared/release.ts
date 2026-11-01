import { z } from 'zod';
import type { Result, Settings, Ward } from './contracts';
const text = (max: number) => z.string().trim().normalize('NFC').max(max).refine(v => !/[\x00-\x1f\x7f]/.test(v));
export const wardSetupSchema = z.object({ id: text(80), code: text(24).regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/), name: text(120).min(1), nameMl: text(120), active: z.boolean() }).strict();
export const mosqueSetupSchema = z.object({
  revision: z.number().int().nonnegative(), name: text(120).min(2), nameMl: text(120), address: text(400).min(1),
  contact: text(40).regex(/^[+\d() -]{7,40}$/), email: z.union([z.email(), z.literal('')]), locale: z.enum(['en', 'ml']),
  receiptPrefix: text(12).regex(/^[A-Z][A-Z0-9-]{0,11}$/), financialYearStart: z.number().int().min(1).max(12),
  wards: z.array(wardSetupSchema).min(1).max(100), currentPassword: z.string().min(1).max(128), confirmed: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.wards.map(w => w.code.toUpperCase())).size !== v.wards.length || new Set(v.wards.filter(w => w.id).map(w => w.id)).size !== v.wards.filter(w => w.id).length || !v.wards.some(w => w.active)) ctx.addIssue({ code: 'custom', path: ['wards'], message: 'Duplicate ward or no active ward' });
});
export type MosqueSetup = z.infer<typeof mosqueSetupSchema>;
export interface DeploymentSettings { revision: number; setupComplete: boolean; email: string; financialYearStart: number; receiptPrefix: string; currency: 'INR'; logo: string; mosque: Settings; wards: Ward[] }
export const importFields = ['wardCode','wardName','wardNameMl','familyNumber','houseName','houseNameMl','houseNumber','address','locality','postalCode','email','registrationDate','memberName','memberNameMl','relationship','gender','dob','phone','fatherName','motherName','maritalStatus','education','occupation','bloodGroup'] as const;
export type ImportField = typeof importFields[number];
export const mappingSchema = z.object({ sourceId: z.uuid(), mapping: z.partialRecord(z.enum(importFields), z.string().max(120)), familyLimit: z.number().int().min(1).max(2000) }).strict();
export type ImportMapping = z.infer<typeof mappingSchema>;
export interface ImportSource { sourceId: string; filename: string; encoding: string; columns: string[]; rows: string[][]; totalRows: number }
export interface ImportIssue { row: number; field: string; severity: 'error' | 'warning'; code: string }
export interface ImportPreview { previewId: string; families: number; members: number; newWards: number; issues: ImportIssue[]; sample: { row: number; family: string; member: string }[]; sourceRows: number }
export const importCommitSchema = z.object({ previewId: z.uuid(), currentPassword: z.string().min(1).max(128), backupPassword: z.string().min(12).max(128), confirmation: z.literal('IMPORT VERIFIED RECORDS'), acknowledgeWarnings: z.literal(true) }).strict();
export interface ReleaseState { version: string; schemaVersion: number; edition: string; licenseStatus: string; updateStatus: string; availableVersion: string; lastCheck: string | null; releaseNotes: string; supportEmail: string; publisher: string; signedBuild: boolean }
export const releaseChannels = Object.fromEntries(['getDeploymentSettings','saveDeploymentSettings','chooseDeploymentLogo','selectImportFile','previewImport','commitImport','cancelImport','exportImportReport','getReleaseState','checkForUpdates','activateOfflineLicense','exportDiagnostics','outputFamily'].map(name => [name, `release:${name}`])) as Record<keyof ReleaseApi, string>;
export interface ReleaseApi {
  getDeploymentSettings(): Promise<Result<DeploymentSettings>>;
  saveDeploymentSettings(input: MosqueSetup): Promise<Result<DeploymentSettings>>;
  chooseDeploymentLogo(input: { remove: boolean }): Promise<Result<string>>;
  selectImportFile(): Promise<Result<ImportSource | null>>;
  previewImport(input: ImportMapping): Promise<Result<ImportPreview>>;
  commitImport(input: z.infer<typeof importCommitSchema>): Promise<Result<{ families: number; members: number; wards: number }>>;
  cancelImport(): Promise<Result<null>>;
  exportImportReport(input: { previewId: string }): Promise<Result<boolean>>;
  getReleaseState(): Promise<Result<ReleaseState>>;
  checkForUpdates(): Promise<Result<ReleaseState>>;
  activateOfflineLicense(): Promise<Result<ReleaseState>>;
  exportDiagnostics(): Promise<Result<boolean>>;
  outputFamily(input: { id: string; format: 'pdf' | 'print' }): Promise<Result<boolean>>;
}
