import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { blankEvent, categorySchema, eventDraftSchema, eventQuerySchema, eventRequestSchema, eventRevisionSchema, eventTransitionSchema, transferSchema, LifeEventError, type DivorceCategory, type EventDraft, type EventParty, type EventRecord, type EventSummary, type EventDocument, type EventHistory, type TransferHistory } from '../../shared/life-events';
import type { PageResult } from '../../shared/registration';

const baseColumns = 'id,kind,number,event_date AS eventDate,registration_date AS registrationDate,status,remarks,revision';
const like = (value: string) => `%${value.replace(/[\\%_]/g, char => `\\${char}`)}%`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class LifeEventsStore {
  constructor(private readonly db: Database.Database, readonly enabled: boolean) {}
  requireDemo() { if (!this.enabled) throw new LifeEventError('DEMO_ONLY'); }
  private audit(id: string | null, action: string, fields: string[] = []) { this.db.prepare('INSERT INTO event_audit_history(event_id,action,fields,created_at) VALUES(?,?,?,?)').run(id, action, JSON.stringify(fields), new Date().toISOString()); }
  private base(id: string) {
    const result = this.db.prepare(`SELECT ${baseColumns} FROM life_events WHERE id=?`).get(id) as Pick<EventRecord, 'id' | 'kind' | 'number' | 'eventDate' | 'registrationDate' | 'status' | 'remarks' | 'revision'> | undefined;
    if (!result) throw new LifeEventError('EVENT_NOT_FOUND'); return result;
  }
  private revision(input: {id:string;revision:number}) { const request = eventRevisionSchema.parse({id:input.id,revision:input.revision}); const event = this.base(request.id); if (event.revision !== request.revision) throw new LifeEventError('EVENT_STALE'); return event; }
  private member(id: string) {
    const row = this.db.prepare('SELECT id,family_id AS familyId,dob,life_status AS lifeStatus,archived_at AS archivedAt,marital_status AS maritalStatus FROM members WHERE id=?').get(id) as { id: string; familyId: string; dob: string; lifeStatus: string; archivedAt: string | null; maritalStatus: string } | undefined;
    if (!row) throw new LifeEventError('EVENT_PARTY'); return row;
  }
  private party(memberId: string | null, externalId: string | null, familyId: string | null): EventParty {
    const person = memberId ? this.db.prepare('SELECT name,name_ml AS nameMl,phone,life_status AS lifeStatus FROM members WHERE id=?').get(memberId) : this.db.prepare('SELECT name,name_ml AS nameMl,phone,guardian FROM external_parties WHERE id=?').get(externalId);
    const family = familyId ? this.db.prepare("SELECT w.code || '/' || f.family_number AS familyCode,w.name AS ward,w.name_ml AS wardMl,f.house_name AS house,f.house_name_ml AS houseMl FROM families f JOIN wards w ON w.id=f.ward_id WHERE f.id=?").get(familyId) : {};
    return { memberId, externalId, familyId, name: '', nameMl: '', phone: '', guardian: '', familyCode: '', ward: '', wardMl: '', house: '', houseMl: '', lifeStatus: '', ...person as object, ...family as object };
  }
  get(input: unknown): EventRecord {
    this.requireDemo(); const { id } = eventRequestSchema.parse(input); const base = this.base(id);
    const event: EventRecord = { ...blankEvent(base.kind), ...base, parties: [], member: null, documents: [], history: [], categoryName: '', categoryNameMl: '', marriageNumber: '', guardianRequired: false };
    const parties = this.db.prepare('SELECT member_id AS memberId,external_id AS externalId,family_id AS familyId FROM event_participants WHERE event_id=? ORDER BY position').all(id) as { memberId: string | null; externalId: string | null; familyId: string | null }[];
    event.parties = parties.map(p => this.party(p.memberId, p.externalId, p.familyId));
    if (base.kind === 'marriage') {
      const row = this.db.prepare('SELECT guardian_info AS guardianInfo,witnesses,officiant,venue,mahr FROM marriages WHERE event_id=?').get(id) as { witnesses: string };
      Object.assign(event, row, { witnesses: JSON.parse(row.witnesses) });
    } else if (base.kind === 'divorce') Object.assign(event, this.db.prepare("SELECT d.marriage_id AS marriageId,d.category_id AS categoryId,c.name AS categoryName,c.name_ml AS categoryNameMl,COALESCE(m.number,'') AS marriageNumber FROM divorces d JOIN divorce_categories c ON c.id=d.category_id LEFT JOIN life_events m ON m.id=d.marriage_id WHERE d.event_id=?").get(id));
    else {
      const row = this.db.prepare('SELECT member_id AS memberId,family_id AS familyId,place,burial_date AS burialDate,burial_location AS burialLocation,informant,informant_phone AS informantPhone,document_references AS documentReferences FROM deaths WHERE event_id=?').get(id) as { memberId: string; familyId: string };
      Object.assign(event, row); event.member = this.party(row.memberId, null, row.familyId);
      const member = this.member(row.memberId);
      event.guardianRequired = Boolean((this.db.prepare('SELECT needs_guardian AS required FROM families WHERE id=?').get(member.familyId) as { required: number }).required);
    }
    event.documents = this.db.prepare('SELECT id,name,mime,size,created_at AS createdAt FROM event_documents WHERE event_id=? ORDER BY created_at,id').all(id) as EventDocument[];
    const history = this.db.prepare('SELECT id,action,fields,created_at AS createdAt FROM event_audit_history WHERE event_id=? ORDER BY id DESC').all(id) as (Omit<EventHistory, 'fields'> & { fields: string })[];
    event.history = history.map(row => ({ ...row, fields: JSON.parse(row.fields) as string[] })); return event;
  }
  list(input: unknown): PageResult<EventSummary> {
    this.requireDemo(); const query = eventQuerySchema.parse(input); const params = { ...query, pattern: like(query.search) };
    const cte = `WITH records AS (SELECT e.*,
      COALESCE((SELECT group_concat(COALESCE(m.name,x.name),' / ') FROM event_participants p LEFT JOIN members m ON m.id=p.member_id LEFT JOIN external_parties x ON x.id=p.external_id WHERE p.event_id=e.id),(SELECT m.name FROM deaths d JOIN members m ON m.id=d.member_id WHERE d.event_id=e.id),'') AS names,
      COALESCE((SELECT group_concat(COALESCE(m.name_ml,x.name_ml),' / ') FROM event_participants p LEFT JOIN members m ON m.id=p.member_id LEFT JOIN external_parties x ON x.id=p.external_id WHERE p.event_id=e.id),(SELECT m.name_ml FROM deaths d JOIN members m ON m.id=d.member_id WHERE d.event_id=e.id),'') AS namesMl FROM life_events e)
      `;
    const where = `FROM records WHERE kind=@kind AND (@status='' OR status=@status) AND (@from='' OR event_date>=@from) AND (@until='' OR event_date<=@until) AND (@search='' OR number LIKE @pattern ESCAPE '\\' OR names LIKE @pattern ESCAPE '\\' OR namesMl LIKE @pattern ESCAPE '\\')`;
    const total = (this.db.prepare(`${cte}SELECT COUNT(*) AS n ${where}`).get(params) as { n: number }).n;
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)));
    const items = this.db.prepare(`${cte}SELECT ${baseColumns},names,namesMl ${where} ORDER BY event_date DESC,id LIMIT @pageSize OFFSET @offset`).all({ ...params, offset: (page - 1) * query.pageSize }) as EventSummary[];
    return { items, total, page, pageSize: query.pageSize };
  }
  private validateDates(draft: EventDraft) {
    const ids = draft.kind === 'death' ? [draft.memberId!] : draft.parties.flatMap(p => p.memberId ? [p.memberId] : []);
    for (const id of ids) {
      const member = this.member(id); if (member.dob && member.dob > draft.eventDate) throw new LifeEventError('EVENT_DATE');
      const death = this.db.prepare("SELECT e.event_date AS date FROM deaths d JOIN life_events e ON e.id=d.event_id WHERE d.member_id=? AND e.status='confirmed'").get(id) as { date: string } | undefined;
      if (draft.kind !== 'death' && death && draft.eventDate > death.date) throw new LifeEventError('EVENT_DATE');
      if (draft.kind === 'death' && this.db.prepare("SELECT 1 FROM event_participants p JOIN life_events e ON e.id=p.event_id WHERE p.member_id=? AND e.status IN ('confirmed','closed') AND e.event_date>?").get(id, draft.eventDate)) throw new LifeEventError('EVENT_DATE');
    }
  }
  save(input: unknown): EventRecord {
    this.requireDemo(); const draft = eventDraftSchema.parse(input);
    return this.db.transaction(() => {
      const previous = draft.id ? this.get({ id: draft.id }) : null;
      if (previous ? previous.revision !== draft.revision : draft.revision !== 0) throw new LifeEventError('EVENT_STALE');
      if (previous && previous.kind !== draft.kind) throw new LifeEventError('EVENT_LOCKED');
      if (previous && (['confirmed', 'closed'].includes(previous.status) || this.db.prepare('SELECT 1 FROM divorces WHERE marriage_id=?').get(previous.id))) {
        const identity = (p: EventDraft['parties'][number]) => [p.memberId, p.memberId ? null : p.externalId, p.memberId ? '' : p.name, p.memberId ? '' : p.nameMl, p.memberId ? '' : p.phone, p.memberId ? '' : p.guardian];
        if (draft.eventDate !== previous.eventDate || draft.memberId !== previous.memberId || draft.marriageId !== previous.marriageId || !same(draft.parties.map(identity), previous.parties.map(identity))) throw new LifeEventError('EVENT_LOCKED');
      }
      this.validateDates(draft);
      if (this.db.prepare('SELECT id FROM life_events WHERE kind=? AND number=? COLLATE NOCASE AND id!=?').get(draft.kind, draft.number, draft.id ?? '')) throw new LifeEventError('EVENT_DUPLICATE');
      const id = draft.id ?? randomUUID(); const now = new Date().toISOString();
      let source: EventRecord | null = null;
      if (draft.kind === 'divorce') {
        const category = this.db.prepare('SELECT active FROM divorce_categories WHERE id=?').get(draft.categoryId) as { active: number } | undefined;
        if (!category || !category.active && previous?.categoryId !== draft.categoryId) throw new LifeEventError('EVENT_PARTY');
        if (draft.marriageId) {
          source = this.get({ id: draft.marriageId });
          if (source.kind !== 'marriage') throw new LifeEventError('EVENT_PARTY');
          if (source.eventDate > draft.eventDate) throw new LifeEventError('EVENT_DATE');
          if (this.db.prepare('SELECT 1 FROM divorces WHERE marriage_id=? AND event_id!=?').get(source.id, id)) throw new LifeEventError('EVENT_DUPLICATE');
          if (!same(source.parties.map(p => p.memberId ?? p.externalId), draft.parties.map(p => p.memberId ?? p.externalId))) throw new LifeEventError('EVENT_PARTY');
          for (let i = 0; i < 2; i++) if (!draft.parties[i].memberId && !same([draft.parties[i].name,draft.parties[i].nameMl,draft.parties[i].phone,draft.parties[i].guardian], [source.parties[i].name,source.parties[i].nameMl,source.parties[i].phone,source.parties[i].guardian])) throw new LifeEventError('EVENT_PARTY');
        }
      }
      if (draft.kind === 'death') {
        if (this.db.prepare('SELECT event_id FROM deaths WHERE member_id=? AND event_id!=?').get(draft.memberId, id)) throw new LifeEventError('DUPLICATE_DEATH');
        if (!previous && this.member(draft.memberId!).lifeStatus === 'deceased') throw new LifeEventError('DUPLICATE_DEATH');
      }
      if (previous) this.db.prepare('UPDATE life_events SET number=?,event_date=?,registration_date=?,remarks=?,revision=revision+1,updated_at=? WHERE id=?').run(draft.number,draft.eventDate,draft.registrationDate,draft.remarks,now,id);
      else this.db.prepare('INSERT INTO life_events(id,kind,number,event_date,registration_date,remarks,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,draft.kind,draft.number,draft.eventDate,draft.registrationDate,draft.remarks,now,now);
      if (draft.kind !== 'death') {
        for (let position = 0; position < 2; position++) {
          const p = draft.parties[position]; const old = previous?.parties[position];
          let externalId: string | null = null; let familyId: string | null = null;
          if (p.memberId) familyId = source?.parties[position].familyId ?? (old?.memberId === p.memberId ? old.familyId : this.member(p.memberId).familyId);
          else {
            if (p.externalId && p.externalId !== old?.externalId && p.externalId !== source?.parties[position].externalId) throw new LifeEventError('EVENT_PARTY');
            externalId = p.externalId ?? randomUUID();
            if (!source) this.db.prepare('INSERT INTO external_parties(id,name,name_ml,phone,guardian) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_ml=excluded.name_ml,phone=excluded.phone,guardian=excluded.guardian').run(externalId,p.name,p.nameMl,p.phone,p.guardian);
          }
          this.db.prepare('INSERT INTO event_participants(event_id,position,member_id,external_id,family_id) VALUES(?,?,?,?,?) ON CONFLICT(event_id,position) DO UPDATE SET member_id=excluded.member_id,external_id=excluded.external_id,family_id=excluded.family_id').run(id,position,p.memberId,externalId,familyId);
        }
      }
      if (draft.kind === 'marriage') this.db.prepare('INSERT INTO marriages(event_id,guardian_info,witnesses,officiant,venue,mahr) VALUES(?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET guardian_info=excluded.guardian_info,witnesses=excluded.witnesses,officiant=excluded.officiant,venue=excluded.venue,mahr=excluded.mahr').run(id,draft.guardianInfo,JSON.stringify(draft.witnesses),draft.officiant,draft.venue,draft.mahr);
      else if (draft.kind === 'divorce') this.db.prepare('INSERT INTO divorces(event_id,marriage_id,category_id) VALUES(?,?,?) ON CONFLICT(event_id) DO UPDATE SET marriage_id=excluded.marriage_id,category_id=excluded.category_id').run(id,draft.marriageId,draft.categoryId);
      else this.db.prepare('INSERT INTO deaths(event_id,member_id,family_id,place,burial_date,burial_location,informant,informant_phone,document_references) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET member_id=excluded.member_id,family_id=excluded.family_id,place=excluded.place,burial_date=excluded.burial_date,burial_location=excluded.burial_location,informant=excluded.informant,informant_phone=excluded.informant_phone,document_references=excluded.document_references').run(id,draft.memberId,previous?.memberId === draft.memberId ? previous.member!.familyId : this.member(draft.memberId!).familyId,draft.place,draft.burialDate,draft.burialLocation,draft.informant,draft.informantPhone,draft.documentReferences);
      const changed = previous ? Object.keys(draft).filter(key => !['id','revision'].includes(key) && !same(draft[key as keyof EventDraft], key === 'parties' ? previous.parties.map(p => p.memberId ? { memberId: p.memberId, externalId: null, name: '', nameMl: '', phone: '', guardian: '' } : { memberId: null, externalId: p.externalId, name: p.name, nameMl: p.nameMl, phone: p.phone, guardian: p.guardian }) : previous[key as keyof EventDraft])) : [];
      this.audit(id, previous ? 'updated' : 'created', changed); return this.get({ id });
    }).immediate();
  }
  transition(input: unknown): EventRecord {
    this.requireDemo(); const request = eventTransitionSchema.parse(input);
    return this.db.transaction(() => {
      const base = this.revision(request); const event = this.get({ id: base.id });
      const next = request.action === 'review' ? 'under_review' : request.action === 'confirm' ? 'confirmed' : 'closed';
      if (request.action === 'review' ? event.kind !== 'divorce' || event.status !== 'reported' : request.action === 'close' ? event.kind !== 'divorce' || event.status !== 'confirmed' : !['reported','under_review'].includes(event.status)) throw new LifeEventError('EVENT_STATE');
      this.validateDates(event);
      const now = new Date().toISOString();
      if (request.action === 'confirm' && event.kind === 'divorce' && event.marriageId && this.base(event.marriageId).status !== 'confirmed') throw new LifeEventError('EVENT_STATE');
      this.db.prepare('UPDATE life_events SET status=?,revision=revision+1,updated_at=? WHERE id=?').run(next,now,event.id);
      if (request.action === 'confirm') {
        if (event.kind === 'marriage') this.db.prepare('INSERT INTO marriage_links(marriage_id,started_at) VALUES(?,?)').run(event.id,event.eventDate);
        if (event.kind === 'divorce' && event.marriageId) this.db.prepare('UPDATE marriage_links SET ended_at=? WHERE marriage_id=?').run(event.eventDate,event.marriageId);
        if (event.kind === 'death') {
          const member = this.member(event.memberId!); if (member.lifeStatus === 'deceased') throw new LifeEventError('DUPLICATE_DEATH');
          this.db.prepare('UPDATE families SET needs_guardian=1 WHERE guardian_member_id=?').run(member.id);
          this.db.prepare("UPDATE members SET life_status='deceased',updated_at=? WHERE id=?").run(now,member.id);
          this.db.prepare('UPDATE families SET revision=revision+1,updated_at=? WHERE id=?').run(now,member.familyId);
        } else {
          const families = new Set<string>();
          for (const party of event.parties) if (party.memberId) {
            const member = this.member(party.memberId); families.add(member.familyId);
            const active = this.db.prepare('SELECT 1 FROM marriage_links l JOIN event_participants p ON p.event_id=l.marriage_id WHERE p.member_id=? AND l.ended_at IS NULL').get(member.id);
            if (member.lifeStatus === 'living') this.db.prepare('UPDATE members SET marital_status=?,updated_at=? WHERE id=?').run(active ? 'married' : 'divorced',now,member.id);
          }
          for (const familyId of families) this.db.prepare('UPDATE families SET revision=revision+1,updated_at=? WHERE id=?').run(now,familyId);
        }
      }
      this.audit(event.id,next); return this.get({ id: event.id });
    }).immediate();
  }
  categories(): DivorceCategory[] { this.requireDemo(); return (this.db.prepare('SELECT id,name,name_ml AS nameMl,active FROM divorce_categories ORDER BY name').all() as (Omit<DivorceCategory,'active'> & {active:number})[]).map(c => ({...c,active:Boolean(c.active)})); }
  saveCategory(input: unknown) {
    this.requireDemo(); const category = categorySchema.parse(input);
    return this.db.transaction(() => { const id = category.id || randomUUID(); this.db.prepare('INSERT INTO divorce_categories(id,name,name_ml,active) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_ml=excluded.name_ml,active=excluded.active').run(id,category.name,category.nameMl,Number(category.active)); this.audit(null,'category.updated'); return this.categories(); }).immediate();
  }
  transfer(input: unknown): null {
    this.requireDemo(); const request = transferSchema.parse(input);
    return this.db.transaction(() => {
      const member = this.member(request.memberId);
      if (member.familyId !== request.fromFamilyId || member.archivedAt || member.lifeStatus !== 'living' || request.fromFamilyId === request.toFamilyId) throw new LifeEventError('EVENT_PARTY');
      if (this.db.prepare('SELECT 1 FROM families WHERE guardian_member_id=?').get(member.id)) throw new LifeEventError('GUARDIAN_TRANSFER');
      for (const [id,revision] of [[request.fromFamilyId,request.fromRevision],[request.toFamilyId,request.toRevision]]) {
        const row = this.db.prepare('SELECT revision FROM families WHERE id=?').get(id) as { revision:number } | undefined;
        if (!row || row.revision !== revision) throw new LifeEventError('EVENT_STALE');
      }
      if ((this.db.prepare('SELECT COUNT(*) AS n FROM members WHERE family_id=? AND archived_at IS NULL').get(request.toFamilyId) as {n:number}).n >= 50) throw new LifeEventError('EVENT_PARTY');
      const now = new Date().toISOString();
      this.db.prepare('UPDATE household_memberships SET ended_at=? WHERE member_id=? AND ended_at IS NULL').run(now,member.id);
      this.db.prepare('UPDATE members SET family_id=?,relationship=?,updated_at=? WHERE id=?').run(request.toFamilyId,request.relationship,now,member.id);
      this.db.prepare('INSERT INTO household_memberships(family_id,member_id,relationship,started_at) VALUES(?,?,?,?)').run(request.toFamilyId,member.id,request.relationship,now);
      this.db.prepare('INSERT INTO household_membership_history(member_id,from_family_id,to_family_id,reason,created_at) VALUES(?,?,?,?,?)').run(member.id,request.fromFamilyId,request.toFamilyId,request.reason,now);
      this.db.prepare('UPDATE families SET revision=revision+1,updated_at=? WHERE id IN (?,?)').run(now,request.fromFamilyId,request.toFamilyId);
      this.audit(null,'household.transferred'); return null;
    }).immediate();
  }
  transfers(familyId: string): TransferHistory[] {
    this.requireDemo(); eventRequestSchema.parse({ id: familyId });
    return this.db.prepare(`SELECT h.id,h.member_id AS memberId,m.name AS memberName,m.name_ml AS memberNameMl,w1.code || '/' || f1.family_number AS fromCode,w2.code || '/' || f2.family_number AS toCode,h.reason,h.created_at AS createdAt FROM household_membership_history h JOIN members m ON m.id=h.member_id JOIN families f1 ON f1.id=h.from_family_id JOIN wards w1 ON w1.id=f1.ward_id JOIN families f2 ON f2.id=h.to_family_id JOIN wards w2 ON w2.id=f2.ward_id WHERE h.from_family_id=? OR h.to_family_id=? ORDER BY h.id DESC`).all(familyId,familyId) as TransferHistory[];
  }
  addDocument(request: {id:string;revision:number}, name: string, content: Buffer): EventRecord {
    this.requireDemo();
    const extension = name.toLowerCase().split('.').pop();
    const mime = extension === 'pdf' && content.subarray(0,5).toString() === '%PDF-' ? 'application/pdf' : extension === 'png' && content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : ['jpg','jpeg'].includes(extension ?? '') && content[0] === 255 && content[1] === 216 && content[2] === 255 ? 'image/jpeg' : null;
    if (!mime || !content.length || content.length > 10 * 1024 * 1024 || !name || name.length > 200 || /[\\/\u0000-\u001f]/.test(name)) throw new LifeEventError('DOCUMENT_INVALID');
    return this.db.transaction(() => { this.revision(request); if ((this.db.prepare('SELECT COUNT(*) AS n FROM event_documents WHERE event_id=?').get(request.id) as {n:number}).n >= 10) throw new LifeEventError('DOCUMENT_LIMIT');
      const now = new Date().toISOString(); this.db.prepare('INSERT INTO event_documents(id,event_id,name,mime,size,content,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),request.id,name,mime,content.length,content,now);
      this.db.prepare('UPDATE life_events SET revision=revision+1,updated_at=? WHERE id=?').run(now,request.id); this.audit(request.id,'document.added'); return this.get({ id:request.id });
    }).immediate();
  }
  document(input: unknown): {name:string;content:Buffer} { this.requireDemo(); const {id}=eventRequestSchema.parse(input); const row = this.db.prepare('SELECT name,content FROM event_documents WHERE id=?').get(id) as {name:string;content:Buffer}|undefined; if (!row) throw new LifeEventError('EVENT_NOT_FOUND'); return row; }
}
