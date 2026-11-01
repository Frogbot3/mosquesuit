import { app, ipcMain, dialog, nativeImage, type BrowserWindow } from 'electron';
import { basename, extname } from 'node:path';
import { z } from 'zod';
import { emptyRequest, type Result } from '../shared/contracts';
import { releaseChannels as C, mosqueSetupSchema, mappingSchema, importCommitSchema } from '../shared/release';
import { SecurityError } from '../shared/security';
import { ConflictError, type WorkspaceStore } from './database/store';
import type { BackupService } from './backup-service';
import { DeploymentService } from './deployment-service';
import { ImportService } from './import-service';
import { ReleaseService } from './release-service';
import { isTrustedDocument } from './security';
import { readBounded, externalDestination, atomicPrivateFile } from './secure-files';
import { outputFamily } from './family-output';
import { releaseText } from '../shared/release-labels';
export function registerReleaseIpc(window: BrowserWindow, store: WorkspaceStore, backup: BackupService, development: boolean, rendererRoot: string) {
  const setup = new DeploymentService(store), imports = new ImportService(store, backup), release = new ReleaseService(store, app.getVersion()), auth = store.security;
  const t = (key: string) => releaseText(auth.state().locale, key);
  function handle<S extends z.ZodType, T>(channel: string, schema: S, run: (input: z.output<S>) => T | Promise<T>) {
    ipcMain.handle(channel, async (event, input: unknown): Promise<Result<T>> => {
      if (event.sender !== window.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame || !isTrustedDocument(event.senderFrame.url, development)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Request denied.' } };
      try { const data = schema.parse(input); auth.require(); return { ok: true, data: await (channel === C.commitImport ? auth.backupOperation(() => run(data)) : auth.operation(() => run(data))) }; }
      catch (error) {
        release.recordFailure(channel.includes('Import') ? 'import' : channel.includes('Deployment') ? 'setup' : channel === C.outputFamily ? 'output' : 'release', error instanceof z.ZodError ? 'validation' : error instanceof SecurityError ? 'permission' : 'operation_failed');
        return { ok: false, error: { code: error instanceof SecurityError ? error.code : error instanceof z.ZodError ? 'VALIDATION' : error instanceof ConflictError ? 'CONFLICT' : 'STORAGE', message: 'The operation could not be completed.' } };
      }
    });
  }
  const importAuth = () => { auth.require('settings.change'); auth.require('families.create'); auth.require('backup.create'); auth.global(); };
  handle(C.getDeploymentSettings, emptyRequest, () => setup.state());
  handle(C.saveDeploymentSettings, mosqueSetupSchema, d => setup.save(d));
  handle(C.chooseDeploymentLogo, z.object({ remove: z.boolean() }).strict(), async d => {
    setup.state(); auth.require('finance.configure'); if (d.remove) return setup.setLogo('');
    const picked = await dialog.showOpenDialog(window, { title: t('chooseLogo'), properties: ['openFile'], filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (picked.canceled || !picked.filePaths[0]) return setup.state().logo;
    const bytes = await readBounded(picked.filePaths[0], 1048576);
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) > 1024 || bytes.readUInt32BE(20) > 1024) throw new Error('INVALID_LOGO');
    const image = nativeImage.createFromBuffer(bytes); if (image.isEmpty()) throw new Error('INVALID_LOGO'); return setup.setLogo(image.resize({ width: 160 }).toDataURL());
  });
  handle(C.selectImportFile, emptyRequest, async () => {
    importAuth(); const picked = await dialog.showOpenDialog(window, { title: t('select'), properties: ['openFile'], filters: [{ name: 'CSV / XLSX', extensions: ['csv', 'xlsx'] }] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    importAuth(); const path = picked.filePaths[0]; return imports.select(await readBounded(path, 4 * 1024 * 1024), extname(path).toLowerCase(), basename(path));
  });
  handle(C.previewImport, mappingSchema, d => imports.preview(d));
  handle(C.commitImport, importCommitSchema, d => imports.commit(d));
  handle(C.cancelImport, emptyRequest, () => imports.cancel());
  handle(C.exportImportReport, z.object({ previewId: z.uuid() }).strict(), async d => {
    auth.require('data.export'); const preview = imports.report(d.previewId);
    const picked = await dialog.showSaveDialog(window, { title: t('report'), defaultPath: 'Mosque-Suite-Import-Validation.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (picked.canceled || !picked.filePath) return false;
    const destination = await externalDestination(picked.filePath, app.getPath('userData')); imports.report(d.previewId); auth.require('data.export');
    // No source values, names, filename or preview samples in the report.
    await atomicPrivateFile(destination, JSON.stringify({ format: 1, createdAt: new Date().toISOString(), families: preview.families, members: preview.members, newWards: preview.newWards, sourceRows: preview.sourceRows, issues: preview.issues }, null, 2)); auth.audit('export.import_report', 'import', d.previewId); return true;
  });
  handle(C.getReleaseState, emptyRequest, () => release.state());
  handle(C.checkForUpdates, emptyRequest, () => release.check());
  handle(C.activateOfflineLicense, emptyRequest, async () => {
    auth.require('settings.change'); auth.global(); const picked = await dialog.showOpenDialog(window, { title: t('activate'), properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (picked.canceled || !picked.filePaths[0]) return release.state();
    return release.activate(JSON.parse((await readBounded(picked.filePaths[0], 65536)).toString('utf8')));
  });
  handle(C.exportDiagnostics, emptyRequest, async () => {
    release.diagnostics(); const picked = await dialog.showSaveDialog(window, { title: t('diagnostics'), defaultPath: 'Mosque-Suite-Diagnostics.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (picked.canceled || !picked.filePath) return false;
    const destination = await externalDestination(picked.filePath, app.getPath('userData')); const data = release.diagnostics();
    await atomicPrivateFile(destination, JSON.stringify(data, null, 2)); auth.audit('export.diagnostics', 'diagnostics', ''); return true;
  });
  handle(C.outputFamily, z.object({ id: z.uuid(), format: z.enum(['pdf', 'print']) }).strict(), d => outputFamily(window, store, rendererRoot, d));
}
