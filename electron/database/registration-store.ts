import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { LifeEventError } from '../../shared/life-events';
import {
  entityRequestSchema, familyQuerySchema, saveFamilySchema, type FamilyDraft, type FamilyProfile,
  type FamilyQuery, type FamilySummary, type MemberDraft, type MemberRecord, type MemberSummary,
  type FamilyHistory, type FamilyAssignment, type HistoryAction, type PageResult, type RegistryErrorCode,
} from '../../shared/registration';

export class RegistryError extends Error {
  constructor(public readonly code: RegistryErrorCode) { super(code); }
}
const memberColumns = `m.id, m.family_id AS familyId, m.name, m.name_ml AS nameMl, m.relationship, m.gender, m.dob,
  m.father_name AS fatherName, m.mother_name AS motherName, m.marital_status AS maritalStatus,
  m.education, m.occupation, m.blood_group AS bloodGroup, m.phone, m.remarks,
  m.life_status AS lifeStatus, m.archived_at AS archivedAt, m.created_at AS createdAt`;
const familyColumns = `f.id, f.ward_id AS wardId, f.family_number AS familyNumber,
  w.code || '/' || f.family_number AS familyCode, w.name AS wardName, w.name_ml AS wardNameMl,
  f.house_name AS houseName, f.house_name_ml AS houseNameMl, f.house_number AS houseNumber,
  f.address, f.locality, f.postal_code AS postalCode, f.email, f.registration_date AS registrationDate,
  f.notes, f.status, f.guardian_member_id AS guardianMemberId, f.needs_guardian AS needsGuardian, f.revision, f.created_at AS createdAt, f.updated_at AS updatedAt`;
const familyFields = ['wardId', 'familyNumber', 'houseName', 'houseNameMl', 'houseNumber', 'address', 'locality', 'postalCode', 'email', 'registrationDate', 'notes', 'status'] as const;
const memberFields = ['name', 'nameMl', 'relationship', 'gender', 'dob', 'fatherName', 'motherName', 'maritalStatus', 'education', 'occupation', 'bloodGroup', 'phone', 'remarks'] as const;
const literalLike = (value: string) => `%${value.replace(/[\\%_]/g, char => `\\${char}`)}%`;

export class RegistrationStore {
  constructor(private readonly db: Database.Database,private readonly scope:()=>string[]|null=()=>null) {}

  private event(familyId: string, action: HistoryAction, time: string, memberId: string | null = null, fields: string[] = []) {
    this.db.prepare('INSERT INTO registration_history(family_id,member_id,action,fields,created_at) VALUES(?,?,?,?,?)').run(familyId, memberId, action, JSON.stringify(fields), time);
  }

  save(input: unknown): FamilyProfile {
    const draft = saveFamilySchema.parse(input);
    return this.db.transaction(() => {
      const previous = draft.id ? this.get({ id: draft.id }) : null;
      if (previous && previous.revision !== draft.revision) throw new RegistryError('STALE_FAMILY');
      if (!previous && draft.revision !== 0) throw new RegistryError('STALE_FAMILY');
      const ward = this.db.prepare('SELECT active FROM wards WHERE id=?').get(draft.wardId) as { active: number } | undefined;
      if (!ward || !ward.active && previous?.wardId !== draft.wardId) throw new RegistryError('INACTIVE_WARD');
      if (this.db.prepare('SELECT id FROM families WHERE ward_id=? AND family_number=? COLLATE NOCASE AND id != ?').get(draft.wardId, draft.familyNumber, draft.id ?? '')) {
        throw new RegistryError('DUPLICATE_FAMILY');
      }
      const id = previous?.id ?? randomUUID();
      const now = new Date().toISOString();
      const existing = new Map(previous?.members.filter(member => !member.archivedAt).map(member => [member.id, member]) ?? []);
      const changedMembers: { member: MemberDraft; id: string; fields: string[]; isNew: boolean }[] = [];
      const retainedIds = new Set<string>();
      let guardianId = '';
      for (const member of draft.members) {
        const prior = member.id ? existing.get(member.id) : undefined;
        if (member.id && !prior) throw new RegistryError('INVALID_MEMBER');
        if (prior && member.maritalStatus !== prior.maritalStatus && this.db.prepare("SELECT 1 FROM event_participants p JOIN life_events e ON e.id=p.event_id WHERE p.member_id=? AND e.status IN ('confirmed','closed')").get(prior.id)) throw new LifeEventError('EVENT_STATUS_MANAGED');
        if (prior && member.dob && (this.db.prepare('SELECT 1 FROM event_participants p JOIN life_events e ON e.id=p.event_id WHERE p.member_id=? AND e.event_date<?').get(prior.id,member.dob) || this.db.prepare('SELECT 1 FROM deaths d JOIN life_events e ON e.id=d.event_id WHERE d.member_id=? AND e.event_date<?').get(prior.id,member.dob))) throw new LifeEventError('EVENT_DATE');
        if (member.clientKey === draft.guardianKey && prior?.lifeStatus === 'deceased') throw new RegistryError('INVALID_GUARDIAN');
        const memberId = member.id ?? randomUUID();
        retainedIds.add(memberId);
        if (member.clientKey === draft.guardianKey) guardianId = memberId;
        const fields = prior ? memberFields.filter(field => member[field] !== prior[field]) : [];
        const values = { ...member, id: memberId, familyId: id, now };
        if (prior) {
          if (fields.length) this.db.prepare(`UPDATE members SET name=@name,name_ml=@nameMl,relationship=@relationship,gender=@gender,
            dob=@dob,father_name=@fatherName,mother_name=@motherName,marital_status=@maritalStatus,education=@education,
            occupation=@occupation,blood_group=@bloodGroup,phone=@phone,remarks=@remarks,updated_at=@now WHERE id=@id AND family_id=@familyId`).run(values);
        } else {
          this.db.prepare(`INSERT INTO members(id,family_id,name,name_ml,relationship,gender,dob,father_name,mother_name,
            marital_status,education,occupation,blood_group,phone,remarks,created_at,updated_at)
            VALUES(@id,@familyId,@name,@nameMl,@relationship,@gender,@dob,@fatherName,@motherName,@maritalStatus,
              @education,@occupation,@bloodGroup,@phone,@remarks,@now,@now)`).run(values);
        }
        changedMembers.push({ member, id: memberId, fields, isNew: !prior });
      }
      const values = { ...draft, id, guardianId, now };
      if (previous) {
        const update = this.db.prepare(`UPDATE families SET ward_id=@wardId,family_number=@familyNumber,house_name=@houseName,
          house_name_ml=@houseNameMl,house_number=@houseNumber,address=@address,locality=@locality,postal_code=@postalCode,
          email=@email,registration_date=@registrationDate,notes=@notes,status=@status,guardian_member_id=@guardianId,
          needs_guardian=0,revision=revision+1,updated_at=@now WHERE id=@id AND revision=@revision`).run(values);
        if (update.changes !== 1) throw new RegistryError('STALE_FAMILY');
        const fields = familyFields.filter(field => draft[field] !== previous[field]);
        if (fields.length) this.event(id, 'family.updated', now, null, fields);
        if (previous.guardianMemberId !== guardianId) this.event(id, 'guardian.changed', now, guardianId);
      } else {
        this.db.prepare(`INSERT INTO families(id,ward_id,family_number,house_name,house_name_ml,house_number,address,locality,
          postal_code,email,registration_date,notes,status,guardian_member_id,created_at,updated_at)
          VALUES(@id,@wardId,@familyNumber,@houseName,@houseNameMl,@houseNumber,@address,@locality,@postalCode,@email,
            @registrationDate,@notes,@status,@guardianId,@now,@now)`).run(values);
        this.event(id, 'family.created', now);
      }
      // End memberships; never delete or recycle the member identity.
      for (const prior of existing.values()) {
        if (!retainedIds.has(prior.id)) {
          this.db.prepare('UPDATE members SET archived_at=?,updated_at=? WHERE id=?').run(now, now, prior.id);
          this.db.prepare('UPDATE household_memberships SET ended_at=? WHERE member_id=? AND ended_at IS NULL').run(now, prior.id);
          this.event(id, 'member.removed', now, prior.id);
        }
      }
      for (const change of changedMembers) {
        if (change.isNew || change.fields.includes('relationship')) {
          if (!change.isNew) this.db.prepare('UPDATE household_memberships SET ended_at=? WHERE member_id=? AND ended_at IS NULL').run(now, change.id);
          this.db.prepare('INSERT INTO household_memberships(family_id,member_id,relationship,started_at) VALUES(?,?,?,?)').run(id, change.id, change.member.relationship, now);
        }
        if (change.isNew) this.event(id, 'member.added', now, change.id);
        else if (change.fields.length) this.event(id, 'member.updated', now, change.id, change.fields);
      }
      if (!previous || ['wardId', 'familyNumber', 'houseNumber'].some(field => draft[field as keyof FamilyDraft] !== previous[field as keyof FamilyProfile])) {
        this.db.prepare('UPDATE family_assignments SET ended_at=? WHERE family_id=? AND ended_at IS NULL').run(now, id);
        this.db.prepare('INSERT INTO family_assignments(family_id,ward_id,family_number,house_number,started_at) VALUES(?,?,?,?,?)').run(id, draft.wardId, draft.familyNumber, draft.houseNumber, now);
      }
      return this.get({ id });
    }).immediate();
  }

  get(input: unknown): FamilyProfile {
    const { id } = entityRequestSchema.parse(input);
    const row = this.db.prepare(`SELECT ${familyColumns} FROM families f JOIN wards w ON w.id=f.ward_id WHERE f.id=?`).get(id) as Omit<FamilyProfile, 'members' | 'history' | 'assignments' | 'totals'> | undefined;
    if (!row) throw new RegistryError('NOT_FOUND');
    const members = this.db.prepare(`SELECT ${memberColumns} FROM members m WHERE m.family_id=?
      ORDER BY CASE WHEN m.id=? THEN 0 ELSE 1 END, m.created_at, m.rowid`).all(id, row.guardianMemberId) as MemberRecord[];
    const historyRows = this.db.prepare(`SELECT h.id,h.action,h.member_id AS memberId,m.name AS memberName,m.name_ml AS memberNameMl,
      h.fields,h.created_at AS createdAt FROM registration_history h LEFT JOIN members m ON m.id=h.member_id
      WHERE h.family_id=? ORDER BY h.id DESC`).all(id) as (Omit<FamilyHistory, 'fields'> & { fields: string })[];
    const assignments = this.db.prepare(`SELECT a.id,w.name AS wardName,w.name_ml AS wardNameMl,a.family_number AS familyNumber,
      a.house_number AS houseNumber,a.started_at AS startedAt,a.ended_at AS endedAt FROM family_assignments a
      JOIN wards w ON w.id=a.ward_id WHERE a.family_id=? ORDER BY a.id DESC`).all(id) as FamilyAssignment[];
    const totals = { living: 0, male: 0, female: 0, other: 0, unknown: 0, deceased: 0, removed: 0 };
    for (const member of members) {
      if (member.archivedAt) totals.removed++;
      else if (member.lifeStatus === 'deceased') totals.deceased++;
      else { totals.living++; totals[member.gender]++; }
    }
    return { ...row, needsGuardian: Boolean(row.needsGuardian), members, assignments, totals, history: historyRows.map(event => ({ ...event, fields: JSON.parse(event.fields) as string[] })) };
  }

  list(input: unknown): PageResult<FamilySummary> {
    const query = familyQuerySchema.parse(input);
    const where = `WHERE (@allWards=1 OR f.ward_id IN(SELECT value FROM json_each(@allowedWards))) AND (@wardId='' OR f.ward_id=@wardId) AND (@search='' OR f.family_number LIKE @pattern ESCAPE '\\'
      OR (w.code || '/' || f.family_number) LIKE @pattern ESCAPE '\\' OR f.id LIKE @pattern ESCAPE '\\'
      OR f.house_name LIKE @pattern ESCAPE '\\' OR f.house_name_ml LIKE @pattern ESCAPE '\\'
      OR g.name LIKE @pattern ESCAPE '\\' OR g.name_ml LIKE @pattern ESCAPE '\\' OR g.phone LIKE @pattern ESCAPE '\\')`;
    const allowed=this.scope();const params = { ...query, pattern: literalLike(query.search),allWards:allowed===null?1:0,allowedWards:JSON.stringify(allowed??[]) };
    const from = 'FROM families f JOIN wards w ON w.id=f.ward_id JOIN members g ON g.id=f.guardian_member_id';
    const total = (this.db.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).get(params) as { n: number }).n;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
    const items = this.db.prepare(`SELECT f.id,f.family_number AS familyNumber,w.code || '/' || f.family_number AS familyCode,
      f.ward_id AS wardId,w.name AS wardName,w.name_ml AS wardNameMl,f.house_name AS houseName,f.house_name_ml AS houseNameMl,
      f.house_number AS houseNumber,g.name AS guardianName,g.name_ml AS guardianNameMl,g.phone,f.status,f.needs_guardian AS needsGuardian,
      (SELECT COUNT(*) FROM members m WHERE m.family_id=f.id AND m.archived_at IS NULL AND m.life_status='living') AS livingMembers
      ${from} ${where} ORDER BY w.sort_order,f.family_number COLLATE NOCASE,f.id LIMIT @pageSize OFFSET @offset`)
      .all({ ...params, offset: (page - 1) * query.pageSize }) as FamilySummary[];
    return { items: items.map(item => ({ ...item, needsGuardian: Boolean(item.needsGuardian) })), total, page, pageSize: query.pageSize };
  }

  listMembers(input: unknown): PageResult<MemberSummary> {
    const query: FamilyQuery = familyQuerySchema.parse(input);
    const allowed=this.scope();const params = { ...query, pattern: literalLike(query.search),allWards:allowed===null?1:0,allowedWards:JSON.stringify(allowed??[]) };
    const from = `FROM members m JOIN families f ON f.id=m.family_id JOIN wards w ON w.id=f.ward_id`;
    const where = `WHERE (@allWards=1 OR f.ward_id IN(SELECT value FROM json_each(@allowedWards))) AND m.archived_at IS NULL AND (@wardId='' OR f.ward_id=@wardId) AND
      (@search='' OR m.name LIKE @pattern ESCAPE '\\' OR m.name_ml LIKE @pattern ESCAPE '\\'
      OR m.phone LIKE @pattern ESCAPE '\\' OR m.id LIKE @pattern ESCAPE '\\' OR (w.code || '/' || f.family_number) LIKE @pattern ESCAPE '\\')`;
    const total = (this.db.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).get(params) as { n: number }).n;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
    const items = this.db.prepare(`SELECT ${memberColumns},w.code || '/' || f.family_number AS familyCode,
      f.house_name AS houseName,f.house_name_ml AS houseNameMl,w.name AS wardName,w.name_ml AS wardNameMl,
      m.id=f.guardian_member_id AS isGuardian ${from} ${where} ORDER BY m.name COLLATE NOCASE,m.name_ml,m.id LIMIT @pageSize OFFSET @offset`)
      .all({ ...params, offset: (page - 1) * query.pageSize }) as (Omit<MemberSummary, 'isGuardian'> & { isGuardian: number })[];
    return { items: items.map(member => ({ ...member, isGuardian: member.isGuardian === 1 })), total, page, pageSize: query.pageSize };
  }

  getMember(input: unknown): MemberSummary {
    const { id } = entityRequestSchema.parse(input);
    const row = this.db.prepare(`SELECT ${memberColumns},w.code || '/' || f.family_number AS familyCode,
      f.house_name AS houseName,f.house_name_ml AS houseNameMl,w.name AS wardName,w.name_ml AS wardNameMl,
      m.id=f.guardian_member_id AS isGuardian FROM members m JOIN families f ON f.id=m.family_id JOIN wards w ON w.id=f.ward_id WHERE m.id=?`).get(id) as (Omit<MemberSummary, 'isGuardian'> & { isGuardian: number }) | undefined;
    if (!row) throw new RegistryError('NOT_FOUND');
    return { ...row, isGuardian: row.isGuardian === 1 };
  }

  counts(): { families: number; livingMembers: number } {
    const scope=this.scope();const args={all:scope===null?1:0,wards:JSON.stringify(scope??[])};
    return {
      families: (this.db.prepare('SELECT COUNT(*) AS n FROM families WHERE @all=1 OR ward_id IN(SELECT value FROM json_each(@wards))').get(args) as { n: number }).n,
      livingMembers: (this.db.prepare("SELECT COUNT(*) AS n FROM members m JOIN families f ON f.id=m.family_id WHERE m.archived_at IS NULL AND m.life_status='living' AND (@all=1 OR f.ward_id IN(SELECT value FROM json_each(@wards)))").get(args) as { n: number }).n,
    };
  }
}
