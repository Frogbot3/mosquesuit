// better-sqlite3 13 ships Node-API binaries. Do not compile it against a V8 ABI.
// Verify the shipped native addon instead of requiring a local C++ toolchain.
import Database from 'better-sqlite3';
const db = new Database(':memory:');
try {
  db.exec('CREATE TABLE native_check (message TEXT NOT NULL) STRICT');
  db.prepare('INSERT INTO native_check VALUES (?)').run('മലയാളം');
  if (db.prepare('SELECT message FROM native_check').get().message !== 'മലയാളം') throw new Error('Unicode round trip failed');
  console.log(`SQLite native check passed: ${db.prepare('SELECT sqlite_version() AS version').get().version}`);
} finally { db.close(); }
