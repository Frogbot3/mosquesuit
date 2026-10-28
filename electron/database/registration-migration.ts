// Append-only migration 2. Migration 1 is intentionally unchanged.
export const registrationMigration = {
  version: 2,
  name: 'family_member_registration',
  sql: `
    CREATE TABLE families (
      id TEXT PRIMARY KEY,
      ward_id TEXT NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
      family_number TEXT NOT NULL COLLATE NOCASE CHECK(length(family_number) BETWEEN 1 AND 24),
      house_name TEXT NOT NULL DEFAULT '', house_name_ml TEXT NOT NULL DEFAULT '', house_number TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '', locality TEXT NOT NULL DEFAULT '', postal_code TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '', registration_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('draft','registered')),
      guardian_member_id TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(ward_id, family_number),
      FOREIGN KEY(id, guardian_member_id) REFERENCES members(family_id, id) DEFERRABLE INITIALLY DEFERRED
    ) STRICT;
    CREATE TABLE members (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      name TEXT NOT NULL DEFAULT '', name_ml TEXT NOT NULL DEFAULT '',
      relationship TEXT NOT NULL CHECK(relationship IN ('guardian','spouse','son','daughter','father','mother','sibling','grandparent','grandchild','other','unknown')),
      gender TEXT NOT NULL CHECK(gender IN ('unknown','male','female','other')),
      dob TEXT NOT NULL DEFAULT '', father_name TEXT NOT NULL DEFAULT '', mother_name TEXT NOT NULL DEFAULT '',
      marital_status TEXT NOT NULL CHECK(marital_status IN ('unknown','single','married','divorced','widowed')),
      education TEXT NOT NULL DEFAULT '', occupation TEXT NOT NULL DEFAULT '', blood_group TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '', remarks TEXT NOT NULL DEFAULT '',
      life_status TEXT NOT NULL DEFAULT 'living' CHECK(life_status IN ('living','deceased')),
      archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(family_id, id), CHECK(length(name) > 0 OR length(name_ml) > 0)
    ) STRICT;
    CREATE INDEX idx_families_ward_number ON families(ward_id, family_number);
    CREATE INDEX idx_members_family_current ON members(family_id, archived_at, life_status);
    CREATE INDEX idx_members_name ON members(name COLLATE NOCASE);
    CREATE INDEX idx_members_phone ON members(phone);
    CREATE TABLE household_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
      relationship TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT
    ) STRICT;
    CREATE UNIQUE INDEX idx_membership_current ON household_memberships(member_id) WHERE ended_at IS NULL;
    CREATE TRIGGER membership_current_family BEFORE INSERT ON household_memberships
      WHEN NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.member_id AND family_id=NEW.family_id AND archived_at IS NULL)
      BEGIN SELECT RAISE(ABORT, 'Membership must match the current household'); END;
    CREATE INDEX idx_membership_family_history ON household_memberships(family_id, started_at);
    CREATE TABLE family_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
      ward_id TEXT NOT NULL REFERENCES wards(id) ON DELETE RESTRICT,
      family_number TEXT NOT NULL, house_number TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT
    ) STRICT;
    CREATE UNIQUE INDEX idx_assignment_current ON family_assignments(family_id) WHERE ended_at IS NULL;
    CREATE TABLE registration_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE RESTRICT,
      member_id TEXT REFERENCES members(id) ON DELETE RESTRICT,
      action TEXT NOT NULL CHECK(action IN ('family.created','family.updated','guardian.changed','member.added','member.updated','member.removed')),
      fields TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(fields)),
      actor TEXT NOT NULL DEFAULT 'local-preview', created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX idx_registration_history_family ON registration_history(family_id, id DESC);
    CREATE TRIGGER registration_history_no_update BEFORE UPDATE ON registration_history
      BEGIN SELECT RAISE(ABORT, 'Registration history is append-only'); END;
    CREATE TRIGGER registration_history_no_delete BEFORE DELETE ON registration_history
      BEGIN SELECT RAISE(ABORT, 'Registration history is append-only'); END;
    CREATE TRIGGER families_guardian_insert BEFORE INSERT ON families
      WHEN NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.guardian_member_id AND family_id=NEW.id AND archived_at IS NULL AND life_status='living')
      BEGIN SELECT RAISE(ABORT, 'Guardian must be a current living household member'); END;
    CREATE TRIGGER families_guardian_update BEFORE UPDATE OF guardian_member_id ON families
      WHEN NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.guardian_member_id AND family_id=NEW.id AND archived_at IS NULL AND life_status='living')
      BEGIN SELECT RAISE(ABORT, 'Guardian must be a current living household member'); END;
    CREATE TRIGGER members_guardian_archive BEFORE UPDATE OF archived_at,life_status ON members
      WHEN (NEW.archived_at IS NOT NULL OR NEW.life_status='deceased') AND EXISTS(SELECT 1 FROM families WHERE guardian_member_id=NEW.id)
      BEGIN SELECT RAISE(ABORT, 'Choose a replacement guardian first'); END;
    CREATE TRIGGER membership_history_no_delete BEFORE DELETE ON household_memberships
      BEGIN SELECT RAISE(ABORT, 'Membership history cannot be deleted'); END;
    CREATE TRIGGER membership_history_close_only BEFORE UPDATE ON household_memberships
      WHEN OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL OR NEW.family_id != OLD.family_id OR NEW.member_id != OLD.member_id
        OR NEW.relationship != OLD.relationship OR NEW.started_at != OLD.started_at
      BEGIN SELECT RAISE(ABORT, 'Only a current membership may be closed'); END;
    CREATE TRIGGER assignment_history_no_delete BEFORE DELETE ON family_assignments
      BEGIN SELECT RAISE(ABORT, 'Assignment history cannot be deleted'); END;
    CREATE TRIGGER assignment_history_close_only BEFORE UPDATE ON family_assignments
      WHEN OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL OR NEW.family_id != OLD.family_id OR NEW.ward_id != OLD.ward_id
        OR NEW.family_number != OLD.family_number OR NEW.house_number != OLD.house_number OR NEW.started_at != OLD.started_at
      BEGIN SELECT RAISE(ABORT, 'Only a current assignment may be closed'); END;
  `,
};
