import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
const control = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (event: unknown, input: unknown) => Promise<unknown>
  >(),
  idle: 0,
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel, handler) => control.handlers.set(channel, handler)),
  },
  powerMonitor: { getSystemIdleTime: () => control.idle },
  dialog: {},
  app: {},
}));
vi.mock("../../electron/event-output", () => ({ printDocuments: new Map() }));
import { registerSecurityIpc } from "../../electron/security-ipc";
import { securityChannels as C } from "../../shared/security";
import { WorkspaceStore } from "../fixtures/authenticated-store";
import type { BackupService } from "../../electron/backup-service";
const stores: WorkspaceStore[] = [];
beforeEach(() => {
  control.handlers.clear();
  control.idle = 0;
});
afterEach(() => stores.splice(0).forEach((s) => s.close()));
function fixture() {
  const s = new WorkspaceStore(":memory:");
  stores.push(s);
  const frame = { url: "app://mosque/index.html" },
    contents = { mainFrame: frame };
  const event = { sender: contents, senderFrame: frame };
  const backups = {
    clearPreview: vi.fn(),
    expirePreview: vi.fn(),
    state: vi.fn(() => {
      s.security.require("backup.create");
      return {};
    }),
  } as unknown as BackupService;
  registerSecurityIpc(
    { webContents: contents } as unknown as BrowserWindow,
    s,
    backups,
    false,
  );
  return { s, event, backups };
}
describe("security IPC boundary", () => {
  it("validates all twenty narrow security requests and rejects untrusted frames", async () => {
    const { event } = fixture();
    expect(control.handlers.size).toBe(20);
    for (const handler of control.handlers.values()) {
      expect(
        await handler(event, {
          sql: "SELECT secret",
          role: "super_admin",
          path: "C:\\secret",
          token: "forged",
        }),
      ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
      expect(await handler({ ...event, sender: {} }, {})).toMatchObject({
        ok: false,
        error: { code: "FORBIDDEN" },
      });
      expect(
        await handler(
          { ...event, senderFrame: { url: "https://untrusted.invalid" } },
          {},
        ),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
  });
  it("locks on native inactivity before an activity heartbeat can unlock records", async () => {
    const { s, event, backups } = fixture();
    control.idle = 601;
    expect(
      await control.handlers.get(C.touchSession)!(event, {}),
    ).toMatchObject({ ok: true, data: { authenticated: false, locked: true } });
    expect(s.security.state().authenticated).toBe(false);
    expect(backups.clearPreview).toHaveBeenCalled();
  });
  it("requires authentication for staff and backup screens", async () => {
    const { s, event } = fixture();
    s.security.logout();
    for (const channel of [C.getStaffDirectory, C.getBackupState])
      expect(await control.handlers.get(channel)!(event, {})).toMatchObject({
        ok: false,
        error: { code: "AUTH_REQUIRED" },
      });
  });
});
