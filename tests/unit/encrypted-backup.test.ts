import { blankEvent } from "../../shared/life-events";
import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  readdir,
} from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceStore } from "../../electron/database/store";
import {
  BackupService,
  decryptArchive,
  encryptArchive,
} from "../../electron/backup-service";
import { activeWorkspace } from "../../electron/workspace-path";
import { fictionalFamily } from "../fixtures/registration";
const admin = "Fictional administrator 123!",
  secret = "Fictional backup password 456!";
const roots: string[] = [];
const stores: WorkspaceStore[] = [];
const services: BackupService[] = [];
afterEach(async () => {
  for (const b of services.splice(0)) await b.dispose();
  for (const s of stores.splice(0)) s.close();
  for (const root of roots.splice(0)) {
    if (
      !/^mosque-secure-backup-[A-Za-z0-9]+$/.test(
        relative(resolve(tmpdir()), root),
      )
    )
      throw new Error("Unsafe cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture(now: () => number = Date.now) {
  const root = await mkdtemp(join(tmpdir(), "mosque-secure-backup-"));
  roots.push(root);
  const data = join(root, "data");
  await mkdir(data);
  const s = new WorkspaceStore(join(data, "mosque-suite.sqlite3"), true, true);
  stores.push(s);
  s.security.bootstrap({
    username: "fixture.admin",
    name: "Fictional Admin",
    password: admin,
    confirmed: true,
  });
  s.security.login({ username: "fixture.admin", password: admin });
  const b = new BackupService(
    s,
    data,
    data,
    {
      available: () => true,
      seal: (p) => Buffer.from(p),
      open: (b) => b.toString(),
    },
    undefined,
    undefined,
    now,
  );
  services.push(b);
  await b.configure(
    {
      password: secret,
      currentPassword: admin,
      scheduled: false,
      intervalHours: 24,
      retain: 3,
      confirmed: true,
    },
    join(root, "external-drive"),
  );
  return { s, b, root: data };
}
describe("encrypted backup and atomic recovery", () => {
  it("runs authorized schedules while logged out and retains only owned verified archives", async () => {
    let now = Date.now();
    const { s, b } = await fixture(() => now);
    const destination = (await b.state()).destination;
    await writeFile(
      join(destination, "unrelated.txt"),
      "Keep this unrelated file",
    );
    await b.configure(
      {
        password: secret,
        currentPassword: admin,
        scheduled: true,
        intervalHours: 1,
        retain: 1,
        confirmed: true,
      },
      destination,
    );
    s.security.logout();
    await b.scheduled();
    now += 3600001;
    await b.scheduled();
    s.security.login({ username: "fixture.admin", password: admin });
    const state = await b.state();
    expect(
      state.history.filter(
        (r) => r.kind === "scheduled" && r.status === "verified",
      ),
    ).toHaveLength(2);
    expect(
      state.history.some(
        (r) => r.kind === "retention" && r.status === "deleted",
      ),
    ).toBe(true);
    expect(
      (await readdir(destination)).filter((n) => n.endsWith(".msbackup")),
    ).toHaveLength(1);
    expect(await readFile(join(destination, "unrelated.txt"), "utf8")).toBe(
      "Keep this unrelated file",
    );
  });
  it("logs destination failure, releases maintenance and preserves current records", async () => {
    const { s, b, root } = await fixture();
    s.registration.save(fictionalFamily());
    const obstacle = join(root, "not-a-directory");
    await writeFile(obstacle, "Fictional obstruction");
    s.security.db
      .prepare("UPDATE security_settings SET backup_destination=? WHERE id=1")
      .run(obstacle);
    await expect(b.create(secret)).rejects.toThrow();
    expect(s.registration.counts().families).toBe(1);
    expect((await b.state()).history[0]).toMatchObject({ status: "failed" });
    expect((await b.state()).busy).toBe(false);
  });
  it("rejects future versions and authenticated manifests with mismatched checksums", async () => {
    const { s, b, root } = await fixture();
    await b.create(secret);
    const file = (await b.state()).history.find(
      (h) => h.status === "verified",
    )!.filename;
    const archive = decryptArchive(await readFile(file), secret);
    const future = join(root, "future.msbackup");
    await writeFile(
      future,
      encryptArchive({ ...archive, schemaVersion: 999 }, secret),
    );
    await expect(b.inspect(future, secret)).rejects.toThrow("BACKUP_VERSION");
    const bad = join(root, "checksum.msbackup");
    archive.files[0].sha256 = "0".repeat(64);
    await writeFile(bad, encryptArchive(archive, secret));
    await expect(b.inspect(bad, secret)).rejects.toThrow("BACKUP_INVALID");
    expect(s.checkStorage().integrity).toBe("ok");
    expect(activeWorkspace(root)).toBe(root);
  });
  it("backs up and previews 500 fictional families and 2000 members", async () => {
    const { s, b } = await fixture();
    for (let n = 1; n <= 500; n++)
      s.registration.save(fictionalFamily(String(n).padStart(3, "0")));
    await b.create(secret);
    const file = (await b.state()).history.find(
      (h) => h.status === "verified",
    )!.filename;
    const preview = await b.inspect(file, secret);
    expect(preview).toMatchObject({ families: 500, members: 2000 });
    expect(s.security.integrity()).toBe(true);
  }, 30000);

  it("verifies authenticated encryption and rejects wrong passwords and corruption", async () => {
    const { s, b } = await fixture();
    s.registration.save(fictionalFamily());
    await b.create(secret);
    const history = (await b.state()).history;
    const filename = history.find((h) => h.status === "verified")!.filename;
    const bytes = await readFile(filename);
    expect(bytes.subarray(0, 4).toString()).toBe("MSB6");
    expect(bytes.includes(Buffer.from("Fictional Ameen"))).toBe(false);
    expect(decryptArchive(bytes, secret).files).toHaveLength(1);
    expect(() =>
      decryptArchive(bytes, "Wrong fictional backup password"),
    ).toThrow("BACKUP_PASSWORD");
    bytes[bytes.length - 1] ^= 1;
    expect(() => decryptArchive(bytes, secret)).toThrow("BACKUP_PASSWORD");
  });
  it("previews before replacement, creates a safety archive and restores original data with valid relationships", async () => {
    const { s, b, root } = await fixture();
    const family = s.registration.save(fictionalFamily());
    const event = s.lifeEvents.save({
      ...blankEvent("death"),
      number: "D-BACKUP",
      memberId: family.guardianMemberId,
    });
    const attachment = Buffer.from("%PDF-1.7\nFictional backup fixture\n%%EOF");
    const saved = s.lifeEvents.addDocument(
      { id: event.id, revision: event.revision },
      "fictional.pdf",
      attachment,
    );
    await b.create(secret);
    const filename = (await b.state()).history.find(
      (h) => h.status === "verified",
    )!.filename;
    s.registration.save(fictionalFamily("002"));
    expect(s.registration.counts().families).toBe(2);
    const preview = await b.inspect(filename, secret);
    expect(preview.families).toBe(1);
    expect(preview.attachments).toBe(1);
    expect(s.registration.counts().families).toBe(2);
    await b.restore({
      previewId: preview.id,
      currentPassword: admin,
      confirmation: "RESTORE VERIFIED BACKUP",
    });
    const active = activeWorkspace(root);
    expect(active).not.toBe(root);
    const restored = new WorkspaceStore(
      join(active, "mosque-suite.sqlite3"),
      true,
      true,
    );
    stores.push(restored);
    restored.security.login({ username: "fixture.admin", password: admin });
    expect(restored.registration.counts().families).toBe(1);
    expect(restored.registration.get({ id: family.id }).members).toHaveLength(
      4,
    );
    expect(restored.checkStorage().integrity).toBe("ok");
    expect(restored.security.integrity()).toBe(true);
    expect(
      restored.lifeEvents.document({ id: saved.documents[0].id }).content,
    ).toEqual(attachment);
    expect(
      s.security.db
        .prepare(
          "SELECT 1 FROM backup_history WHERE kind='restore_safety' AND status='verified'",
        )
        .get(),
    ).toBeTruthy();
  });
  it("leaves live data untouched after corrupted archive verification", async () => {
    const { s, b, root } = await fixture();
    s.registration.save(fictionalFamily());
    await b.create(secret);
    const file = (await b.state()).history.find(
      (h) => h.status === "verified",
    )!.filename;
    const bad = await readFile(file);
    bad[bad.length - 3] ^= 1;
    const corrupted = join(root, "broken.msbackup");
    await writeFile(corrupted, bad);
    await expect(b.inspect(corrupted, secret)).rejects.toThrow();
    expect(s.registration.counts().families).toBe(1);
    expect(activeWorkspace(root)).toBe(root);
  });
});
