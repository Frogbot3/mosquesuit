import type { Migration } from './migrations';
export const integrationsMigration:Migration={version:5,name:'optional_integration_demo',sql:`
CREATE TABLE integration_sync_state(id INTEGER PRIMARY KEY CHECK(id=1),workspace_id TEXT NOT NULL,connected INTEGER NOT NULL DEFAULT 0,last_sync INTEGER NOT NULL DEFAULT 0,config TEXT NOT NULL CHECK(json_valid(config))) STRICT;
CREATE TABLE messaging_consents(family_id TEXT PRIMARY KEY REFERENCES families(id),guardian_id TEXT NOT NULL REFERENCES members(id),registry_phone TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),updated_at TEXT NOT NULL) STRICT;
CREATE TABLE messaging_preferences(id INTEGER PRIMARY KEY,family_id TEXT NOT NULL REFERENCES families(id),revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),created_at TEXT NOT NULL) STRICT;
CREATE TABLE notification_templates(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE notification_previews(id TEXT PRIMARY KEY,payload TEXT NOT NULL CHECK(json_valid(payload)),expires_at INTEGER NOT NULL) STRICT;
CREATE TABLE notification_jobs(id TEXT PRIMARY KEY,family_id TEXT NOT NULL REFERENCES families(id),dedupe TEXT NOT NULL UNIQUE,status TEXT NOT NULL CHECK(status IN('approval','queued','retry','sending','sent','delivered','failed','uncertain','cancelled','suppressed')),payload TEXT NOT NULL CHECK(json_valid(payload)),created_at INTEGER NOT NULL) STRICT;
CREATE INDEX idx_notification_status ON notification_jobs(status,created_at);
CREATE INDEX idx_notification_family ON notification_jobs(family_id);
CREATE TABLE notification_attempts(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES notification_jobs(id),outcome TEXT NOT NULL,at INTEGER NOT NULL) STRICT;
CREATE TABLE reminder_schedules(id TEXT PRIMARY KEY,payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE payment_links(id TEXT PRIMARY KEY,family_id TEXT NOT NULL REFERENCES families(id),provider_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL CHECK(json_valid(payload))) STRICT;
CREATE TABLE online_payment_events(id TEXT PRIMARY KEY,link_id TEXT NOT NULL REFERENCES payment_links(id),payment_id TEXT NOT NULL,refund_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('capture','refund')),payload TEXT NOT NULL CHECK(json_valid(payload)),UNIQUE(payment_id,refund_id,kind)) STRICT;
CREATE TABLE payment_reconciliation(event_id TEXT PRIMARY KEY REFERENCES online_payment_events(id),transaction_id TEXT UNIQUE REFERENCES financial_transactions(id),receipt_id TEXT REFERENCES receipts(id),status TEXT NOT NULL CHECK(status IN('pending','applied','conflict')),reason TEXT NOT NULL DEFAULT '') STRICT;
CREATE TABLE integration_audit(id INTEGER PRIMARY KEY,action TEXT NOT NULL,details TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES financial_sessions(id),at INTEGER NOT NULL) STRICT;
${['messaging_preferences','notification_attempts','online_payment_events','integration_audit'].map(t=>`CREATE TRIGGER ${t}_no_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT,'Integration history is immutable'); END; CREATE TRIGGER ${t}_no_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT,'Integration history is immutable'); END;`).join('\n')}
CREATE TRIGGER applied_reconciliation_immutable BEFORE UPDATE ON payment_reconciliation WHEN OLD.status='applied' BEGIN SELECT RAISE(ABORT,'Applied reconciliation is immutable'); END;
`};
