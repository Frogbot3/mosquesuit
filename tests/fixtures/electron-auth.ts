import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
export const password = "Fictional test administrator 123!";
export async function authenticate(app: ElectronApplication, page: Page) {
  await page.waitForFunction(() => Boolean(window.mosque));
  const state = await page.evaluate(() => window.mosque!.getSecurityState());
  if (!state.ok) throw new Error(state.error.code);
  if (state.data.authenticated) return;
  if (state.data.setupRequired) {
    const file = join(tmpdir(), `mosque-test-recovery-${randomUUID()}.json`);
    await app.evaluate(({ dialog }, file) => {
      const holder = globalThis as unknown as {
        originalSave: typeof dialog.showSaveDialog;
      };
      holder.originalSave = dialog.showSaveDialog;
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, file);
    try {
      const result = await page.evaluate(
        (password) =>
          window.mosque!.bootstrapAdministrator({
            username: "fixture.admin",
            name: "Fictional Admin",
            password,
            confirmed: true,
          }),
        password,
      );
      expect(result).toEqual({ ok: true, data: null });
    } finally {
      await app.evaluate(({ dialog }) => {
        dialog.showSaveDialog = (
          globalThis as unknown as {
            originalSave: typeof dialog.showSaveDialog;
          }
        ).originalSave;
      });
      await rm(file, { force: true });
    }
  }
  const result = await page.evaluate(
    (password) =>
      window.mosque!.loginStaff({ username: "fixture.admin", password }),
    password,
  );
  expect(result).toMatchObject({ ok: true, data: { authenticated: true } });
  await page.reload();
}
export async function signInAsViewer(page: Page) {
  const result = await page.evaluate(async (password) => {
    const api = window.mosque!;
    const d = await api.getStaffDirectory();
    if (!d.ok) return d;
    if (!d.data.users.some((u) => u.username === "fixture.viewer")) {
      const r = await api.saveStaffAccount({
        id: "",
        revision: 0,
        username: "fixture.viewer",
        name: "Fictional Viewer",
        roleId: "read_only",
        allWards: true,
        wardIds: [],
        active: true,
        password,
        currentPassword: password,
        confirmed: true,
      });
      if (!r.ok) return r;
    }
    await api.logoutStaff();
    const login = await api.loginStaff({
      username: "fixture.viewer",
      password,
    });
    if (!login.ok) return login;
    if (login.data.mustChangePassword) {
      await api.changeStaffPassword({
        currentPassword: password,
        newPassword: password,
      });
      return api.loginStaff({ username: "fixture.viewer", password });
    }
    return login;
  }, password);
  expect(result).toMatchObject({ ok: true });
  await page.reload();
}
