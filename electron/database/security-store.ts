import type Database from "better-sqlite3";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  auditQuerySchema,
  bootstrapSchema,
  changePasswordSchema,
  loginSchema,
  resetPasswordSchema,
  roleSchema,
  securitySettingsSchema,
  staffSchema,
  SecurityError,
  type Permission,
  type SecurityState,
  type StaffUser,
  type StaffRole,
  type SecurityAudit,
} from "../../shared/security";
import { digest, hashPassword, verifyPassword } from "../security-crypto";
type Session = { id: string; token: string; staffId: string };
type UserRow = {
  id: string;
  username: string;
  name: string;
  password_hash: string;
  role_id: StaffUser["roleId"];
  active: number;
  all_wards: number;
  revision: number;
  last_login: number;
  must_change_password: number;
  recovery_hash: string;
};
const dummyHash = hashPassword(randomBytes(32).toString("base64url"));
export class SecurityStore {
  private session: Session | null = null;
  private operating = 0;
  private readonly context = new AsyncLocalStorage<string>();
  private maintenance = false;
  constructor(
    readonly db: Database.Database,
    private readonly now: () => number = Date.now,
  ) {
    db.prepare(
      "INSERT OR IGNORE INTO security_settings(id,workspace_id) VALUES(1,?)",
    ).run(randomUUID());
    db.prepare("UPDATE sessions SET revoked=1 WHERE revoked=0").run();
  }
  get workspaceId() {
    return (
      this.db
        .prepare("SELECT workspace_id FROM security_settings WHERE id=1")
        .get() as { workspace_id: string }
    ).workspace_id;
  }
  private row(id: string) {
    return this.db.prepare("SELECT * FROM staff_users WHERE id=?").get(id) as
      | UserRow
      | undefined;
  }
  private publicUser(row: UserRow): StaffUser {
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      roleId: row.role_id,
      active: Boolean(row.active),
      allWards: Boolean(row.all_wards),
      revision: row.revision,
      lastLogin: row.last_login,
      mustChangePassword: Boolean(row.must_change_password),
      wardIds: (
        this.db
          .prepare(
            "SELECT ward_id FROM staff_ward_assignments WHERE staff_id=? ORDER BY ward_id",
          )
          .all(row.id) as { ward_id: string }[]
      ).map((r) => r.ward_id),
    };
  }
  permissions(user: StaffUser) {
    return (
      this.db
        .prepare(
          "SELECT permission_id FROM role_permissions WHERE role_id=? ORDER BY permission_id",
        )
        .all(user.roleId) as { permission_id: Permission }[]
    ).map((r) => r.permission_id);
  }
  state(): SecurityState {
    const settings = this.db
      .prepare(
        "SELECT idle_minutes AS idleMinutes,locale FROM security_settings WHERE id=1",
      )
      .get() as Pick<SecurityState, "idleMinutes" | "locale">;
    const setupRequired = !this.db
      .prepare("SELECT 1 FROM staff_users LIMIT 1")
      .get();
    let user: StaffUser | null = null,
      locked = false;
    if (this.session) {
      const session = this.db
        .prepare(
          "SELECT token_hash,last_activity,locked,revoked FROM sessions WHERE id=?",
        )
        .get(this.session.id) as
        | {
            token_hash: string;
            last_activity: number;
            locked: number;
            revoked: number;
          }
        | undefined;
      const row = this.row(this.session.staffId);
      if (
        !session ||
        session.revoked ||
        !row?.active ||
        session.token_hash !== digest(this.session.token)
      ) {
        this.session = null;
      } else {
        if (
          !session.locked &&
          this.now() - session.last_activity >= settings.idleMinutes * 60000
        )
          this.lock();
        locked = Boolean(
          session.locked ||
            this.now() - session.last_activity >= settings.idleMinutes * 60000,
        );
        user = this.publicUser(row);
      }
    }
    return {
      setupRequired,
      ...settings,
      authenticated: Boolean(user && !locked),
      locked,
      user: user && !locked ? user : null,
      permissions: user && !locked ? this.permissions(user) : [],
      mustChangePassword: Boolean(user && !locked && user.mustChangePassword),
    };
  }
  require(permission?: Permission, allowPasswordChange = false): StaffUser {
    if (this.maintenance) throw new SecurityError("AUTH_BUSY");
    if (this.context.getStore() && this.context.getStore() !== this.session?.id)
      throw new SecurityError("AUTH_REQUIRED");
    const state = this.state();
    if (!state.authenticated || !state.user)
      throw new SecurityError(state.locked ? "AUTH_LOCKED" : "AUTH_REQUIRED");
    if (state.mustChangePassword && !allowPasswordChange)
      throw new SecurityError("AUTH_PASSWORD_CHANGE");
    if (permission && !state.permissions.includes(permission)) {
      this.audit(
        "access.denied",
        "permission",
        permission,
        "denied",
        "Permission denied",
      );
      throw new SecurityError("AUTH_PERMISSION");
    }
    return state.user;
  }
  wards(): string[] | null {
    const user = this.require();
    return user.allWards ? null : user.wardIds;
  }
  ward(id: string) {
    const wards = this.wards();
    if (wards && !wards.includes(id)) {
      this.audit("access.denied", "ward", "", "denied", "Ward scope denied");
      throw new SecurityError("AUTH_SCOPE");
    }
  }
  family(id: string) {
    this.require();
    const row = this.db
      .prepare("SELECT ward_id FROM families WHERE id=?")
      .get(id) as { ward_id: string } | undefined;
    if (!row) throw new SecurityError("AUTH_SCOPE");
    this.ward(row.ward_id);
  }
  member(id: string) {
    const row = this.db
      .prepare("SELECT family_id FROM members WHERE id=?")
      .get(id) as { family_id: string } | undefined;
    if (!row) throw new SecurityError("AUTH_SCOPE");
    this.family(row.family_id);
  }
  global() {
    if (!this.require().allWards) throw new SecurityError("AUTH_SCOPE");
  }
  audit(
    action: string,
    entityType: string,
    entityId = "",
    outcome: SecurityAudit["outcome"] = "success",
    summary = "Operation completed",
    staffId: string | null = this.session?.staffId ?? null,
    correlationId = randomUUID(),
  ) {
    const id = randomUUID(),
      at = this.now();
    const previous =
      (
        this.db
          .prepare("SELECT hash FROM audit_logs ORDER BY seq DESC LIMIT 1")
          .get() as { hash: string } | undefined
      )?.hash ?? "";
    // Callers supply constant summaries/field names, never submitted values.
    const safe = summary.slice(0, 500);
    const hash = digest(
      JSON.stringify([
        id,
        at,
        staffId,
        action,
        entityType,
        entityId,
        outcome,
        safe,
        correlationId,
        previous,
      ]),
    );
    this.db
      .prepare(
        "INSERT INTO audit_logs(id,at,staff_id,action,entity_type,entity_id,outcome,summary,correlation_id,previous_hash,hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        at,
        staffId,
        action,
        entityType,
        entityId,
        outcome,
        safe,
        correlationId,
        previous,
        hash,
      );
  }
  integrity() {
    let previous = "";
    for (const r of this.db
      .prepare("SELECT * FROM audit_logs ORDER BY seq")
      .iterate() as Iterable<{
      id: string;
      at: number;
      staff_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string;
      outcome: string;
      summary: string;
      correlation_id: string;
      previous_hash: string;
      hash: string;
    }>) {
      if (
        r.previous_hash !== previous ||
        r.hash !==
          digest(
            JSON.stringify([
              r.id,
              r.at,
              r.staff_id,
              r.action,
              r.entity_type,
              r.entity_id,
              r.outcome,
              r.summary,
              r.correlation_id,
              r.previous_hash,
            ]),
          )
      )
        return false;
      previous = r.hash;
    }
    return true;
  }
  private throttle(identity: string) {
    const since = this.now() - 15 * 60000;
    const count = (
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM login_attempts WHERE identity_hash=? AND success=0 AND at>? AND id>COALESCE((SELECT MAX(id) FROM login_attempts WHERE identity_hash=? AND success=1),0)",
        )
        .get(identity, since, identity) as { n: number }
    ).n;
    const global = (
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM login_attempts WHERE success=0 AND at>?",
        )
        .get(since) as { n: number }
    ).n;
    if (count >= 5 || global >= 30) throw new SecurityError("AUTH_THROTTLED");
  }
  private attempt(identity: string, success: boolean) {
    this.db
      .prepare(
        "INSERT INTO login_attempts(identity_hash,at,success) VALUES(?,?,?)",
      )
      .run(identity, this.now(), +success);
  }
  bootstrap(input: unknown) {
    const d = bootstrapSchema.parse(input);
    const recoveryCode = randomBytes(32).toString("base64url");
    const id = randomUUID();
    this.db
      .transaction(() => {
        if (this.db.prepare("SELECT 1 FROM staff_users LIMIT 1").get())
          throw new SecurityError("AUTH_SETUP_DONE");
        this.db
          .prepare(
            "INSERT INTO staff_users(id,username,name,password_hash,role_id,active,all_wards,recovery_hash,created_at) VALUES(?,?,?,?,'super_admin',1,1,?,?)",
          )
          .run(
            id,
            d.username,
            d.name,
            hashPassword(d.password),
            digest(recoveryCode),
            this.now(),
          );
        this.audit(
          "staff.bootstrap",
          "staff",
          id,
          "success",
          "Initial administrator created",
          id,
        );
      })
      .immediate();
    return { workspaceId: this.workspaceId, staffId: id, recoveryCode };
  }
  login(input: unknown): SecurityState {
    const d = loginSchema.parse(input);
    const identity = digest(d.username);
    this.throttle(identity);
    const row = this.db
      .prepare("SELECT * FROM staff_users WHERE username=? COLLATE NOCASE")
      .get(d.username) as UserRow | undefined;
    const valid =
      verifyPassword(d.password, row?.password_hash ?? dummyHash) &&
      Boolean(row?.active);
    this.attempt(identity, valid);
    if (!valid) {
      this.audit(
        "login.failed",
        "staff",
        "",
        "failure",
        "Invalid or disabled credentials",
        null,
      );
      throw new SecurityError("AUTH_INVALID");
    }
    this.logout(false);
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO sessions(id,staff_id,token_hash,created_at,last_activity) VALUES(?,?,?,?,?)",
        )
        .run(id, row!.id, digest(token), this.now(), this.now());
      this.db
        .prepare("UPDATE staff_users SET last_login=? WHERE id=?")
        .run(this.now(), row!.id);
      this.audit(
        "login.succeeded",
        "staff",
        row!.id,
        "success",
        "Offline authentication succeeded",
        row!.id,
      );
    })();
    this.session = { id, token, staffId: row!.id };
    return this.state();
  }
  logout(record = true) {
    if (this.session) {
      this.db
        .prepare("UPDATE sessions SET revoked=1 WHERE id=?")
        .run(this.session.id);
      if (record) this.audit("session.logout", "staff", this.session.staffId);
      this.session = null;
    }
    return null;
  }
  lock() {
    if (this.session) {
      const changed = this.db
        .prepare(
          "UPDATE sessions SET locked=1 WHERE id=? AND locked=0 AND revoked=0",
        )
        .run(this.session.id);
      if (changed.changes)
        this.audit("session.locked", "staff", this.session.staffId);
    }
    return null;
  }
  touch() {
    const state = this.state();
    if (state.authenticated && this.session)
      this.db
        .prepare("UPDATE sessions SET last_activity=? WHERE id=?")
        .run(this.now(), this.session.id);
    return this.state();
  }
  reauthenticate(password: string, permission?: Permission) {
    const user = this.require(permission, true);
    const identity = digest(`reauth:${user.id}`);
    this.throttle(identity);
    const valid = verifyPassword(password, this.row(user.id)!.password_hash);
    this.attempt(identity, valid);
    if (!valid) {
      this.audit(
        "reauth.failed",
        "staff",
        user.id,
        "failure",
        "Current credential rejected",
      );
      throw new SecurityError("AUTH_INVALID");
    }
    return user;
  }
  changePassword(input: unknown) {
    const d = changePasswordSchema.parse(input);
    const user = this.reauthenticate(d.currentPassword);
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE staff_users SET password_hash=?,must_change_password=0,revision=revision+1 WHERE id=?",
        )
        .run(hashPassword(d.newPassword), user.id);
      this.db
        .prepare("UPDATE sessions SET revoked=1 WHERE staff_id=?")
        .run(user.id);
      this.audit("password.changed", "staff", user.id);
    })();
    this.session = null;
    return null;
  }
  recoveryFile(password: string) {
    const user = this.reauthenticate(password);
    const code = randomBytes(32).toString("base64url");
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE staff_users SET recovery_hash=? WHERE id=?")
        .run(digest(code), user.id);
      this.audit("recovery.rotated", "staff", user.id);
    })();
    return {
      workspaceId: this.workspaceId,
      staffId: user.id,
      recoveryCode: code,
    };
  }
  recover(
    kit: { workspaceId: string; staffId: string; recoveryCode: string },
    newPassword: string,
  ) {
    const identity = digest(`recovery:${kit.staffId}`);
    this.throttle(identity);
    const row = this.row(kit.staffId);
    const expected = Buffer.from(row?.recovery_hash || "0".repeat(64), "hex");
    const actual = Buffer.from(digest(kit.recoveryCode), "hex");
    const valid =
      kit.workspaceId === this.workspaceId &&
      Boolean(row?.active && row.recovery_hash) &&
      expected.length === actual.length &&
      timingSafeEqual(expected, actual);
    this.attempt(identity, valid);
    if (!valid) {
      this.audit(
        "recovery.failed",
        "staff",
        "",
        "failure",
        "Recovery credential rejected",
        null,
      );
      throw new SecurityError("AUTH_INVALID");
    }
    const password = changePasswordSchema.shape.newPassword.parse(newPassword);
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE staff_users SET password_hash=?,recovery_hash='',must_change_password=0,revision=revision+1 WHERE id=?",
        )
        .run(hashPassword(password), row!.id);
      this.db
        .prepare("UPDATE sessions SET revoked=1 WHERE staff_id=?")
        .run(row!.id);
      this.audit(
        "recovery.completed",
        "staff",
        row!.id,
        "success",
        "One-time recovery consumed",
        row!.id,
      );
    })();
    this.session = null;
    return null;
  }
  directory() {
    this.require("staff.manage");
    this.global();
    return {
      users: (
        this.db
          .prepare("SELECT * FROM staff_users ORDER BY username")
          .all() as UserRow[]
      ).map((u) => this.publicUser(u)),
      roles: this.roles(),
    };
  }
  private roles(): StaffRole[] {
    return (
      this.db.prepare("SELECT id,revision FROM roles").all() as {
        id: StaffUser["roleId"];
        revision: number;
      }[]
    ).map((r) => ({
      ...r,
      permissions: (
        this.db
          .prepare("SELECT permission_id FROM role_permissions WHERE role_id=?")
          .all(r.id) as { permission_id: Permission }[]
      ).map((p) => p.permission_id),
    }));
  }
  saveStaff(input: unknown) {
    const d = staffSchema.parse(input);
    const actor = this.reauthenticate(d.currentPassword, "staff.manage");
    this.global();
    const prior = d.id ? this.row(d.id) : undefined;
    if (d.id && (!prior || prior.revision !== d.revision))
      throw new SecurityError("AUTH_STALE");
    if (
      (d.roleId === "super_admin" || prior?.role_id === "super_admin") &&
      actor.roleId !== "super_admin"
    )
      throw new SecurityError("AUTH_PERMISSION");
    if (d.roleId === "super_admin" && !d.allWards)
      throw new SecurityError("AUTH_SCOPE");
    if (!d.allWards && !d.wardIds.length) throw new SecurityError("AUTH_SCOPE");
    if (d.allWards && d.wardIds.length) throw new SecurityError("AUTH_SCOPE");
    for (const ward of d.wardIds)
      if (!this.db.prepare("SELECT 1 FROM wards WHERE id=?").get(ward))
        throw new SecurityError("AUTH_SCOPE");
    if (!prior && !d.password) throw new SecurityError("AUTH_INVALID");
    const assigned = this.roles().find((r) => r.id === d.roleId)!;
    if (
      actor.roleId !== "super_admin" &&
      assigned.permissions.some((p) => !this.permissions(actor).includes(p))
    )
      throw new SecurityError("AUTH_PERMISSION");
    const id = prior?.id ?? randomUUID();
    this.db
      .transaction(() => {
        if (
          prior?.role_id === "super_admin" &&
          prior.active &&
          (!d.active || d.roleId !== "super_admin") &&
          (
            this.db
              .prepare(
                "SELECT COUNT(*) AS n FROM staff_users WHERE role_id='super_admin' AND active=1 AND all_wards=1",
              )
              .get() as { n: number }
          ).n <= 1
        )
          throw new SecurityError("AUTH_LAST_ADMIN");
        if (prior) {
          if (d.password) throw new SecurityError("AUTH_INVALID");
          this.db
            .prepare(
              "UPDATE staff_users SET username=?,name=?,role_id=?,active=?,all_wards=?,revision=revision+1 WHERE id=?",
            )
            .run(d.username, d.name, d.roleId, +d.active, +d.allWards, id);
          this.db
            .prepare("DELETE FROM staff_ward_assignments WHERE staff_id=?")
            .run(id);
          this.db
            .prepare("UPDATE sessions SET revoked=1 WHERE staff_id=?")
            .run(id);
        } else
          this.db
            .prepare(
              "INSERT INTO staff_users(id,username,name,password_hash,role_id,active,all_wards,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,1,?)",
            )
            .run(
              id,
              d.username,
              d.name,
              hashPassword(d.password),
              d.roleId,
              +d.active,
              +d.allWards,
              this.now(),
            );
        for (const ward of new Set(d.wardIds))
          this.db
            .prepare("INSERT INTO staff_ward_assignments VALUES(?,?)")
            .run(id, ward);
        this.audit(
          prior ? "staff.updated" : "staff.created",
          "staff",
          id,
          "success",
          "Account details, role, status and ward grants saved",
        );
      })
      .immediate();
    return null;
  }
  resetPassword(input: unknown) {
    const d = resetPasswordSchema.parse(input);
    const actor = this.reauthenticate(d.currentPassword, "staff.manage");
    this.global();
    const user = this.row(d.id);
    if (
      !user ||
      user.id === actor.id ||
      (user.role_id === "super_admin" && actor.roleId !== "super_admin")
    )
      throw new SecurityError("AUTH_PERMISSION");
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE staff_users SET password_hash=?,must_change_password=1,recovery_hash='',revision=revision+1 WHERE id=?",
        )
        .run(hashPassword(d.password), d.id);
      this.db
        .prepare("UPDATE sessions SET revoked=1 WHERE staff_id=?")
        .run(d.id);
      this.audit("password.reset", "staff", d.id);
    })();
    return null;
  }
  saveRole(input: unknown) {
    const d = roleSchema.parse(input);
    const user = this.reauthenticate(d.currentPassword, "staff.manage");
    if (user.roleId !== "super_admin" || d.id === "super_admin")
      throw new SecurityError("AUTH_PERMISSION");
    this.db.transaction(() => {
      if (
        !this.db
          .prepare(
            "UPDATE roles SET revision=revision+1 WHERE id=? AND revision=?",
          )
          .run(d.id, d.revision).changes
      )
        throw new SecurityError("AUTH_STALE");
      this.db.prepare("DELETE FROM role_permissions WHERE role_id=?").run(d.id);
      for (const p of new Set(d.permissions))
        this.db
          .prepare("INSERT INTO role_permissions VALUES(?,?)")
          .run(d.id, p);
      this.db
        .prepare(
          "UPDATE sessions SET revoked=1 WHERE staff_id IN(SELECT id FROM staff_users WHERE role_id=?)",
        )
        .run(d.id);
      this.audit(
        "role.updated",
        "role",
        d.id,
        "success",
        "Permission grants replaced; affected sessions revoked",
      );
    })();
    return null;
  }
  saveSettings(input: unknown) {
    const d = securitySettingsSchema.parse(input);
    this.reauthenticate(d.currentPassword, "security.configure");
    this.global();
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE security_settings SET idle_minutes=?,locale=? WHERE id=1",
        )
        .run(d.idleMinutes, d.locale);
      this.audit("security.configured", "settings", "1");
    })();
    return null;
  }
  auditHistory(input: unknown) {
    this.require("audit.view");
    this.global();
    const q = auditQuerySchema.parse(input);
    const args = {
      action: q.action,
      outcome: q.outcome,
      from: q.from ? Date.parse(q.from + "T00:00:00+05:30") : 0,
      until: q.until
        ? Date.parse(q.until + "T23:59:59.999+05:30")
        : Number.MAX_SAFE_INTEGER,
    };
    const where =
      "WHERE (@action='' OR a.action=@action) AND (@outcome='' OR a.outcome=@outcome) AND a.at BETWEEN @from AND @until";
    return {
      items: this.db
        .prepare(
          `SELECT a.id,a.at,a.staff_id AS staffId,COALESCE(s.name,'System / unauthenticated') AS staffName,a.action,a.entity_type AS entityType,a.entity_id AS entityId,a.outcome,a.summary,a.correlation_id AS correlationId FROM audit_logs a LEFT JOIN staff_users s ON s.id=a.staff_id ${where} ORDER BY a.seq DESC LIMIT 50 OFFSET @offset`,
        )
        .all({ ...args, offset: (q.page - 1) * 50 }) as SecurityAudit[],
      total: (
        this.db
          .prepare(`SELECT COUNT(*) AS n FROM audit_logs a ${where}`)
          .get(args) as { n: number }
      ).n,
      valid: this.integrity(),
    };
  }
  operation<T>(run: () => T): T {
    if (this.maintenance) throw new SecurityError("AUTH_BUSY");
    this.operating++;
    try {
      const result = this.context.run(this.session?.id ?? "", run);
      if (result instanceof Promise)
        return result.finally(() => {
          this.operating--;
        }) as T;
      this.operating--;
      return result;
    } catch (e) {
      this.operating--;
      throw e;
    }
  }
  guardedDatabase(): Database.Database {
    const auth = this;
    return new Proxy(this.db, {
      get(target, key) {
        const value = Reflect.get(target, key, target);
        return typeof value === "function"
          ? (...args: unknown[]) => {
              if (auth.context.getStore()) auth.require();
              return value.apply(target, args);
            }
          : value;
      },
    });
  }
  freeze() {
    if (this.operating || this.maintenance)
      throw new SecurityError("AUTH_BUSY");
    this.maintenance = true;
    return () => {
      this.maintenance = false;
    };
  }
  scheduledOwner(id: string) {
    const row = this.row(id);
    if (
      !row?.active ||
      !row.all_wards ||
      !this.permissions(this.publicUser(row)).includes("backup.create")
    )
      throw new SecurityError("AUTH_PERMISSION");
    return row.id;
  }
}
