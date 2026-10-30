import { afterEach,describe,expect,it } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { WorkspaceStore } from '../../electron/database/store';
import { migrate,migrations } from '../../electron/database/migrations';
import { blankEvent,blankParty,eventToDraft,type EventRecord,type EventDraft } from '../../shared/life-events';
import { profileToDraft } from '../../shared/registration';
import { fictionalFamily } from '../fixtures/registration';
import { eventPaper } from '../../electron/event-output';

const stores: WorkspaceStore[]=[]; const dirs:string[]=[];
function open(file=':memory:',demo=true) { const store=new WorkspaceStore(file,demo); stores.push(store); return store; }
afterEach(()=>{stores.splice(0).forEach(s=>s.close());dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true}));});
function fixture(store:WorkspaceStore) { const a=store.registration.save(fictionalFamily('001'));const b=store.registration.save(fictionalFamily('002','ward-2'));return {a,b,marriage:({...blankEvent('marriage'),number:'M-001',eventDate:'2020-01-01',parties:[{...blankParty(),memberId:a.members[0].id},{...blankParty(),memberId:b.members[1].id}]} as EventDraft)}; }
function confirm(store:WorkspaceStore,event:EventRecord) { return store.lifeEvents.transition({id:event.id,revision:event.revision,action:'confirm',confirmation:'CONFIRM DEMO ACTION'}); }
describe('life-event storage',()=>{
  it('links existing spouses only through confirmation and never moves households',()=>{
    const store=open();const {a,b,marriage}=fixture(store);const saved=store.lifeEvents.save(marriage);
    expect(store.registration.getMember({id:a.members[0].id}).maritalStatus).toBe('unknown');
    const linked=confirm(store,saved);expect(linked.status).toBe('confirmed');
    expect(store.registration.getMember({id:a.members[0].id})).toMatchObject({familyId:a.id,maritalStatus:'married'});
    expect(store.registration.getMember({id:b.members[1].id})).toMatchObject({familyId:b.id,maritalStatus:'married'});
    expect(()=>store.registration.save({...profileToDraft(a),notes:'stale'})).toThrow('STALE_FAMILY');
    const current=store.registration.get({id:a.id});const draft=profileToDraft(current);draft.members[0].maritalStatus='single';
    expect(()=>store.registration.save(draft)).toThrow('EVENT_STATUS_MANAGED');expect(store.checkStorage().integrity).toBe('ok');
  });
  it('stores an external spouse without creating a duplicate member',()=>{
    const store=open();const {marriage}=fixture(store);marriage.parties[1]={...blankParty(),name:'Fictional External',nameMl:'സാങ്കൽപ്പിക വ്യക്തി'};
    const saved=confirm(store,store.lifeEvents.save(marriage));expect(saved.parties[1].externalId).toBeTruthy();expect(store.registration.counts().livingMembers).toBe(8);
    expect(saved.parties[1].nameMl).toBe('സാങ്കൽപ്പിക വ്യക്തി');
  });
  it('confirms an administrative divorce while retaining marriage and household history',()=>{
    const store=open();const {a,marriage}=fixture(store);const married=confirm(store,store.lifeEvents.save(marriage));
    const divorce=store.lifeEvents.save({...blankEvent('divorce'),number:'D-001',eventDate:'2021-01-01',marriageId:married.id,parties:eventToDraft(married).parties});
    expect(store.registration.getMember({id:a.members[0].id}).maritalStatus).toBe('married');
    const reviewed=store.lifeEvents.transition({id:divorce.id,revision:0,action:'review',confirmation:'CONFIRM DEMO ACTION'});
    const ended=confirm(store,reviewed);expect(store.registration.getMember({id:a.members[0].id}).maritalStatus).toBe('divorced');
    expect(store.lifeEvents.get({id:married.id}).status).toBe('confirmed');expect(store.registration.get({id:a.id}).members).toHaveLength(4);
    expect(store.lifeEvents.transition({id:ended.id,revision:ended.revision,action:'close',confirmation:'CONFIRM DEMO ACTION'}).status).toBe('closed');
  });
  it('records death, reduces living counts and flags the guardian without deleting anyone',()=>{
    const store=open();const {a}=fixture(store);const death=store.lifeEvents.save({...blankEvent('death'),number:'DE-001',memberId:a.guardianMemberId});
    expect(store.registration.counts().livingMembers).toBe(8);const saved=confirm(store,death);expect(saved.guardianRequired).toBe(true);
    const family=store.registration.get({id:a.id});expect(family).toMatchObject({needsGuardian:true,totals:{living:3,deceased:1}});expect(family.members).toHaveLength(4);
    const draft=profileToDraft(family);draft.guardianKey=draft.members[1].clientKey;draft.members[1].relationship='guardian';draft.members[0].relationship='other';
    expect(store.registration.save(draft).needsGuardian).toBe(false);
    expect(()=>store.lifeEvents.save({...blankEvent('death'),number:'DE-002',memberId:a.guardianMemberId})).toThrow('DUPLICATE_DEATH');
  });
  it('requires valid chronological dates, distinct participants and matching linked marriage parties',()=>{
    const store=open();const {a,b,marriage}=fixture(store);
    for(const date of ['2026-02-30','2099-01-01']) expect(()=>store.lifeEvents.save({...marriage,eventDate:date})).toThrow();
    expect(()=>store.lifeEvents.save({...marriage,parties:[marriage.parties[0],marriage.parties[0]]})).toThrow();
    expect(()=>store.lifeEvents.save({...blankEvent('death'),number:'X',memberId:a.members[2].id,eventDate:'1900-01-01'})).toThrow('EVENT_DATE');
    const saved=confirm(store,store.lifeEvents.save(marriage));
    expect(()=>store.lifeEvents.save({...blankEvent('divorce'),number:'X',eventDate:'2019-01-01',marriageId:saved.id,parties:eventToDraft(saved).parties})).toThrow('EVENT_DATE');
    expect(()=>store.lifeEvents.save({...blankEvent('divorce'),number:'X',marriageId:saved.id,parties:[{...blankParty(),memberId:b.guardianMemberId},marriage.parties[1]]})).toThrow('EVENT_PARTY');
    const draft=profileToDraft(store.registration.get({id:a.id}));draft.members[0].dob='2022-01-01';expect(()=>store.registration.save(draft)).toThrow('EVENT_DATE');
  });
  it('rejects duplicate numbers, stale changes, locked identity edits and illegal transitions',()=>{
    const store=open();const {marriage}=fixture(store);const saved=store.lifeEvents.save(marriage);
    expect(()=>store.lifeEvents.save({...marriage,number:'m-001'})).toThrow('EVENT_DUPLICATE');
    const confirmed=confirm(store,saved);expect(()=>store.lifeEvents.save(eventToDraft(saved))).toThrow('EVENT_STALE');
    expect(()=>store.lifeEvents.save({...eventToDraft(confirmed),eventDate:'2019-01-01'})).toThrow('EVENT_LOCKED');
    expect(()=>confirm(store,confirmed)).toThrow('EVENT_STATE');
    expect(store.lifeEvents.save({...eventToDraft(confirmed),remarks:'Fictional correction'}).history[0].fields).toContain('remarks');
  });
  it('transfers a non-guardian explicitly, preserving both memberships and event family references',()=>{
    const store=open();const {a,b,marriage}=fixture(store);const saved=confirm(store,store.lifeEvents.save(marriage));
    const from=store.registration.get({id:b.id});const to=store.registration.get({id:a.id});
    store.lifeEvents.transfer({memberId:b.members[1].id,fromFamilyId:b.id,toFamilyId:a.id,fromRevision:from.revision,toRevision:to.revision,relationship:'spouse',reason:'Fictional household move',confirmation:'CONFIRM DEMO TRANSFER'});
    expect(store.registration.getMember({id:b.members[1].id}).familyId).toBe(a.id);expect(store.lifeEvents.get({id:saved.id}).parties[1].familyId).toBe(b.id);
    expect(store.lifeEvents.transfers(a.id)).toHaveLength(1);expect(store.lifeEvents.transfers(b.id)).toHaveLength(1);
    expect(()=>store.lifeEvents.transfer({memberId:a.guardianMemberId,fromFamilyId:a.id,toFamilyId:b.id,fromRevision:0,toRevision:0,relationship:'other',reason:'Test',confirmation:'CONFIRM DEMO TRANSFER'})).toThrow('GUARDIAN_TRANSFER');
    expect(store.checkStorage().integrity).toBe('ok');
  });
  it('denies all operations outside the isolated demo',()=>{
    const store=open(':memory:',false);
    for(const action of [()=>store.lifeEvents.list({}),()=>store.lifeEvents.get({}),()=>store.lifeEvents.save({}),()=>store.lifeEvents.transition({}),()=>store.lifeEvents.transfer({}),()=>store.lifeEvents.categories(),()=>store.lifeEvents.saveCategory({}),()=>store.lifeEvents.document({}),()=>store.lifeEvents.transfers('x'),()=>store.lifeEvents.addDocument({id:'x',revision:0},'x.pdf',Buffer.from('%PDF-'))]) expect(action).toThrow('DEMO_ONLY');
  });
  it('keeps attachments bounded and immutable and audits category changes',()=>{
    const store=open();const {marriage}=fixture(store);const saved=store.lifeEvents.save(marriage);
    expect(()=>store.lifeEvents.addDocument(saved,'bad.exe',Buffer.from('unsafe'))).toThrow('DOCUMENT_INVALID');
    const attached=store.lifeEvents.addDocument(saved,'fictional.pdf',Buffer.from('%PDF-1.7\nfictional test only'));
    expect(attached.documents).toHaveLength(1);expect(store.lifeEvents.document({id:attached.documents[0].id}).content.toString()).toContain('fictional');
    expect(()=>store.lifeEvents.addDocument(saved,'fictional.pdf',Buffer.from('%PDF-'))).toThrow('EVENT_STALE');
    expect(store.lifeEvents.saveCategory({id:'demo',name:'Fictional category',nameMl:'മാതൃക',active:true})).toEqual(expect.arrayContaining([expect.objectContaining({id:'demo',nameMl:'മാതൃക'})]));
  });
  it('rolls back confirmations when audit persistence fails',()=>{
    const dir=mkdtempSync(join(tmpdir(),'mosque-events-'));dirs.push(dir);const file=join(dir,'test.sqlite3');const store=open(file);const {a}=fixture(store);
    const saved=store.lifeEvents.save({...blankEvent('death'),number:'DE-001',memberId:a.guardianMemberId});const db=new Database(file);
    db.exec("CREATE TRIGGER fail_events BEFORE INSERT ON event_audit_history BEGIN SELECT RAISE(ABORT,'simulation'); END");db.close();
    expect(()=>confirm(store,saved)).toThrow();expect(store.registration.get({id:a.id})).toMatchObject({needsGuardian:false,totals:{living:4}});expect(store.lifeEvents.get({id:saved.id}).status).toBe('reported');
  });
  it('upgrades a populated Phase 2 database and persists Unicode events after reopening',()=>{
    const dir=mkdtempSync(join(tmpdir(),'mosque-events-upgrade-'));dirs.push(dir);const file=join(dir,'test.sqlite3');const db=new Database(file);db.pragma('foreign_keys=ON');migrate(db,migrations.slice(0,2));
    db.prepare("UPDATE mosque_settings SET name='Fictional existing mosque'").run();
    const preservedFamily=crypto.randomUUID();const preservedMember=crypto.randomUUID();const now=new Date().toISOString();
    db.transaction(()=>{
      db.prepare("INSERT INTO members(id,family_id,name,name_ml,relationship,gender,marital_status,created_at,updated_at) VALUES(?,?,?,?,'guardian','unknown','unknown',?,?)").run(preservedMember,preservedFamily,'Fictional Phase 2 guardian','മാതൃകാ രക്ഷിതാവ്',now,now);
      db.prepare("INSERT INTO families(id,ward_id,family_number,status,guardian_member_id,created_at,updated_at) VALUES(?,'ward-1','PRE-2','draft',?,?,?)").run(preservedFamily,preservedMember,now,now);
      db.prepare("INSERT INTO household_memberships(family_id,member_id,relationship,started_at) VALUES(?,?,'guardian',?)").run(preservedFamily,preservedMember,now);
      db.prepare("INSERT INTO family_assignments(family_id,ward_id,family_number,house_number,started_at) VALUES(?,'ward-1','PRE-2','',?)").run(preservedFamily,now);
    })();db.close();const store=open(file);
    expect(store.registration.get({id:preservedFamily})).toMatchObject({guardianMemberId:preservedMember,needsGuardian:false,totals:{living:1},members:[expect.objectContaining({nameMl:'മാതൃകാ രക്ഷിതാവ്'})]});
    const {marriage}=fixture(store);const saved=store.lifeEvents.save({...marriage,remarks:'സാങ്കൽപ്പിക വിവരം'});store.close();
    const reopened=open(file);expect(reopened.getSettings().name).toBe('Fictional existing mosque');expect(reopened.lifeEvents.get({id:saved.id}).remarks).toBe('സാങ്കൽപ്പിക വിവരം');expect(reopened.getSchemaVersion()).toBe(5);
  });
  it('searches bilingual records with date/status filters and escapes output markup',()=>{
    const store=open();const {marriage}=fixture(store);const event=store.lifeEvents.save({...marriage,remarks:'<script>bad()</script>'});
    const query={kind:'marriage',search:'അമീൻ',status:'reported',from:'2019-01-01',until:'2021-01-01',page:1,pageSize:10};expect(store.lifeEvents.list(query).total).toBe(1);expect(store.lifeEvents.list({...query,search:'%'}).total).toBe(0);
    const html=eventPaper(event,store.getSettings(),'app://mosque/style.css');expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('Not an official government certificate');expect(html).toContain('മാതൃകാ');
  });
});
