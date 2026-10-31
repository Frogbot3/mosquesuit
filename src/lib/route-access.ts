import type { Permission, SecurityState } from "../../shared/security";
export function canOpenRoute(state: SecurityState, path: string) {
  let permission: Permission | undefined,
    global = false;
  if (path.startsWith("/staff")) {
    permission = "staff.manage";
    global = true;
  } else if (path.startsWith("/audit")) {
    permission = "audit.view";
    global = true;
  } else if (path.startsWith("/backup")) {
    permission = path.endsWith("/restore") ? "backup.restore" : "backup.create";
    global = true;
  } else if (path === "/settings") {
    permission = "settings.change";
    global = true;
  } else if (path === "/activity") {
    permission = "audit.view";
    global = true;
  } else if (path.startsWith("/events/")) {
    permission = `life.${path.split("/")[2]}` as Permission;
    global = true;
  } else if (path === "/event-categories") {
    permission = "life.divorce";
    global = true;
  } else if (path === "/household-transfer") {
    permission = "families.edit";
    global = true;
  } else if (path.startsWith("/families"))
    permission = path.endsWith("/new")
      ? "families.create"
      : path.endsWith("/edit")
        ? "families.edit"
        : "families.view";
  else if (path.startsWith("/members")) permission = "members.view";
  else if (path === "/wards") permission = "families.view";
  else if (
    path.startsWith("/notifications") ||
    path.startsWith("/integrations")
  ) {
    global = true;
    permission = /\/(settings|templates|schedules)$/.test(path)
      ? "settings.change"
      : path.endsWith("/payments")
        ? "payments.record"
        : "notifications.send";
  } else if (
    ["/payments", "/donations", "/reports"].includes(path) ||
    path.startsWith("/finance")
  ) {
    global = true;
    permission =
      path === "/reports"
        ? "reports.generate"
        : path === "/donations"
          ? "donations.manage"
          : /\/(plans|assignments|generate|settings|categories|funds)$/.test(
                path,
              )
            ? "finance.configure"
            : path.endsWith("/collect")
              ? "payments.record"
              : path.endsWith("/adjust")
                ? "payments.reverse"
                : path.endsWith("/approvals")
                  ? "expenses.approve"
                  : path.endsWith("/expenses")
                    ? "expenses.record"
                    : path.endsWith("/audit")
                      ? "audit.view"
                      : "finance.view";
  }
  return (
    (!permission || state.permissions.includes(permission)) &&
    (!global || Boolean(state.user?.allWards))
  );
}
