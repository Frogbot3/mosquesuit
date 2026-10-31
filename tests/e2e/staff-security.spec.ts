import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdir, rm, readFile, readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { authenticate, password } from "../fixtures/electron-auth";
import { fictionalFamily } from "../fixtures/registration";
let app: ElectronApplication,
  page: Page,
  profile: string,
  userData: string,
  files: string,
  errors: string[];
async function launch() {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (e): e is [string, string] => e[1] !== undefined,
      ),
    ),
    MOSQUE_TEST_PROFILE: profile,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.MOSQUE_DEV_URL;
  app = await electron.launch({ args: ["."], env });
  page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  userData = await app.evaluate(({ app }) => app.getPath("userData"));
}
test.beforeEach(async () => {
  test.skip(Boolean(process.env.MOSQUE_PACKAGED_EXE));
  profile = `test-${randomUUID()}`;
  files = join(tmpdir(), `mosque-security-e2e-${randomUUID()}`);
  await mkdir(files);
  errors = [];
  await launch();
});
test.afterEach(async () => {
  if (app) {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
      )
      .catch(() => {});
    await app.close();
  }
  if (
    relative(
      resolve(process.env.APPDATA!, "Mosque Suite Development"),
      userData,
    ) !== profile ||
    !/^mosque-security-e2e-[\da-f-]{36}$/.test(
      relative(resolve(tmpdir()), files),
    )
  )
    throw new Error("Unsafe cleanup");
  await rm(userData, { recursive: true, force: true });
  await rm(files, { recursive: true, force: true });
  expect(errors).toEqual([]);
});
async function go(path: string) {
  await page.goto(`app://mosque/index.html#${path}`);
  await expect(page.locator("h1")).toBeVisible();
}
test("creates an administrator in Malayalam, authenticates offline and clears records on lock", async () => {
  await expect(
    page.getByRole("heading", { name: "Create the first administrator" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.mosque!.listFamilies({
        search: "",
        wardId: "",
        page: 1,
        pageSize: 10,
      }),
    ),
  ).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
  await page.getByLabel("Language / ഭാഷ").selectOption("ml");
  await expect(
    page.getByRole("heading", { name: "ആദ്യ അഡ്മിനിസ്ട്രേറ്ററെ സൃഷ്ടിക്കുക" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode()
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByLabel("Language / ഭാഷ").selectOption("en");
  const recovery = join(files, "recovery.json");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, recovery);
  await page.getByLabel("Username", { exact: true }).fill("fixture.admin");
  await page.getByLabel("Staff name").fill("മാതൃകാ അഡ്മിൻ");
  await page
    .getByLabel("New password (12–128 characters)", { exact: true })
    .fill(password);
  await page.getByLabel("Repeat new password", { exact: true }).fill(password);
  await page.getByLabel("I have reviewed and confirm this change").check();
  await page
    .getByRole("button", { name: "Create administrator & save recovery file" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    JSON.parse(await readFile(recovery, "utf8")).recoveryCode,
  ).toHaveLength(43);
  await page.context().setOffline(true);
  await page.getByLabel("Username", { exact: true }).fill("fixture.admin");
  await page.getByLabel("Password", { exact: true }).fill("Wrong password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Credentials could not be verified",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A place for every family." }),
  ).toBeVisible();
  expect(
    await page.evaluate((d) => window.mosque!.saveFamily(d), fictionalFamily()),
  ).toMatchObject({ ok: true });
  await go("/families");
  await expect(
    page.getByText("Fictional Green House", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock screen", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace locked" }),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional Green House", { exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.mosque!.getSnapshot())).toMatchObject(
    { ok: false, error: { code: "AUTH_LOCKED" } },
  );
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });
  await page.getByLabel("Username", { exact: true }).fill("fixture.admin");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your families, together." }),
  ).toBeVisible();
  const audit = await page.evaluate(() =>
    window.mosque!.getSecurityAudit({
      action: "login.failed",
      outcome: "",
      from: "",
      until: "",
      page: 1,
    }),
  );
  expect(audit).toMatchObject({ ok: true, data: { valid: true, total: 1 } });
  expect(JSON.stringify(audit)).not.toContain(password);
});
test("manages staff through the UI and enforces ward scope and forced password change", async () => {
  await authenticate(app, page);
  for (const d of [
    fictionalFamily("201", "ward-2"),
    fictionalFamily("301", "ward-3"),
  ])
    expect(
      await page.evaluate((d) => window.mosque!.saveFamily(d), d),
    ).toMatchObject({ ok: true });
  await go("/staff/new");
  await page.getByLabel("Staff name").fill("മാതൃകാ ജീവനക്കാരൻ");
  await page.getByLabel("Username").fill("ward.operator");
  await page.getByLabel("Role", { exact: true }).selectOption("ward_operator");
  await page.getByLabel(/Ward 2/).check();
  await page
    .getByLabel("Temporary password (must change at next sign in)")
    .fill(password);
  await page
    .getByLabel("Your current password", { exact: true })
    .fill(password);
  await page.getByLabel("I have reviewed and confirm this change").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "ward.operator", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("ward.operator");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Change password", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.mosque!.getSnapshot())).toMatchObject(
    { ok: false, error: { code: "AUTH_PASSWORD_CHANGE" } },
  );
  const changed = "New fictional operator password 123!";
  await page
    .getByLabel("Your current password", { exact: true })
    .fill(password);
  await page
    .getByLabel("New password (12–128 characters)", { exact: true })
    .fill(changed);
  await page.getByLabel("Repeat new password", { exact: true }).fill(changed);
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill("ward.operator");
  await page.getByLabel("Password", { exact: true }).fill(changed);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your account does not have permission for this action.",
    }),
  ).toBeVisible();
  await go("/families");
  const list = await page.evaluate(() =>
    window.mosque!.listFamilies({
      search: "",
      wardId: "",
      page: 1,
      pageSize: 10,
    }),
  );
  expect(list).toMatchObject({ ok: true, data: { total: 1 } });
  if (list.ok) expect(list.data.items[0].familyCode).toContain("201");
  expect(
    await page.evaluate(() =>
      window.mosque!.listFamilies({
        search: "",
        wardId: "ward-3",
        page: 1,
        pageSize: 10,
      }),
    ),
  ).toMatchObject({ ok: false, error: { code: "AUTH_SCOPE" } });
  expect(
    await page.evaluate(() => window.mosque!.getStaffDirectory()),
  ).toMatchObject({ ok: false, error: { code: "AUTH_PERMISSION" } });
  expect(
    await page.evaluate(() =>
      window.mosque!.setFinanceDemoRole({ role: "administrator" }),
    ),
  ).toMatchObject({ ok: false, error: { code: "AUTH_PERMISSION" } });
  await expect(
    page
      .locator(".sidebar")
      .getByRole("link", { name: "Staff & permissions", exact: true }),
  ).toHaveCount(0);
});
test("creates encrypted backups, previews records, saves a safety copy and reopens the restored generation", async () => {
  await authenticate(app, page);
  expect(
    await page.evaluate((d) => window.mosque!.saveFamily(d), fictionalFamily()),
  ).toMatchObject({ ok: true });
  await go("/backup");
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, files);
  const secret = "Fictional external backup passphrase 456!";
  await page
    .getByLabel("Backup passphrase (12–128 characters)", { exact: true })
    .fill(secret);
  await page
    .getByLabel("Your current password", { exact: true })
    .fill(password);
  await page.getByLabel("I have reviewed and confirm this change").check();
  await page
    .getByRole("button", { name: "Choose folder & save backup settings" })
    .click();
  await expect(page.getByText(files, { exact: false }).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Create encrypted backup", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: /manual · verified/ }),
  ).toBeVisible();
  const archive = join(
    files,
    (await readdir(files)).find((n) => n.endsWith(".msbackup"))!,
  );
  const bytes = await readFile(archive);
  expect(bytes.subarray(0, 4).toString()).toBe("MSB6");
  expect(bytes.includes(Buffer.from("Fictional Green House"))).toBe(false);
  expect(
    await page.evaluate(
      (d) => window.mosque!.saveFamily(d),
      fictionalFamily("002"),
    ),
  ).toMatchObject({ ok: true });
  await go("/backup/restore");
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, archive);
  await page
    .getByLabel("Backup passphrase (12–128 characters)", { exact: true })
    .fill("Wrong fictional passphrase 999!");
  await page.getByRole("button", { name: "Choose backup & verify" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Wrong backup passphrase",
  );
  await page
    .getByLabel("Backup passphrase (12–128 characters)", { exact: true })
    .fill(secret);
  await page.getByRole("button", { name: "Choose backup & verify" }).click();
  await expect(
    page
      .locator("dt")
      .filter({ hasText: /^Families$/ })
      .locator("..")
      .locator("dd"),
  ).toHaveText("1");
  expect(
    await page.evaluate(() =>
      window.mosque!.listFamilies({
        search: "",
        wardId: "",
        page: 1,
        pageSize: 10,
      }),
    ),
  ).toMatchObject({ ok: true, data: { total: 2 } });
  // Observe the real restart request, then reopen using Playwright's owned process.
  await app.evaluate(({ app }) => {
    const state = globalThis as unknown as {
      originalQuit: typeof app.quit;
      restartRequested: boolean;
    };
    state.originalQuit = app.quit.bind(app);
    app.relaunch = () => {
      state.restartRequested = true;
    };
    app.quit = () => {};
  });
  await page
    .getByLabel("Your current password", { exact: true })
    .fill(password);
  await page
    .getByLabel("Type RESTORE VERIFIED BACKUP to confirm")
    .fill("RESTORE VERIFIED BACKUP");
  await page
    .getByRole("button", { name: "Restore verified backup", exact: true })
    .click();
  await expect
    .poll(() =>
      app.evaluate(
        () =>
          (globalThis as unknown as { restartRequested: boolean })
            .restartRequested,
      ),
    )
    .toBe(true);
  await app.evaluate(({ app }) => {
    app.quit = (
      globalThis as unknown as { originalQuit: typeof app.quit }
    ).originalQuit;
  });
  await app.close();
  await launch();
  await authenticate(app, page);
  expect(
    await page.evaluate(() =>
      window.mosque!.listFamilies({
        search: "",
        wardId: "",
        page: 1,
        pageSize: 10,
      }),
    ),
  ).toMatchObject({ ok: true, data: { total: 1 } });
  expect(
    await page.evaluate(() => window.mosque!.checkStorage()),
  ).toMatchObject({
    ok: true,
    data: { integrity: "ok", foreignKeys: true, schemaVersion: 6 },
  });
  expect(
    await page.evaluate(() =>
      window.mosque!.getSecurityAudit({
        action: "backup.restored",
        outcome: "",
        from: "",
        until: "",
        page: 1,
      }),
    ),
  ).toMatchObject({ ok: true, data: { valid: true, total: 1 } });
  expect(
    (await readdir(files)).filter((n) => n.endsWith(".msbackup")),
  ).toHaveLength(2);
  expect(
    JSON.parse(await readFile(join(userData, "active-workspace.json"), "utf8"))
      .generation,
  ).toMatch(/^generation-/);
});
test("renders security pages in English and Malayalam with keyboard labels, dark mode and compact layout", async () => {
  await authenticate(app, page);
  await mkdir(resolve("tmp/security-review"), { recursive: true });
  for (const route of [
    "/staff",
    "/staff/new",
    "/staff/roles",
    "/audit",
    "/backup",
    "/backup/restore",
    "/security",
  ]) {
    await go(route);
    await expect(
      page.locator(".security-section .panel").first(),
    ).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .setLegacyMode()
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
      route,
    ).toEqual([]);
  }
  await go("/staff");
  await expect(
    page.getByRole("cell", { name: "fixture.admin", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve("tmp/security-review/staff-en.png"),
    fullPage: true,
  });
  await page.getByLabel("Language", { exact: true }).selectOption("ml");
  await expect(page.locator("html")).toHaveAttribute("lang", "ml");
  await page.getByRole("button", { name: "രൂപഭാവം മാറ്റുക" }).click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1000, 720),
  );
  await page.screenshot({
    path: resolve("tmp/security-review/compact-inspect.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      overflow: [...document.querySelectorAll("*")]
        .filter(
          (e) =>
            e.getBoundingClientRect().right > window.innerWidth + 1 &&
            !e.closest(".table-scroll"),
        )
        .map((e) => ({
          tag: e.tagName,
          class: e.className,
          right: e.getBoundingClientRect().right,
        }))
        .slice(0, 15),
    })),
  ).toEqual({ fits: true, overflow: [] });
  await page.screenshot({
    path: resolve("tmp/security-review/staff-ml-dark.png"),
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .setLegacyMode()
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
