import {
  app,
  ipcMain,
  dialog,
  powerMonitor,
  type BrowserWindow,
} from "electron";
import { extname, join } from "node:path";
import {
  readBounded,
  externalDestination,
  atomicPrivateFile,
} from "./secure-files";
import { printDocuments } from "./event-output";
import { z } from "zod";
import {
  securityChannels as C,
  SecurityError,
  bootstrapSchema,
  loginSchema,
  changePasswordSchema,
  staffSchema,
  resetPasswordSchema,
  roleSchema,
  securitySettingsSchema,
  auditQuerySchema,
  passwordSchema,
  backupConfigSchema,
  backupCreateSchema,
  backupPreviewSchema,
  backupRestoreSchema,
} from "../shared/security";
import { emptyRequest, type Result } from "../shared/contracts";
import type { WorkspaceStore } from "./database/store";
import type { BackupService } from "./backup-service";
import { isTrustedDocument } from "./security";
const current = z
  .object({ currentPassword: z.string().min(1).max(128) })
  .strict();
const recovery = z
  .object({
    workspaceId: z.uuid(),
    staffId: z.uuid(),
    recoveryCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export function registerSecurityIpc(
  window: BrowserWindow,
  store: WorkspaceStore,
  backups: BackupService,
  development: boolean,
) {
  const auth = store.security;
  async function checkNativeIdle() {
    const state = auth.state();
    if (
      state.authenticated &&
      powerMonitor.getSystemIdleTime() >= state.idleMinutes * 60
    )
      auth.lock();
    if (!auth.state().authenticated) {
      printDocuments.clear();
      await backups.clearPreview();
    }
    await backups.expirePreview();
  }
  function handle<S extends z.ZodType, T>(
    channel: string,
    schema: S,
    run: (data: z.output<S>) => T | Promise<T>,
  ) {
    ipcMain.handle(
      channel,
      async (event, input: unknown): Promise<Result<T>> => {
        if (
          event.sender !== window.webContents ||
          !event.senderFrame ||
          event.senderFrame !== event.sender.mainFrame ||
          !isTrustedDocument(event.senderFrame.url, development)
        )
          return {
            ok: false,
            error: { code: "FORBIDDEN", message: "Request denied." },
          };
        try {
          const data = schema.parse(input);
          await checkNativeIdle();
          return { ok: true, data: await run(data) };
        } catch (error) {
          if (channel === C.restoreEncryptedBackup)
            auth.audit(
              "restore.failed",
              "backup",
              "",
              "failure",
              "Restore did not complete; inspect workspace and backup history",
            );
          return {
            ok: false,
            error: {
              code:
                error instanceof SecurityError
                  ? error.code
                  : error instanceof z.ZodError
                    ? "VALIDATION"
                    : "STORAGE",
              message: "The security operation could not be completed.",
            },
          };
        }
      },
    );
  }
  async function recoveryDestination() {
    const selected = await dialog.showSaveDialog(window, {
      title:
        "Save one-time offline recovery file — keep separately from backups",
      defaultPath: join(app.getPath("documents"), "Mosque-Suite-Recovery.json"),
      filters: [{ name: "Offline recovery file", extensions: ["json"] }],
    });
    if (selected.canceled || !selected.filePath)
      throw new SecurityError("AUTH_INVALID");
    if (extname(selected.filePath).toLowerCase() !== ".json")
      throw new SecurityError("BACKUP_DESTINATION");
    return externalDestination(selected.filePath, app.getPath("userData"));
  }
  handle(C.getSecurityState, emptyRequest, () => auth.state());
  handle(C.bootstrapAdministrator, bootstrapSchema, async (d) => {
    if (!auth.state().setupRequired) throw new SecurityError("AUTH_SETUP_DONE");
    const path = await recoveryDestination();
    const kit = auth.bootstrap(d);
    try {
      await atomicPrivateFile(path, JSON.stringify(kit));
    } catch {
      auth.audit(
        "recovery.save_failed",
        "staff",
        kit.staffId,
        "failure",
        "Initial administrator exists; sign in and regenerate recovery file",
        kit.staffId,
      );
      throw new SecurityError("BACKUP_DESTINATION");
    }
    return null;
  });
  handle(C.loginStaff, loginSchema, (d) => auth.login(d));
  handle(C.logoutStaff, emptyRequest, async () => {
    printDocuments.clear();
    await backups.clearPreview();
    return auth.logout();
  });
  handle(C.lockSession, emptyRequest, async () => {
    printDocuments.clear();
    await backups.clearPreview();
    return auth.lock();
  });
  handle(C.touchSession, emptyRequest, () => auth.touch());
  handle(C.changeStaffPassword, changePasswordSchema, (d) =>
    auth.changePassword(d),
  );
  handle(
    C.recoverStaffAccount,
    z.object({ newPassword: passwordSchema }).strict(),
    async (d) => {
      const selected = await dialog.showOpenDialog(window, {
        title: "Choose one-time offline recovery file",
        properties: ["openFile"],
        filters: [{ name: "Recovery file", extensions: ["json"] }],
      });
      if (selected.canceled || !selected.filePaths[0])
        throw new SecurityError("AUTH_INVALID");
      const kit = recovery.parse(
        JSON.parse(
          (await readBounded(selected.filePaths[0], 4096)).toString("utf8"),
        ),
      );
      return auth.recover(kit, d.newPassword);
    },
  );
  handle(C.renewRecoveryFile, current, async (d) => {
    auth.reauthenticate(d.currentPassword);
    const path = await recoveryDestination();
    const kit = auth.recoveryFile(d.currentPassword);
    await atomicPrivateFile(path, JSON.stringify(kit));
    return null;
  });
  handle(C.getStaffDirectory, emptyRequest, () => auth.directory());
  handle(C.saveStaffAccount, staffSchema, (d) => auth.saveStaff(d));
  handle(C.resetStaffPassword, resetPasswordSchema, (d) =>
    auth.resetPassword(d),
  );
  handle(C.saveStaffRole, roleSchema, (d) => auth.saveRole(d));
  handle(C.saveSecuritySettings, securitySettingsSchema, (d) =>
    auth.saveSettings(d),
  );
  handle(C.getSecurityAudit, auditQuerySchema, (d) => auth.auditHistory(d));
  handle(C.getBackupState, emptyRequest, () => backups.state());
  handle(C.configureBackups, backupConfigSchema, async (d) => {
    auth.reauthenticate(d.currentPassword, "backup.create");
    const choice = await dialog.showOpenDialog(window, {
      title: "Choose backup folder or external drive",
      properties: ["openDirectory", "createDirectory"],
    });
    if (choice.canceled || !choice.filePaths[0]) return false;
    return backups.configure(d, choice.filePaths[0]);
  });
  handle(C.createEncryptedBackup, backupCreateSchema, (d) =>
    backups.create(d.password),
  );
  handle(C.previewEncryptedBackup, backupPreviewSchema, async (d) => {
    auth.require("backup.restore");
    const choice = await dialog.showOpenDialog(window, {
      title: "Select encrypted Mosque Suite backup",
      properties: ["openFile"],
      filters: [
        { name: "Encrypted Mosque Suite archive", extensions: ["msbackup"] },
      ],
    });
    if (choice.canceled || !choice.filePaths[0]) return null;
    return backups.inspect(choice.filePaths[0], d.password);
  });
  handle(C.restoreEncryptedBackup, backupRestoreSchema, (d) =>
    backups.restore(d),
  );
}
