import { ipcMain, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { emptyRequest, resetSchema, settingsSchema, type Result, type Snapshot } from '../shared/contracts';
import { CHANNELS } from '../shared/channels';
import { ConflictError, type WorkspaceStore } from './database/store';
import { isTrustedDocument } from './security';
import { entityRequestSchema, familyQuerySchema, saveFamilySchema } from '../shared/registration';
import { RegistryError } from './database/registration-store';
import { LifeEventError } from '../shared/life-events';

export function registerIpc(window: BrowserWindow, store: WorkspaceStore, info: Pick<Snapshot, 'environment' | 'version' | 'canResetDemo'>, development: boolean): void {
  function handle<T>(channel: string, schema: z.ZodType, action: (input: unknown) => T) {
    ipcMain.handle(channel, (event, input: unknown): Result<T> => {
      if (event.sender !== window.webContents || !event.senderFrame || event.senderFrame !== event.sender.mainFrame ||
          !isTrustedDocument(event.senderFrame.url, development)) {
        return { ok: false, error: { code: 'FORBIDDEN', message: 'This request is not allowed.' } };
      }
      const parsed = schema.safeParse(input);
      if (!parsed.success) return { ok: false, error: { code: 'VALIDATION', message: 'Check the supplied fields and try again.' } };
      try { return { ok: true, data: action(parsed.data) }; }
      catch (error) {
        if (error instanceof RegistryError || error instanceof LifeEventError) return { ok: false, error: { code: error.code, message: 'The registration could not be saved. Review the record and try again.' } };
        if (error instanceof ConflictError) return { ok: false, error: { code: 'CONFLICT', message: error.message } };
        // Never return SQL, paths, stack traces, or submitted values to the renderer.
        return { ok: false, error: { code: 'STORAGE', message: 'The change could not be completed. Your existing records were kept. Restart the app and try again.' } };
      }
    });
  }
  handle(CHANNELS.snapshot, emptyRequest, (): Snapshot => ({
    ...info, settings: store.getSettings(), wards: store.getWards(), activity: store.getActivity(), schemaVersion: store.getSchemaVersion(), registryCounts: store.registration.counts(), lifeEventsDemo: store.lifeEvents.enabled,financeDemo:store.finance.enabled,
  }));
  handle(CHANNELS.settings, settingsSchema, input => store.saveSettings(input));
  handle(CHANNELS.health, emptyRequest, () => store.checkStorage());
  handle(CHANNELS.families, familyQuerySchema, input => store.registration.list(input));
  handle(CHANNELS.family, entityRequestSchema, input => store.registration.get(input));
  handle(CHANNELS.saveFamily, saveFamilySchema, input => store.registration.save(input));
  handle(CHANNELS.members, familyQuerySchema, input => store.registration.listMembers(input));
  handle(CHANNELS.member, entityRequestSchema, input => store.registration.getMember(input));
  if (info.canResetDemo) handle(CHANNELS.reset, resetSchema, () => { store.resetDemo(); return null; });
  else ipcMain.handle(CHANNELS.reset, (): Result<null> => ({ ok: false, error: { code: 'FORBIDDEN', message: 'Demo reset is unavailable in packaged builds.' } }));
}
