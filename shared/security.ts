import { z } from "zod";
import type { Result, Locale } from "./contracts";
export const permissions = [
  "families.view",
  "families.create",
  "families.edit",
  "families.archive",
  "members.view",
  "identity.view",
  "life.marriage",
  "life.divorce",
  "life.death",
  "finance.view",
  "payments.record",
  "payments.reverse",
  "donations.manage",
  "expenses.record",
  "expenses.approve",
  "finance.configure",
  "reports.generate",
  "data.export",
  "notifications.send",
  "staff.manage",
  "settings.change",
  "backup.create",
  "backup.restore",
  "audit.view",
  "security.configure",
] as const;
export type Permission = (typeof permissions)[number];
export const roleIds = [
  "super_admin",
  "secretary",
  "accountant",
  "ward_operator",
  "data_entry",
  "read_only",
] as const;
export type RoleId = (typeof roleIds)[number];
export const defaultPermissions: Record<RoleId, Permission[]> = {
  super_admin: [...permissions],
  secretary: permissions.filter(
    (p) =>
      ![
        "staff.manage",
        "backup.restore",
        "security.configure",
        "identity.view",
        "payments.reverse",
      ].includes(p),
  ),
  accountant: [
    "families.view",
    "members.view",
    "finance.view",
    "payments.record",
    "donations.manage",
    "expenses.record",
    "reports.generate",
    "data.export",
    "notifications.send",
  ],
  ward_operator: [
    "families.view",
    "families.create",
    "families.edit",
    "members.view",
  ],
  data_entry: [
    "families.view",
    "families.create",
    "families.edit",
    "members.view",
  ],
  read_only: ["families.view", "members.view", "finance.view"],
};
const text = (max: number) =>
  z
    .string()
    .trim()
    .normalize("NFC")
    .min(1)
    .max(max)
    .refine((s) => !/[\x00-\x1f\x7f]/.test(s));
export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((s) => BufferByteLength(s) <= 512);
const BufferByteLength = (s: string) => new TextEncoder().encode(s).length;
export const loginSchema = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,39}$/),
    password: z.string().min(1).max(128),
  })
  .strict();
export const bootstrapSchema = loginSchema.extend({
  password: passwordSchema,
  name: text(100),
  confirmed: z.literal(true),
});
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict();
export const staffSchema = z
  .object({
    id: z.union([z.uuid(), z.literal("")]),
    revision: z.number().int().min(0),
    username: loginSchema.shape.username,
    name: text(100),
    roleId: z.enum(roleIds),
    allWards: z.boolean(),
    wardIds: z.array(text(60)).max(100),
    active: z.boolean(),
    password: z.union([passwordSchema, z.literal("")]),
    currentPassword: z.string().min(1).max(128),
    confirmed: z.literal(true),
  })
  .strict();
export const resetPasswordSchema = z
  .object({
    id: z.uuid(),
    password: passwordSchema,
    currentPassword: z.string().min(1).max(128),
    confirmed: z.literal(true),
  })
  .strict();
export const roleSchema = z
  .object({
    id: z.enum(roleIds),
    revision: z.number().int().min(0),
    permissions: z.array(z.enum(permissions)).max(permissions.length),
    currentPassword: z.string().min(1).max(128),
    confirmed: z.literal(true),
  })
  .strict();
export const securitySettingsSchema = z
  .object({
    idleMinutes: z.number().int().min(1).max(60),
    locale: z.enum(["en", "ml"]),
    currentPassword: z.string().min(1).max(128),
    confirmed: z.literal(true),
  })
  .strict();
export const auditQuerySchema = z
  .object({
    action: z.string().max(100),
    outcome: z.enum(["", "success", "failure", "denied"]),
    from: z.string().regex(/^(|\d{4}-\d{2}-\d{2})$/),
    until: z.string().regex(/^(|\d{4}-\d{2}-\d{2})$/),
    page: z.number().int().min(1).max(100000),
  })
  .strict();
export interface StaffUser {
  id: string;
  username: string;
  name: string;
  roleId: RoleId;
  active: boolean;
  allWards: boolean;
  wardIds: string[];
  revision: number;
  lastLogin: number;
  mustChangePassword: boolean;
}
export interface StaffRole {
  id: RoleId;
  revision: number;
  permissions: Permission[];
}
export interface SecurityState {
  setupRequired: boolean;
  authenticated: boolean;
  locked: boolean;
  locale: Locale;
  idleMinutes: number;
  user: StaffUser | null;
  permissions: Permission[];
  mustChangePassword: boolean;
}
export interface SecurityAudit {
  id: string;
  at: number;
  staffId: string | null;
  staffName: string;
  action: string;
  entityType: string;
  entityId: string;
  outcome: "success" | "failure" | "denied";
  summary: string;
  correlationId: string;
}
export type SecurityErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_LOCKED"
  | "AUTH_INVALID"
  | "AUTH_THROTTLED"
  | "AUTH_PERMISSION"
  | "AUTH_SCOPE"
  | "AUTH_LAST_ADMIN"
  | "AUTH_SETUP_DONE"
  | "AUTH_STALE"
  | "AUTH_PASSWORD_CHANGE"
  | "AUTH_BUSY"
  | "BACKUP_INVALID"
  | "BACKUP_PASSWORD"
  | "BACKUP_DESTINATION"
  | "BACKUP_CREDENTIALS"
  | "BACKUP_VERSION"
  | "BACKUP_EXPIRED";
export class SecurityError extends Error {
  constructor(readonly code: SecurityErrorCode) {
    super(code);
  }
}
export const backupConfigSchema = z
  .object({
    password: passwordSchema,
    currentPassword: z.string().min(1).max(128),
    scheduled: z.boolean(),
    intervalHours: z.number().int().min(1).max(168),
    retain: z.number().int().min(1).max(100),
    confirmed: z.literal(true),
  })
  .strict();
export const backupCreateSchema = z
  .object({ password: z.union([passwordSchema, z.literal("")]) })
  .strict();
export const backupPreviewSchema = z
  .object({ password: passwordSchema })
  .strict();
export const backupRestoreSchema = z
  .object({
    previewId: z.uuid(),
    currentPassword: z.string().min(1).max(128),
    confirmation: z.literal("RESTORE VERIFIED BACKUP"),
  })
  .strict();
export interface BackupPreview {
  id: string;
  createdAt: string;
  mosque: string;
  schemaVersion: number;
  families: number;
  members: number;
  payments: number;
  staff: number;
  attachments: number;
  serviceIncluded: boolean;
  expiresAt: number;
}
export interface BackupState {
  destination: string;
  scheduled: boolean;
  intervalHours: number;
  retain: number;
  keyAvailable: boolean;
  busy: boolean;
  history: {
    id: string;
    at: number;
    kind: string;
    status: string;
    filename: string;
    digest: string;
    message: string;
  }[];
}
export interface SecurityApi {
  getSecurityState: () => Promise<Result<SecurityState>>;
  bootstrapAdministrator: (
    d: z.infer<typeof bootstrapSchema>,
  ) => Promise<Result<null>>;
  loginStaff: (
    d: z.infer<typeof loginSchema>,
  ) => Promise<Result<SecurityState>>;
  logoutStaff: () => Promise<Result<null>>;
  lockSession: () => Promise<Result<null>>;
  touchSession: () => Promise<Result<SecurityState>>;
  changeStaffPassword: (
    d: z.infer<typeof changePasswordSchema>,
  ) => Promise<Result<null>>;
  recoverStaffAccount: (d: { newPassword: string }) => Promise<Result<null>>;
  renewRecoveryFile: (d: { currentPassword: string }) => Promise<Result<null>>;
  getStaffDirectory: () => Promise<
    Result<{ users: StaffUser[]; roles: StaffRole[] }>
  >;
  saveStaffAccount: (d: z.infer<typeof staffSchema>) => Promise<Result<null>>;
  resetStaffPassword: (
    d: z.infer<typeof resetPasswordSchema>,
  ) => Promise<Result<null>>;
  saveStaffRole: (d: z.infer<typeof roleSchema>) => Promise<Result<null>>;
  saveSecuritySettings: (
    d: z.infer<typeof securitySettingsSchema>,
  ) => Promise<Result<null>>;
  getSecurityAudit: (
    d: z.infer<typeof auditQuerySchema>,
  ) => Promise<
    Result<{ items: SecurityAudit[]; total: number; valid: boolean }>
  >;
  getBackupState: () => Promise<Result<BackupState>>;
  configureBackups: (
    d: z.infer<typeof backupConfigSchema>,
  ) => Promise<Result<boolean>>;
  createEncryptedBackup: (
    d: z.infer<typeof backupCreateSchema>,
  ) => Promise<Result<boolean>>;
  previewEncryptedBackup: (
    d: z.infer<typeof backupPreviewSchema>,
  ) => Promise<Result<BackupPreview | null>>;
  restoreEncryptedBackup: (
    d: z.infer<typeof backupRestoreSchema>,
  ) => Promise<Result<null>>;
}
export const securityChannels = Object.fromEntries(
  [
    "getSecurityState",
    "bootstrapAdministrator",
    "loginStaff",
    "logoutStaff",
    "lockSession",
    "touchSession",
    "changeStaffPassword",
    "recoverStaffAccount",
    "renewRecoveryFile",
    "getStaffDirectory",
    "saveStaffAccount",
    "resetStaffPassword",
    "saveStaffRole",
    "saveSecuritySettings",
    "getSecurityAudit",
    "getBackupState",
    "configureBackups",
    "createEncryptedBackup",
    "previewEncryptedBackup",
    "restoreEncryptedBackup",
  ].map((k) => [k, `security:${k}`]),
) as Record<keyof SecurityApi, string>;
