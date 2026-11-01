// Fictional QA data only. This module is never imported by the desktop bundle.
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { migrate } from '../../electron/database/migrations';
import { RegistrationStore } from '../../electron/database/registration-store';
import { LifeEventsStore } from '../../electron/database/life-events-store';
import { FinanceStore } from '../../electron/database/finance-store';
import { IntegrationsStore } from '../../electron/database/integrations-store';
import { SecurityStore } from '../../electron/database/security-store';
import { blankMember, type FamilyProfile } from '../../shared/registration';
import { blankEvent, blankParty, eventToDraft } from '../../shared/life-events';
import { blankPlan, DEMO_FINANCE_CONFIRMATION as confirmation } from '../../shared/finance';
import { fictionalFamily } from './registration';

export const qaFilters = { from: '2026-01-01', until: '2026-12-31', wardId: '', categoryId: '', search: '' };
export function seedLoadDataset(filename: string, families: number) {
  if (![20, 500, 2000].includes(families) || existsSync(filename)) throw new Error('QA dataset must be new and use an approved size');
  const started = performance.now();
  const db = new Database(filename);
  try {
    db.pragma('foreign_keys=ON'); db.pragma('journal_mode=WAL'); db.pragma('synchronous=FULL'); migrate(db);
    const registry = new RegistrationStore(db), finance = new FinanceStore(db, true), events = new LifeEventsStore(db, true);
    const integration = new IntegrationsStore(db, finance, true);
    const households: FamilyProfile[] = [];
    const plan = finance.savePlan({ ...blankPlan(), name: 'Fictional monthly contribution', nameMl: 'സാങ്കൽപ്പിക മാസവരിസംഖ്യ', effectiveDate: '2026-01-01' });
    db.transaction(() => {
      db.prepare('UPDATE mosque_settings SET name=?,name_ml=?,address=? WHERE id=1').run('FICTIONAL PILOT MOSQUE', 'സാങ്കൽപ്പിക പരീക്ഷണ പള്ളി', 'Generated QA records only — not real people');
      for (let n = 1; n <= families; n++) {
        const draft = fictionalFamily(String(n).padStart(5, '0'), `ward-${1 + ((n - 1) % 4)}`);
        draft.houseName = `Fictional House ${String(n).padStart(5, '0')}`;
        draft.houseNameMl = `സാങ്കൽപ്പിക വീട് ${n}`;
        draft.registrationDate = '2026-01-01';
        draft.members[0].name = `Fictional Guardian ${String(n).padStart(5, '0')}`;
        draft.members.push({ ...blankMember(), name: `Fictional Parent ${n}`, nameMl: 'സാങ്കൽപ്പിക രക്ഷിതാവ്', relationship: 'father', gender: 'male', dob: '1950-01-01' });
        const family = registry.save(draft); households.push(family);
        finance.saveAssignment({ key: randomUUID(), familyId: family.id, planId: plan.id, effectiveDate: '2026-01-01', mode: 'standard', amountPaise: 0, reason: 'Fictional load fixture' });
      }
    })();
    finance.generate({ key: randomUUID(), planId: plan.id, from: '2026-01', until: '2026-11', confirmation });
    // Four real ledger commands per family: 2,000 / 8,000 payments. Generated
    // inside a single fixture transaction only to avoid timing dataset construction
    // as if it were an individual clerk interaction.
    db.transaction(() => {
      for (const family of households) for (let index = 0; index < 4; index++) {
        finance.payment({ key: randomUUID(), familyId: family.id, categoryId: 'contribution-general', amountPaise: index % 2 ? 10000 : 5000,
          date: `2026-0${index + 4}-15`, method: 'cash', reference: '', receivedBy: 'Fictional Clerk', notes: 'Generated QA payment', duplicateReason: '', allocation: 'oldest', allocations: [], confirmation });
      }
      finance.donation({ key: randomUUID(), amountPaise: 1000000, date: '2026-08-01', method: 'cash', reference: '', notes: 'QA donation', duplicateReason: '', confirmation, fundId: 'fund-zakat', familyId: '', donor: 'Fictional donor', anonymous: false, receivedBy: 'Fictional Clerk' });
      const expense = finance.expense({ key: randomUUID(), amountPaise: 250000, date: '2026-08-02', method: 'cash', reference: '', notes: 'QA expense', duplicateReason: '', confirmation,
        fundId: 'fund-zakat', categoryId: 'expense-electricity', wardId: '', description: 'Fictional electricity', payee: 'Fictional supplier', billReference: 'QA-BILL-1', authorizedBy: 'Fictional approver', recordedBy: 'Fictional Clerk' });
      if (expense.pending) finance.decideExpense({ key: randomUUID(), id: expense.id, decision: 'approve', reason: 'Reviewed fictional expense', confirmation });
      for (let n = 0; n < Math.min(10, households.length); n++) {
        const f = households[n];
        const marriage = events.save({ ...blankEvent('marriage'), number: `QA-M-${n}`, eventDate: '2025-01-01', parties: [{ ...blankParty(), memberId: f.guardianMemberId }, { ...blankParty(), memberId: f.members[1].id }] });
        const married = events.transition({ id: marriage.id, revision: marriage.revision, action: 'confirm', confirmation: 'CONFIRM DEMO ACTION' });
        if (n < 3) {
          const divorce = events.save({ ...blankEvent('divorce'), number: `QA-D-${n}`, eventDate: '2025-06-01', marriageId: married.id, parties: eventToDraft(married).parties });
          const reviewed = events.transition({ id: divorce.id, revision: divorce.revision, action: 'review', confirmation: 'CONFIRM DEMO ACTION' });
          events.transition({ id: reviewed.id, revision: reviewed.revision, action: 'confirm', confirmation: 'CONFIRM DEMO ACTION' });
        }
        const death = events.save({ ...blankEvent('death'), number: `QA-X-${n}`, memberId: f.members[4].id, eventDate: '2026-09-01' });
        const saved = events.transition({ id: death.id, revision: death.revision, action: 'confirm', confirmation: 'CONFIRM DEMO ACTION' });
        if (n === 0) events.addDocument({ id: saved.id, revision: saved.revision }, 'fictional-attachment.pdf', Buffer.from('%PDF-1.7\nFictional attachment fixture only\n%%EOF'));
      }
      // Offline approval queue only. No provider connection or send operation.
      for (const family of households.slice(0, 20)) integration.saveConsent({ familyId: family.id, phone: '+919000000001', language: 'en', optedIn: true, receipts: true, reminders: true, evidence: 'Fictional QA consent only', confirmed: true });
      integration.queue({ previewId: integration.preview({ familyId: '', wardId: '', templateId: '10000000-0000-4000-8000-000000000001', period: '2026-10' }).id });
      const audit = new SecurityStore(db);
      for (let n = 0; n < families; n++) audit.audit('qa.fixture.created', 'family', households[n].id, 'success', 'Generated fictional QA household');
    })();
    if (db.pragma('integrity_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Fixture integrity failed');
    db.pragma('wal_checkpoint(TRUNCATE)');
    return { families, members: families * 5, planId: plan.id, familyId: households[0].id, seedMs: Math.round(performance.now() - started), administratorAccounts: 0 };
  } finally { db.close(); }
}
