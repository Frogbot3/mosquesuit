import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { WorkspaceStore } from '../../electron/database/store';
import { migrations, migrate } from '../../electron/database/migrations';
import { fictionalFamily } from '../fixtures/registration';
import { blankMember, calculateAge, profileToDraft, todayInIndia } from '../../shared/registration';

const stores: WorkspaceStore[] = []; const dirs: string[] = [];
const open = (path = ':memory:') => { const store = new WorkspaceStore(path); stores.push(store); return store; };
const fixturePath = () => { const dir = mkdtempSync(join(tmpdir(), 'mosque-phase2-')); dirs.push(dir); return join(dir, 'test.sqlite3'); };
const query = { search: '', wardId: '', page: 1, pageSize: 10 as const };
afterEach(() => { stores.splice(0).forEach(store => store.close()); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

describe('registration transactions', () => {
  it('creates a guardian and three members and derives living/gender counts', () => {
    const store = open(); const profile = store.registration.save(fictionalFamily());
    expect(profile.familyCode).toBe('W1/001'); expect(profile.members).toHaveLength(4);
    expect(profile.members[0].id).toBe(profile.guardianMemberId);
    expect(profile.totals).toEqual({ living: 4, male: 2, female: 2, other: 0, unknown: 0, deceased: 0, removed: 0 });
    expect(profile.history.filter(event => event.action === 'member.added')).toHaveLength(4);
    expect(store.registration.counts()).toEqual({ families: 1, livingMembers: 4 });
    expect(store.checkStorage().integrity).toBe('ok');
  });
  it('persists Malayalam and edited members across database reopen', () => {
    const path = fixturePath(); const first = open(path); const created = first.registration.save(fictionalFamily()); first.close();
    const second = open(path); const draft = profileToDraft(second.registration.get({ id: created.id }));
    expect(draft.houseNameMl).toBe('മാതൃകാ വീട്'); draft.members[1].occupation = 'Fictional teacher';
    second.registration.save(draft); second.close(); const third = open(path);
    expect(third.registration.get({ id: created.id }).members[1].occupation).toBe('Fictional teacher');
    expect(third.registration.getMember({ id: created.guardianMemberId }).nameMl).toBe('മാതൃകാ അമീൻ');
  });
  it('rejects duplicate numbers case-insensitively within a ward but permits other wards', () => {
    const store = open(); store.registration.save(fictionalFamily('abc-1'));
    expect(() => store.registration.save(fictionalFamily(' ABC-1 '))).toThrow('DUPLICATE_FAMILY');
    expect(store.registration.save(fictionalFamily('ABC-1', 'ward-2')).familyCode).toBe('W2/ABC-1');
    expect(store.registration.counts()).toEqual({ families: 2, livingMembers: 8 });
  });
  it('rolls back family, members and history together when an audit write fails', () => {
    const path = fixturePath(); const store = open(path); const db = new Database(path);
    db.exec("CREATE TRIGGER reject_registration_history BEFORE INSERT ON registration_history BEGIN SELECT RAISE(ABORT,'simulation'); END"); db.close();
    expect(() => store.registration.save(fictionalFamily())).toThrow('simulation');
    expect(store.registration.counts()).toEqual({ families: 0, livingMembers: 0 });
  });
  it('changes guardian and removes a member without deleting identity or history', () => {
    const store = open(); const created = store.registration.save(fictionalFamily()); const draft = profileToDraft(created);
    draft.guardianKey = draft.members[1].clientKey; draft.members[1].relationship = 'guardian';
    const oldGuardian = draft.members.shift()!; const updated = store.registration.save(draft);
    expect(updated.guardianMemberId).toBe(draft.members[0].id); expect(updated.members[0].id).toBe(updated.guardianMemberId);
    expect(updated.totals).toMatchObject({ living: 3, removed: 1, male: 1, female: 2 });
    expect(store.registration.getMember({ id: oldGuardian.id! }).archivedAt).not.toBeNull();
    expect(updated.history.map(event => event.action)).toEqual(expect.arrayContaining(['guardian.changed', 'member.removed']));
    expect(store.registration.listMembers(query).total).toBe(3);
  });
  it('prevents removing the guardian without choosing a replacement', () => {
    const store = open(); const created = store.registration.save(fictionalFamily()); const draft = profileToDraft(created); draft.members.shift();
    expect(() => store.registration.save(draft)).toThrow(); expect(store.registration.get({ id: created.id }).revision).toBe(0);
  });
  it('rejects foreign, archived and duplicate member IDs and stale revisions', () => {
    const store = open(); const a = store.registration.save(fictionalFamily('1')); const b = store.registration.save(fictionalFamily('2'));
    const foreign = profileToDraft(a); foreign.members[1].id = b.members[1].id;
    expect(() => store.registration.save(foreign)).toThrow('INVALID_MEMBER');
    const duplicated = profileToDraft(a); duplicated.members[1].id = duplicated.members[0].id;
    expect(() => store.registration.save(duplicated)).toThrow();
    const remove = profileToDraft(a); remove.members.pop(); const changed = store.registration.save(remove);
    expect(() => store.registration.save(profileToDraft(a))).toThrow('STALE_FAMILY');
    const resurrect = profileToDraft(changed); resurrect.members.push(profileToDraft(a).members[3]);
    expect(() => store.registration.save(resurrect)).toThrow('INVALID_MEMBER');
  });
  it('retains assignment history when ward, family number or house number changes', () => {
    const store = open(); const created = store.registration.save(fictionalFamily());
    const updated = store.registration.save({ ...profileToDraft(created), wardId: 'ward-2', familyNumber: '20', houseNumber: '30' });
    expect(updated.id).toBe(created.id); expect(updated.assignments).toHaveLength(2);
    expect(updated.assignments[1]).toMatchObject({ wardName: 'Ward 1', familyNumber: '001', houseNumber: '12A' });
    expect(updated.assignments[1].endedAt).not.toBeNull(); expect(updated.assignments[0].endedAt).toBeNull();
  });
  it('supports incomplete records with unknown DOB and no identity-document fields', () => {
    const store = open(); const guardian = { ...blankMember(true), nameMl: 'മാതൃക' };
    const profile = store.registration.save({ ...fictionalFamily(), houseName: '', houseNameMl: '', address: '', locality: '', postalCode: '', registrationDate: '', notes: '', guardianKey: guardian.clientKey, members: [guardian] });
    expect(profile.members[0].dob).toBe(''); expect(profile.totals.unknown).toBe(1); expect(profile.members[0].phone).toBe('');
    const draft = profileToDraft(profile);
    expect(() => store.registration.save({ ...draft, aadhaar: '123456789012' })).toThrow();
  });
  it('rejects invalid dates, contacts, postal codes, malicious fields and empty names without writes', () => {
    const store = open();
    for (const update of [{ familyNumber: '' }, { postalCode: 'abcdef' }, { email: 'invalid' }, { notes: 'x'.repeat(2001) }, { sql: 'DROP TABLE families' }]) {
      expect(() => store.registration.save({ ...fictionalFamily(), ...update })).toThrow();
    }
    for (const patch of [{ dob: '2024-02-30' }, { dob: '2999-01-01' }, { phone: 'ab123456789' }, { name: '', nameMl: '' }]) {
      const draft = fictionalFamily(); Object.assign(draft.members[1], patch); expect(() => store.registration.save(draft)).toThrow();
    }
    expect(store.registration.counts().families).toBe(0);
  });
  it('searches bilingual names, IDs and phone, filters wards and pages deterministically', () => {
    const store = open();
    for (let n = 1; n <= 13; n++) store.registration.save(fictionalFamily(String(n).padStart(3, '0')));
    store.registration.save(fictionalFamily('999', 'ward-2'));
    expect(store.registration.list({ ...query, search: 'മാതൃകാ അമീൻ' }).total).toBe(14);
    expect(store.registration.list({ ...query, search: 'W1/003' }).items[0].familyNumber).toBe('003');
    expect(store.registration.list({ ...query, search: '9000000001', wardId: 'ward-2' }).total).toBe(1);
    expect(store.registration.list({ ...query, search: '%' }).total).toBe(0);
    expect(store.registration.list({ ...query, wardId: 'ward-1', page: 2 }).items).toHaveLength(3);
    expect(store.registration.list({ ...query, page: 999 }).page).toBe(2);
  });
  it('excludes deceased members from living totals without removing their records', () => {
    const path = fixturePath(); const store = open(path); const created = store.registration.save(fictionalFamily()); const db = new Database(path);
    db.pragma('foreign_keys=ON'); db.prepare("UPDATE members SET life_status='deceased' WHERE id=?").run(created.members[1].id);
    expect(() => db.prepare("UPDATE members SET life_status='deceased' WHERE id=?").run(created.guardianMemberId)).toThrow('replacement guardian');
    db.close(); const profile = store.registration.get({ id: created.id });
    expect(profile.totals).toMatchObject({ living: 3, male: 2, female: 1, deceased: 1 }); expect(profile.members).toHaveLength(4);
  });
});

describe('migration and date correctness', () => {
  it('upgrades Phase 1 without changing existing settings, ward IDs or activity', () => {
    const path = fixturePath(); const db = new Database(path); db.pragma('foreign_keys=ON'); migrate(db, [migrations[0]]);
    db.prepare("UPDATE mosque_settings SET name='Preserved fictional mosque'").run(); db.prepare("UPDATE wards SET name='Preserved ward' WHERE id='ward-1'").run(); db.close();
    const store = open(path); expect(store.getSchemaVersion()).toBe(4); expect(store.getSettings().name).toBe('Preserved fictional mosque');
    expect(store.getWards()[0].name).toBe('Preserved ward'); expect(store.getActivity()).toHaveLength(1); expect(store.registration.counts().families).toBe(0);
  });
  it('enforces guardian identity and immutable history directly in SQLite', () => {
    const path = fixturePath(); const store = open(path); const a = store.registration.save(fictionalFamily('1')); const b = store.registration.save(fictionalFamily('2'));
    const db = new Database(path); db.pragma('foreign_keys=ON');
    try {
      expect(() => db.prepare('UPDATE families SET guardian_member_id=? WHERE id=?').run(b.guardianMemberId, a.id)).toThrow();
      expect(() => db.exec('DELETE FROM registration_history')).toThrow('append-only');
      expect(() => db.exec("UPDATE registration_history SET fields='[]'")).toThrow('append-only');
      expect(() => db.exec('DELETE FROM household_memberships')).toThrow('cannot be deleted');
      expect(() => db.exec('DELETE FROM members')).toThrow();
    } finally { db.close(); }
  });
  it('calculates age from date-only values, including leap days and unknown DOB', () => {
    expect(calculateAge('2000-10-26', '2026-10-25')).toBe(25); expect(calculateAge('2000-10-25', '2026-10-25')).toBe(26);
    expect(calculateAge('2000-02-29', '2025-02-28')).toBe(24); expect(calculateAge('2000-02-29', '2025-03-01')).toBe(25);
    expect(calculateAge('', '2026-10-25')).toBeNull(); expect(calculateAge('2026-02-30')).toBeNull(); expect(calculateAge('2999-01-01')).toBeNull();
    expect(todayInIndia(new Date('2026-10-25T20:00:00Z'))).toBe('2026-10-26');
  });
});
