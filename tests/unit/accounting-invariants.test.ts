import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WorkspaceStore } from '../fixtures/authenticated-store';
import { fictionalFamily } from '../fixtures/registration';
import { blankPlan, DEMO_FINANCE_CONFIRMATION as confirmation } from '../../shared/finance';
import { qaFilters } from '../fixtures/load-dataset';

it('reconciles deterministic varied allocations, retries, refunds and reversals without rewriting finalized records', () => {
  const s = new WorkspaceStore(':memory:', true, true);
  try {
    const plan = s.finance.savePlan({ ...blankPlan(), name: 'Fictional invariant plan', effectiveDate: '2026-01-01' });
    const families = Array.from({ length: 20 }, (_, n) => s.registration.save(fictionalFamily(String(n + 1), `ward-${n % 4 + 1}`)));
    for (const f of families) s.finance.saveAssignment({ key: randomUUID(), familyId: f.id, planId: plan.id, effectiveDate: '2026-01-01', mode: 'standard', amountPaise: 0, reason: 'Fictional invariant assignment' });
    const request = { key: randomUUID(), planId: plan.id, from: '2026-01', until: '2026-06', confirmation };
    expect(s.finance.generate(request).created).toBe(120);
    expect(s.finance.generate({ ...request, key: randomUUID() }).created).toBe(0);
    let seed = 731;
    const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    const payments = families.map(f => {
      const draft = { key: randomUUID(), familyId: f.id, categoryId: 'contribution-general', amountPaise: 1000 + next() % 110000, date: '2026-07-01', method: 'cash' as const, reference: '', receivedBy: 'Fictional Clerk', notes: 'Fictional invariant payment', duplicateReason: '', allocation: 'oldest' as const, allocations: [], confirmation };
      const payment = s.finance.payment(draft); expect(s.finance.payment(draft).id).toBe(payment.id); return payment;
    });
    const db = s.security.db;
    const originals = db.prepare("SELECT * FROM financial_transactions WHERE kind='payment' ORDER BY id").all();
    const receipts = db.prepare('SELECT * FROM receipts ORDER BY id').all();
    const assertBalances = () => {
      expect(db.prepare(`SELECT COUNT(*) n FROM dues d WHERE (SELECT COALESCE(SUM(amount_paise),0) FROM payment_allocations WHERE due_id=d.id)<0 OR (SELECT COALESCE(SUM(amount_paise),0) FROM payment_allocations WHERE due_id=d.id)>d.amount_paise`).get()).toEqual({ n: 0 });
      const accounts = families.map(f => s.finance.family({ id: f.id }));
      expect(accounts.every(a => a.creditPaise >= 0 && a.outstandingPaise >= 0)).toBe(true);
      const cash = (db.prepare('SELECT SUM(cash_paise) total FROM financial_transactions').get() as { total: number }).total;
      const outstanding = accounts.reduce((n, a) => n + a.outstandingPaise, 0);
      expect(s.finance.dashboard(qaFilters)).toMatchObject({ netCashPaise: cash, outstandingPaise: outstanding });
      expect(s.finance.report({ kind: 'monthly', familyId: '', filters: qaFilters }).totals.outstandingPaise).toBe(outstanding);
      expect(s.finance.report({ kind: 'funds', familyId: '', filters: qaFilters }).totals.closingPaise).toBe(cash);
      expect(s.finance.report({ kind: 'ledger', familyId: '', filters: qaFilters }).totals.netCashPaise).toBe(cash);
      expect(db.prepare("SELECT * FROM financial_transactions WHERE kind='payment' ORDER BY id").all()).toEqual(originals);
      expect(db.prepare('SELECT * FROM receipts ORDER BY id').all()).toEqual(receipts);
    };
    assertBalances();
    for (let n = 0; n < payments.length; n++) {
      const payment = payments[n];
      const correction = { key: randomUUID(), id: payment.id, kind: n % 3 === 0 ? 'reversal' as const : 'refund' as const, amountPaise: n % 3 === 0 ? payment.amountPaise : 1 + next() % payment.amountPaise, date: '2026-07-02', reason: 'Authorized fictional correction', confirmation };
      const result = s.finance.correct(correction); expect(s.finance.correct(correction).id).toBe(result.id);
      assertBalances();
    }
    expect(db.prepare('SELECT COUNT(*) n,COUNT(DISTINCT number) uniqueNumbers FROM receipts').get()).toEqual({ n: 20, uniqueNumbers: 20 });
    expect(db.prepare("SELECT COUNT(*) n FROM financial_transactions WHERE typeof(amount_paise)!='integer' OR typeof(cash_paise)!='integer'").get()).toEqual({ n: 0 });
    expect(s.checkStorage().integrity).toBe('ok'); expect(s.security.integrity()).toBe(true);
  } finally { s.close(); }
}, 20000);
