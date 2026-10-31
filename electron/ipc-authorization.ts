import { CHANNELS as R } from "../shared/channels";
import { FINANCE_CHANNELS as F } from "../shared/finance-channels";
import { integrationChannels as I } from "../shared/integrations";
import { SecurityError, type Permission } from "../shared/security";
import type { SecurityStore } from "./database/security-store";
const policy: Record<string, Permission> = {
  [R.settings]: "settings.change",
  [R.reset]: "settings.change",
  [R.families]: "families.view",
  [R.family]: "families.view",
  [R.members]: "members.view",
  [R.member]: "members.view",
  [R.categories]: "life.divorce",
  [R.saveCategory]: "life.divorce",
  [R.transfer]: "families.edit",
  [R.transfers]: "families.view",
  [R.exportDocument]: "data.export",
  [R.outputEvent]: "data.export",
  [F.getFinanceSetup]: "finance.view",
  [F.saveFinancePlan]: "finance.configure",
  [F.saveFinanceAssignment]: "finance.configure",
  [F.saveFinancePolicy]: "finance.configure",
  [F.generateFinanceDues]: "finance.configure",
  [F.getFamilyFinance]: "finance.view",
  [F.recordFinancePayment]: "payments.record",
  [F.applyFinanceCredit]: "payments.record",
  [F.adjustFinanceDue]: "payments.reverse",
  [F.correctFinanceTransaction]: "payments.reverse",
  [F.saveFinanceFund]: "finance.configure",
  [F.saveFinanceCategory]: "finance.configure",
  [F.recordFinanceDonation]: "donations.manage",
  [F.recordFinanceExpense]: "expenses.record",
  [F.decideFinanceExpense]: "expenses.approve",
  [F.getFinanceDashboard]: "finance.view",
  [F.getFinanceReport]: "reports.generate",
  [F.getFinanceTransaction]: "finance.view",
  [F.getFinanceReceipt]: "finance.view",
  [F.getFinanceAudit]: "audit.view",
  [F.saveFinanceConfig]: "finance.configure",
  [F.chooseFinanceLogo]: "finance.configure",
  [F.outputFinanceDocument]: "data.export",
  [I.getIntegrationState]: "notifications.send",
  [I.saveMessagingConsent]: "notifications.send",
  [I.saveNotificationTemplate]: "settings.change",
  [I.previewNotifications]: "notifications.send",
  [I.queueNotifications]: "notifications.send",
  [I.decideNotifications]: "notifications.send",
  [I.saveReminderSchedule]: "settings.change",
  [I.runReminderSchedules]: "notifications.send",
  [I.saveIntegrationConfig]: "settings.change",
  [I.setIntegrationMock]: "settings.change",
  [I.syncIntegrations]: "payments.record",
  [I.createOnlinePaymentLink]: "payments.record",
  [I.cancelOnlinePaymentLink]: "payments.record",
  [I.simulateIntegrationEvent]: "settings.change",
  [I.requestOnlineRefund]: "payments.reverse",
  [I.resolveOnlineConflict]: "payments.reverse",
};
export function authorizeIpc(
  auth: SecurityStore,
  channel: string,
  input: unknown,
) {
  auth.require(policy[channel]);
  const d = input as { id?: string; kind?: string; wardId?: string };
  if (channel === F.setFinanceDemoRole || channel === F.backupFinance)
    throw new SecurityError("AUTH_PERMISSION");
  if (channel === R.saveFamily)
    auth.require(d.id ? "families.edit" : "families.create");
  if (
    [
      R.events,
      R.event,
      R.saveEvent,
      R.transitionEvent,
      R.attachDocument,
      R.outputEvent,
    ].includes(channel as typeof R.events)
  ) {
    const kind = d.id
      ? (
          auth.db
            .prepare("SELECT kind FROM life_events WHERE id=?")
            .get(d.id) as { kind: string } | undefined
        )?.kind
      : d.kind;
    if (!["marriage", "divorce", "death"].includes(kind ?? ""))
      throw new SecurityError("AUTH_PERMISSION");
    auth.require(`life.${kind}` as Permission);
    auth.global();
  }
  if (d.wardId) auth.ward(d.wardId);
}
