import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { CHANNELS } from '../../shared/channels';
import { WorkspaceStore } from '../../electron/database/store';
import { fictionalFamily } from '../fixtures/registration';

const handlers = vi.hoisted(() => new Map<string, (event: unknown, input: unknown) => unknown>());
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => unknown) => handlers.set(channel, handler) } }));
import { registerIpc } from '../../electron/ipc';

beforeEach(() => handlers.clear());
describe('IPC boundaries', () => {
  it('exposes validated registration operations without allowing foreign writes or unknown fields', () => {
    const store = new WorkspaceStore(':memory:');
    const frame = { url: 'app://mosque/index.html' }; const contents = { mainFrame: frame };
    try {
      registerIpc({ webContents: contents } as unknown as BrowserWindow, store, { environment: 'test', version: 'test', canResetDemo: true }, false);
      const run = handlers.get(CHANNELS.saveFamily)!; const event = { sender: contents, senderFrame: frame };
      expect(run({ sender: {}, senderFrame: frame }, fictionalFamily())).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      expect(run(event, { ...fictionalFamily(), sql: 'DROP TABLE members' })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
      expect(store.registration.counts()).toEqual({ families: 0, livingMembers: 0 });
      expect(run(event, fictionalFamily())).toMatchObject({ ok: true, data: { familyCode: 'W1/001', totals: { living: 4 } } });
      expect(run(event, fictionalFamily())).toMatchObject({ ok: false, error: { code: 'DUPLICATE_FAMILY' } });
      expect(handlers.get(CHANNELS.families)!(event, { search: '', wardId: '', page: 1, pageSize: 10 })).toMatchObject({ ok: true, data: { total: 1 } });
    } finally { store.close(); }
  });
  it('validates inputs and denies foreign windows, subframes and origins', () => {
    const store = new WorkspaceStore(':memory:');
    const frame = { url: 'app://mosque/index.html' }; const contents = { mainFrame: frame }; const window = { webContents: contents } as unknown as BrowserWindow;
    try {
      registerIpc(window, store, { environment: 'test', version: 'test', canResetDemo: true }, false);
      const run = handlers.get(CHANNELS.snapshot)!;
      expect(run({ sender: contents, senderFrame: frame }, {})).toMatchObject({ ok: true });
      expect(run({ sender: contents, senderFrame: frame }, { sql: 'anything' })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
      expect(run({ sender: {}, senderFrame: frame }, {})).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      expect(run({ sender: contents, senderFrame: { url: frame.url } }, {})).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      frame.url = 'https://evil.test';
      expect(run({ sender: contents, senderFrame: frame }, {})).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    } finally { store.close(); }
  });
  it('forbids reset in packaged preview even if called directly', () => {
    const store = new WorkspaceStore(':memory:');
    try {
      registerIpc({ webContents: {} } as BrowserWindow, store, { environment: 'preview', version: 'test', canResetDemo: false }, false);
      expect(handlers.get(CHANNELS.reset)!({}, { confirmation: 'RESET DEMO' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      expect(store.getActivity()).toHaveLength(1);
    } finally { store.close(); }
  });
});
