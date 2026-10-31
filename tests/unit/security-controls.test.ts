import {blankPlan} from '../../shared/finance';
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import { WorkspaceStore } from "../../electron/database/store";
import { migrate, migrations } from "../../electron/database/migrations";
import { hashPassword, verifyPassword } from "../../electron/security-crypto";
import { blankEvent, eventToDraft } from "../../shared/life-events";
import { maskIdentityReferences } from "../../shared/sensitive-data";
import { fictionalFamily } from "../fixtures/registration";
const password = "Fictional security control password 123!";
const stores: WorkspaceStore[] = [],
  dirs: string[] = [];
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  for (const dir of dirs.splice(0)) {
    if (
      !/^mosque-security-control-[A-Za-z0-9]+$/.test(
        relative(resolve(tmpdir()), dir),
      )
    )
      throw new Error("Unsafe cleanup");
    rmSync(dir, { recursive: true, force: true });
  }
});
function fixture(file = ":memory:") {
  const s = new WorkspaceStore(file, true, true);
  stores.push(s);
  if (s.security.state().setupRequired)
    s.security.bootstrap({
      username: "fixture.admin",
      name: "Fictional Admin",
      password,
      confirmed: true,
    });
  s.security.login({ username: "fixture.admin", password });
  return s;
}
function add(
  s: WorkspaceStore,
  roleId: "secretary" | "read_only" = "read_only",
) {
  s.security.saveStaff({
    id: "",
    revision: 0,
    username: "fixture.staff",
    name: "Fictional Staff",
    roleId,
    allWards: true,
    wardIds: [],
    active: true,
    password,
    currentPassword: password,
    confirmed: true,
  });
  return s.security
    .directory()
    .users.find((u) => u.username === "fixture.staff")!;
}
function signStaff(s: WorkspaceStore) {
  s.security.logout();
  s.security.login({ username: "fixture.staff", password });
  s.security.changePassword({
    currentPassword: password,
    newPassword: password,
  });
  s.security.login({ username: "fixture.staff", password });
}
describe("security release controls", () => {
  it('keeps submitted free text out of legacy domain audit payloads',()=>{
    const s=fixture();const privateName='Fictional private 999988887777';s.finance.savePlan({...blankPlan(),name:privateName,effectiveDate:'2026-01-01'});
    const payloads=s.security.db.prepare('SELECT details FROM transaction_audit_log').all();expect(JSON.stringify(payloads)).not.toContain(privateName);expect(JSON.stringify(payloads)).not.toContain('999988887777');expect(s.finance.auditHistory().every(row=>row.details==='{}')).toBe(true);
  });

  it("uses unique Argon2id salts and rejects malformed hashes", () => {
    const first = hashPassword(password),
      second = hashPassword(password);
    expect(first).not.toBe(second);
    expect(verifyPassword(password, first)).toBe(true);
    expect(verifyPassword("incorrect", first)).toBe(false);
    expect(
      verifyPassword(password, "$argon2id$v=19$m=999999999,t=3,p=1$bad$bad"),
    ).toBe(false);
  });
  it("preserves populated Phase 5 records through migration 6", () => {
    const dir = mkdtempSync(join(tmpdir(), "mosque-security-control-"));
    dirs.push(dir);
    const file = join(dir, "workspace.sqlite3");
    const db = new Database(file);
    migrate(db, migrations.slice(0, 5));
    db.prepare(
      "UPDATE mosque_settings SET name='Preserved Phase 5 mosque',name_ml='മാതൃകാ പള്ളി'",
    ).run();
    const before = db
      .prepare("SELECT * FROM schema_migrations ORDER BY version")
      .all();
    db.close();
    const s = fixture(file);
    expect(s.getSettings()).toMatchObject({
      name: "Preserved Phase 5 mosque",
      nameMl: "മാതൃകാ പള്ളി",
    });
    expect(
      s.security.db
        .prepare(
          "SELECT * FROM schema_migrations WHERE version<=5 ORDER BY version",
        )
        .all(),
    ).toEqual(before);
    expect(s.getSchemaVersion()).toBe(6);
    expect(s.checkStorage().integrity).toBe("ok");
  });
  it("retains audit attribution across restarts and detects tampering by a local administrator", () => {
    const dir = mkdtempSync(join(tmpdir(), "mosque-security-control-"));
    dirs.push(dir);
    const file = join(dir, "workspace.sqlite3");
    const a = fixture(file);
    a.registration.save(fictionalFamily());
    const user = a.security.state().user!.id;
    a.close();
    const b = fixture(file);
    const audit = b.security.auditHistory({
      action: "registration.save",
      outcome: "",
      from: "",
      until: "",
      page: 1,
    });
    expect(audit).toMatchObject({ valid: true, total: 1 });
    expect(audit.items[0]).toMatchObject({ staffId: user, outcome: "success" });
    expect(audit.items[0].entityId).not.toBe("");
    b.security.db.exec("DROP TRIGGER audit_logs_immutable_update");
    b.security.db
      .prepare("UPDATE audit_logs SET summary='Locally tampered' WHERE seq=1")
      .run();
    expect(b.security.integrity()).toBe(false);
  });
  it("requires a forced password change, disables login and revokes role grants", () => {
    const s = fixture();
    const staff = add(s);
    s.security.logout();
    s.security.login({ username: "fixture.staff", password });
    expect(() => s.registration.counts()).toThrow("AUTH_PASSWORD_CHANGE");
    s.security.logout();
    s.security.login({ username: "fixture.admin", password });
    const { lastLogin, mustChangePassword, ...editable } = staff;
    s.security.saveStaff({
      ...editable,
      active: false,
      password: "",
      currentPassword: password,
      confirmed: true,
    });
    s.security.logout();
    expect(() =>
      s.security.login({ username: "fixture.staff", password }),
    ).toThrow("AUTH_INVALID");
    s.security.login({ username: "fixture.admin", password });
    const role = s.security
      .directory()
      .roles.find((r) => r.id === "read_only")!;
    s.security.saveRole({
      ...role,
      permissions: ["members.view"],
      currentPassword: password,
      confirmed: true,
    });
    expect(
      s.security.directory().roles.find((r) => r.id === "read_only")!
        .permissions,
    ).toEqual(["members.view"]);
  });
  it("blocks in-flight service work after another staff session replaces its actor", async () => {
    const s = fixture();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const work = s.security.operation(async () => {
      await gate;
      return s.registration.save(fictionalFamily());
    });
    s.security.logout();
    s.security.login({ username: "fixture.admin", password });
    release();
    await expect(work).rejects.toThrow("AUTH_REQUIRED");
    expect(s.registration.counts().families).toBe(0);
  });
  it("redacts legacy identity references, restricts their viewing and blocks new full identifiers", () => {
    const s = fixture();
    const f = s.registration.save(fictionalFamily());
    const event = s.lifeEvents.save({
      ...blankEvent("death"),
      number: "D-PRIVATE",
      memberId: f.guardianMemberId,
      documentReferences: "Local reference 1234",
    });
    s.security.db
      .prepare("UPDATE deaths SET document_references=? WHERE event_id=?")
      .run("Fictional 9999 8888 7777", event.id);
    const masked = s.lifeEvents.get({ id: event.id });
    expect(masked.documentReferences).toBe("Fictional •••• •••• 7777");
    expect(maskIdentityReferences("123456789012")).toBe("•••• •••• 9012");
    expect(() =>
      s.lifeEvents.save({
        ...eventToDraft(masked),
        documentReferences: "111122223333",
      }),
    ).toThrow("AUTH_PERMISSION");
    add(s, "secretary");
    signStaff(s);
    const restricted = s.lifeEvents.get({ id: event.id });
    expect(restricted.documentReferences).toBe("");
    s.lifeEvents.save({
      ...eventToDraft(restricted),
      remarks: "Fictional authorized edit",
    });
    expect(
      s.security.db
        .prepare(
          "SELECT document_references AS refs FROM deaths WHERE event_id=?",
        )
        .get(event.id),
    ).toEqual({ refs: "Fictional 9999 8888 7777" });
    expect(() => s.lifeEvents.document({ id: event.id })).toThrow(
      "AUTH_PERMISSION",
    );
  });
  it("rolls back family writes if the security audit cannot be appended", () => {
    const s = fixture();
    s.security.db.exec(
      "CREATE TRIGGER simulate_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action='registration.save' BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
    );
    expect(() => s.registration.save(fictionalFamily())).toThrow(
      "test audit failure",
    );
    expect(s.registration.counts().families).toBe(0);
    expect(s.security.integrity()).toBe(true);
  });
});
