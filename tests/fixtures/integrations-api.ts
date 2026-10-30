import { vi } from 'vitest';
export const integrationMocks=()=>({
 getIntegrationState:vi.fn(),
 saveMessagingConsent:vi.fn(),
 saveNotificationTemplate:vi.fn(),
 previewNotifications:vi.fn(),
 queueNotifications:vi.fn(),
 decideNotifications:vi.fn(),
 saveReminderSchedule:vi.fn(),
 runReminderSchedules:vi.fn(),
 saveIntegrationConfig:vi.fn(),
 setIntegrationMock:vi.fn(),
 syncIntegrations:vi.fn(),
 createOnlinePaymentLink:vi.fn(),
 cancelOnlinePaymentLink:vi.fn(),
 simulateIntegrationEvent:vi.fn(),
 requestOnlineRefund:vi.fn(),
 resolveOnlineConflict:vi.fn(),
});
