import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { WorkspaceStore } from "../../electron/database/store";
import { SecurityStore } from "../../electron/database/security-store";
import { migrate } from "../../electron/database/migrations";
import { fictionalFamily } from "../fixtures/registration";
import { verifyPassword } from "../../electron/security-crypto";
const password = "Fictional setup password 789!";
const other = "Fictional changed password 456!";
const stores: WorkspaceStore[] = [];
const databases: Database.Database[] = [];
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  databases.splice(0).forEach((d) => d.close());
});
function fixture() {
  const s = new WorkspaceStore(":memory:", true, true, true);
  stores.push(s);
  const kit = s.security.bootstrap({
    username: "fixture.admin",
    name: "Fictional Admin",
    password,
    confirmed: true,
  });
  s.security.login({ username: "fixture.admin", password });
  return { s, a: s.security, kit };
}
function add(
  a: SecurityStore,
  roleId: "ward_operator" | "accountant" | "read_only" = "ward_operator",
) {
  a.saveStaff({
    id: "",
    revision: 0,
    username: "fixture.staff",
    name: "Fictional Staff",
    roleId,
    allWards: roleId !== "ward_operator",
    wardIds: roleId === "ward_operator" ? ["ward-2"] : [],
    active: true,
    password: other,
    currentPassword: password,
    confirmed: true,
  });
  a.logout();
  a.login({ username: "fixture.staff", password: other });
  a.changePassword({
    currentPassword: other,
    newPassword: "New fictional staff password 123!",
  });
  a.login({
    username: "fixture.staff",
    password: "New fictional staff password 123!",
  });
}
describe("offline staff security", () => {
  it("requires login before records and prevents duplicate administrator bootstrap", () => {
    const s = new WorkspaceStore(":memory:", true, true, true);
    stores.push(s);
    expect(() =>
      s.registration.list({ search: "", wardId: "", page: 1, pageSize: 10 }),
    ).toThrow("AUTH_REQUIRED");
    expect(() => s.getSettings()).toThrow("AUTH_REQUIRED");
    expect(() => s.finance.setup()).toThrow("AUTH_REQUIRED");
    const kit = s.security.bootstrap({
      username: "fixture.admin",
      name: "Fictional Admin",
      password,
      confirmed: true,
    });
    expect(kit.recoveryCode).toHaveLength(43);
    expect(() =>
      s.security.bootstrap({
        username: "another.admin",
        name: "Other",
        password,
        confirmed: true,
      }),
    ).toThrow("AUTH_SETUP_DONE");
    expect(
      s.security.login({ username: "fixture.admin", password }).authenticated,
    ).toBe(true);
    expect(s.security.state()).not.toHaveProperty("token");
    const row = s.security.db
      .prepare("SELECT password_hash,recovery_hash FROM staff_users")
      .get() as { password_hash: string; recovery_hash: string };
    expect(row.password_hash).toContain("$argon2id$v=19$m=65536,t=3,p=1$");
    expect(row.password_hash).not.toContain(password);
    expect(row.recovery_hash).not.toContain(kit.recoveryCode);
    expect(verifyPassword(password, row.password_hash)).toBe(true);
  });
  it("throttles failed passwords and locks using a server clock", () => {
    const db = new Database(":memory:");
    databases.push(db);
    migrate(db);
    let now = 1000000;
    const a = new SecurityStore(db, () => now);
    a.bootstrap({
      username: "fixture.admin",
      name: "Admin",
      password,
      confirmed: true,
    });
    for (let n = 0; n < 5; n++)
      expect(() =>
        a.login({ username: "fixture.admin", password: "wrong password" }),
      ).toThrow("AUTH_INVALID");
    expect(() => a.login({ username: "fixture.admin", password })).toThrow(
      "AUTH_THROTTLED",
    );
    now += 16 * 60000;
    a.login({ username: "fixture.admin", password });
    now += 10 * 60000;
    expect(a.state()).toMatchObject({ authenticated: false, locked: true });
    expect(() => a.require()).toThrow("AUTH_LOCKED");
    a.login({ username: "fixture.admin", password });
    a.lock();
    expect(() => a.require()).toThrow("AUTH_LOCKED");
  });
  it("restricts list, counts, direct member/family access and ward moves in the service layer", () => {
    const { s, a } = fixture();
    const own = s.registration.save(fictionalFamily("201", "ward-2"));
    const other = s.registration.save(fictionalFamily("301", "ward-3"));
    add(a);
    expect(
      s.registration
        .list({ search: "", wardId: "", page: 1, pageSize: 10 })
        .items.map((f) => f.id),
    ).toEqual([own.id]);
    expect(s.registration.counts().families).toBe(1);
    expect(
      s.registration.listMembers({
        search: "",
        wardId: "",
        page: 1,
        pageSize: 10,
      }).total,
    ).toBe(4);
    expect(() => s.registration.get({ id: other.id })).toThrow("AUTH_SCOPE");
    expect(() =>
      s.registration.getMember({ id: other.guardianMemberId }),
    ).toThrow("AUTH_SCOPE");
    expect(() => s.registration.save(fictionalFamily("302", "ward-3"))).toThrow(
      "AUTH_SCOPE",
    );
    expect(() =>
      s.lifeEvents.list({
        kind: "divorce",
        search: "",
        wardId: "",
        status: "",
        from: "",
        until: "",
        page: 1,
        pageSize: 10,
      }),
    ).toThrow("AUTH_PERMISSION");
    expect(() => a.directory()).toThrow("AUTH_PERMISSION");
    expect(() => s.integrations.state()).toThrow("AUTH_PERMISSION");
  });
  it("does not permit a renderer-selected finance role or accountant reversals", () => {
    const { s, a } = fixture();
    expect(() => s.finance.setRole({ role: "administrator" })).toThrow(
      "AUTH_PERMISSION",
    );
    add(a, "accountant");
    expect(() => s.finance.correct({})).toThrow("AUTH_PERMISSION");
    expect(() =>
      a.saveRole({
        id: "accountant",
        revision: 0,
        permissions: ["staff.manage"],
        currentPassword: "New fictional staff password 123!",
        confirmed: true,
      }),
    ).toThrow("AUTH_PERMISSION");
  });
  it("prevents disabling the last super admin and invalidates reset sessions", () => {
    const { a } = fixture();
    const user = a.state().user!;
    const { lastLogin, mustChangePassword, ...editable } = user;
    expect(() =>
      a.saveStaff({
        ...editable,
        active: false,
        password: "",
        currentPassword: password,
        confirmed: true,
      }),
    ).toThrow("AUTH_LAST_ADMIN");
    a.changePassword({ currentPassword: password, newPassword: other });
    expect(a.state().authenticated).toBe(false);
    expect(() => a.login({ username: user.username, password })).toThrow(
      "AUTH_INVALID",
    );
    expect(
      a.login({ username: user.username, password: other }).authenticated,
    ).toBe(true);
  });
  it("consumes offline recovery once and preserves an auditable chain without secrets", () => {
    const { a, kit, s } = fixture();
    s.registration.save(fictionalFamily());
    a.logout();
    a.recover(kit, other);
    expect(() => a.recover(kit, password)).toThrow("AUTH_INVALID");
    a.login({ username: "fixture.admin", password: other });
    const history = a.auditHistory({
      action: "",
      outcome: "",
      from: "",
      until: "",
      page: 1,
    });
    expect(history.valid).toBe(true);
    expect(history.items.some((r) => r.action === "registration.save")).toBe(
      true,
    );
    const json = JSON.stringify(history);
    expect(json).not.toContain(password);
    expect(json).not.toContain(other);
    expect(json).not.toContain(kit.recoveryCode);
    expect(() => a.db.prepare("DELETE FROM audit_logs").run()).toThrow(
      "append-only",
    );
  });
});
