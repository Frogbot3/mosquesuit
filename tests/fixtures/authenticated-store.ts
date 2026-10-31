// Fictional credentials exist only in the test harness; production never bypasses setup/login.
import { WorkspaceStore as BaseStore } from "../../electron/database/store";
export { ConflictError } from "../../electron/database/store";
export const testPassword = "Fictional test administrator 123!";
export class WorkspaceStore extends BaseStore {
  constructor(...args: ConstructorParameters<typeof BaseStore>) {
    super(...args);
    if (this.security.state().setupRequired)
      this.security.bootstrap({
        username: "fixture.admin",
        name: "Fictional Admin",
        password: testPassword,
        confirmed: true,
      });
    this.security.login({ username: "fixture.admin", password: testPassword });
  }
}
export function setTestStaffRole(
  store: BaseStore,
  role: "administrator" | "accountant" | "viewer",
) {
  store.security.logout();
  store.security.login({ username: "fixture.admin", password: testPassword });
  if (role === "administrator") return;
  const username = `fixture.${role}`;
  const password = `Fictional ${role} password 123!`;
  const existing = store.security
    .directory()
    .users.find((u) => u.username === username);
  if (!existing)
    store.security.saveStaff({
      id: "",
      revision: 0,
      username,
      name: `Fictional ${role}`,
      roleId: role === "accountant" ? "accountant" : "read_only",
      active: true,
      allWards: true,
      wardIds: [],
      password,
      currentPassword: testPassword,
      confirmed: true,
    });
  store.security.logout();
  store.security.login({ username, password });
  if (!existing) {
    store.security.changePassword({
      currentPassword: password,
      newPassword: password,
    });
    store.security.login({ username, password });
  }
}
