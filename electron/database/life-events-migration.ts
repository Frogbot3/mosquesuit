export const lifeEventsMigration = {
  version: 3, name: 'life_events_demo', sql: `
    ALTER TABLE families ADD COLUMN needs_guardian INTEGER NOT NULL DEFAULT 0 CHECK(needs_guardian IN (0,1));
    DROP TRIGGER members_guardian_archive;
    CREATE TRIGGER members_guardian_archive BEFORE UPDATE OF archived_at,life_status ON members
      WHEN EXISTS(SELECT 1 FROM families WHERE guardian_member_id=NEW.id AND (NEW.archived_at IS NOT NULL OR NEW.life_status='deceased' AND needs_guardian=0))
      BEGIN SELECT RAISE(ABORT, 'Choose a replacement guardian first'); END;
    CREATE TRIGGER families_guardian_flag BEFORE UPDATE OF needs_guardian ON families
      WHEN NEW.needs_guardian=0 AND NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.guardian_member_id AND life_status='living' AND archived_at IS NULL)
      BEGIN SELECT RAISE(ABORT, 'A living guardian is required'); END;
    CREATE TABLE life_events (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('marriage','divorce','death')),
      number TEXT NOT NULL COLLATE NOCASE, event_date TEXT NOT NULL, registration_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','under_review','confirmed','closed')),
      remarks TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(kind, number), CHECK(registration_date >= event_date)
    ) STRICT;
    CREATE INDEX idx_events_kind_date ON life_events(kind,event_date DESC,id);
    CREATE INDEX idx_events_status ON life_events(kind,status);
    CREATE TABLE external_parties (id TEXT PRIMARY KEY,name TEXT NOT NULL,name_ml TEXT NOT NULL,phone TEXT NOT NULL,guardian TEXT NOT NULL,CHECK(length(name)>0 OR length(name_ml)>0)) STRICT;
    CREATE TABLE event_participants (
      event_id TEXT NOT NULL REFERENCES life_events(id), position INTEGER NOT NULL CHECK(position IN (0,1)),
      member_id TEXT REFERENCES members(id), external_id TEXT REFERENCES external_parties(id), family_id TEXT REFERENCES families(id),
      PRIMARY KEY(event_id,position), CHECK((member_id IS NULL) != (external_id IS NULL))
    ) STRICT;
    CREATE INDEX idx_participant_member ON event_participants(member_id,event_id);
    CREATE TABLE marriages (event_id TEXT PRIMARY KEY REFERENCES life_events(id),guardian_info TEXT NOT NULL,witnesses TEXT NOT NULL CHECK(json_valid(witnesses)),officiant TEXT NOT NULL,venue TEXT NOT NULL,mahr TEXT NOT NULL) STRICT;
    CREATE VIEW marriage_participants AS SELECT p.* FROM event_participants p JOIN marriages m ON m.event_id=p.event_id;
    CREATE TABLE marriage_links (marriage_id TEXT PRIMARY KEY REFERENCES marriages(event_id),started_at TEXT NOT NULL,ended_at TEXT) STRICT;
    CREATE TABLE divorce_categories (id TEXT PRIMARY KEY,name TEXT NOT NULL,name_ml TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN (0,1))) STRICT;
    INSERT INTO divorce_categories VALUES ('reported','Reported separation','അറിയിച്ച വേർപിരിയൽ',1),('other','Other / unspecified','മറ്റുള്ളവ / വ്യക്തമാക്കിയിട്ടില്ല',1);
    CREATE TABLE divorces (event_id TEXT PRIMARY KEY REFERENCES life_events(id),marriage_id TEXT REFERENCES marriages(event_id),category_id TEXT NOT NULL REFERENCES divorce_categories(id)) STRICT;
    CREATE UNIQUE INDEX idx_divorce_marriage ON divorces(marriage_id) WHERE marriage_id IS NOT NULL;
    CREATE TABLE deaths (event_id TEXT PRIMARY KEY REFERENCES life_events(id),member_id TEXT NOT NULL UNIQUE REFERENCES members(id),family_id TEXT NOT NULL REFERENCES families(id),place TEXT NOT NULL,burial_date TEXT NOT NULL,burial_location TEXT NOT NULL,informant TEXT NOT NULL,informant_phone TEXT NOT NULL,document_references TEXT NOT NULL) STRICT;
    CREATE TABLE event_documents (id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES life_events(id),name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 10485760),content BLOB NOT NULL,created_at TEXT NOT NULL,CHECK(length(content)=size)) STRICT;
    CREATE INDEX idx_event_documents ON event_documents(event_id);
    CREATE TABLE event_audit_history (id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT REFERENCES life_events(id),action TEXT NOT NULL,fields TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(fields)),actor TEXT NOT NULL DEFAULT 'fictional-demo',created_at TEXT NOT NULL) STRICT;
    CREATE INDEX idx_event_audit ON event_audit_history(event_id,id DESC);
    CREATE TRIGGER event_audit_no_update BEFORE UPDATE ON event_audit_history BEGIN SELECT RAISE(ABORT,'Event history is append-only'); END;
    CREATE TRIGGER event_audit_no_delete BEFORE DELETE ON event_audit_history BEGIN SELECT RAISE(ABORT,'Event history is append-only'); END;
    CREATE TRIGGER events_no_delete BEFORE DELETE ON life_events BEGIN SELECT RAISE(ABORT,'Events must be retained'); END;
    CREATE TRIGGER event_documents_no_delete BEFORE DELETE ON event_documents BEGIN SELECT RAISE(ABORT,'Documents must be retained'); END;
    CREATE TRIGGER event_documents_no_update BEFORE UPDATE ON event_documents BEGIN SELECT RAISE(ABORT,'Documents must be retained'); END;
    CREATE TABLE household_membership_history (id INTEGER PRIMARY KEY AUTOINCREMENT,member_id TEXT NOT NULL REFERENCES members(id),from_family_id TEXT NOT NULL REFERENCES families(id),to_family_id TEXT NOT NULL REFERENCES families(id),reason TEXT NOT NULL,created_at TEXT NOT NULL,CHECK(from_family_id != to_family_id)) STRICT;
    CREATE INDEX idx_transfer_member ON household_membership_history(member_id,id DESC);
    CREATE TRIGGER transfers_no_update BEFORE UPDATE ON household_membership_history BEGIN SELECT RAISE(ABORT,'Transfer history is append-only'); END;
    CREATE TRIGGER transfers_no_delete BEFORE DELETE ON household_membership_history BEGIN SELECT RAISE(ABORT,'Transfer history is append-only'); END;
  `,
};
