import ExcelJS from 'exceljs';
import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import type { WorkspaceStore } from './database/store';
import type { BackupService } from './backup-service';
import { blankMember, saveFamilySchema, type FamilyDraft } from '../shared/registration';
import { mappingSchema, importCommitSchema, wardSetupSchema, type ImportSource, type ImportPreview, type ImportIssue, type ImportField } from '../shared/release';
const MAX_FILE = 4 * 1024 * 1024;
const MAX_ROWS = 10000;
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const pushCell = () => { if (cell.length > 2000) throw new Error('IMPORT_CELL_LIMIT'); row.push(cell.normalize('NFC')); cell = ''; closed = false; if (row.length > 64) throw new Error('IMPORT_COLUMN_LIMIT'); };
  const pushRow = () => { pushCell(); rows.push(row); row = []; if (rows.length > MAX_ROWS + 1) throw new Error('IMPORT_ROW_LIMIT'); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; }
    else if (c === ',') pushCell();
    else if (c === '\r' || c === '\n') { pushRow(); if (c === '\r' && text[i + 1] === '\n') i++; }
    else if (closed) { if (c !== ' ' && c !== '\t') throw new Error('IMPORT_CSV_QUOTES'); }
    else if (c === '"') { if (cell) throw new Error('IMPORT_CSV_QUOTES'); quoted = true; }
    else cell += c;
  }
  if (quoted) throw new Error('IMPORT_CSV_QUOTES');
  if (cell || row.length || closed) pushRow();
  return rows;
}
// Bound decompression before ExcelJS sees a workbook. ZIP64, encryption and macros
// are intentionally unsupported. No formulas, external links or hyperlinks are evaluated.
export function checkXlsxContainer(bytes: Buffer) {
  if (bytes.length < 22 || bytes.length > MAX_FILE) throw new Error('IMPORT_FILE_LIMIT');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  if (end < 0) throw new Error('IMPORT_XLSX_INVALID');
  const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16), length = bytes.readUInt32LE(end + 12);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || count !== bytes.readUInt16LE(end + 8) || count > 512 || start + length !== end) throw new Error('IMPORT_XLSX_LIMIT');
  let cursor = start, expanded = 0;
  const seen = new Set<string>();
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error('IMPORT_XLSX_INVALID');
    const size = bytes.readUInt32LE(cursor + 24), nameLength = bytes.readUInt16LE(cursor + 28), extraLength = bytes.readUInt16LE(cursor + 30), commentLength = bytes.readUInt16LE(cursor + 32), local = bytes.readUInt32LE(cursor + 42);
    expanded += size;
    if (expanded > 20 * 1024 * 1024 || bytes.readUInt16LE(cursor + 8) & 1 || local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('IMPORT_XLSX_LIMIT');
    if (cursor + 46 + nameLength + extraLength + commentLength > end) throw new Error('IMPORT_XLSX_INVALID');
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (seen.has(name) || name.includes('..') || /vbaProject|externalLinks|^\/|\\/i.test(name)) throw new Error('IMPORT_XLSX_UNSAFE');
    const compressed = bytes.readUInt32LE(cursor + 20), method = bytes.readUInt16LE(cursor + 10);
    const dataOffset = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (bytes.readUInt16LE(local + 8) !== method || bytes.readUInt16LE(local + 6) !== bytes.readUInt16LE(cursor + 8) || bytes.subarray(local + 30, local + 30 + bytes.readUInt16LE(local + 26)).toString('utf8') !== name) throw new Error('IMPORT_XLSX_INVALID');
    if (dataOffset + compressed > start || ![0, 8].includes(method)) throw new Error('IMPORT_XLSX_INVALID');
    const data = bytes.subarray(dataOffset, dataOffset + compressed);
    const inflated = method === 8 ? inflateRawSync(data, { maxOutputLength: Math.max(1, size) }) : data;
    if (inflated.length !== size || /<!DOCTYPE|<!ENTITY/i.test(inflated.toString('utf8'))) throw new Error('IMPORT_XLSX_UNSAFE');
    if (/^xl\/worksheets\/.*\.xml$/.test(name)) for (const match of inflated.toString('utf8').matchAll(/\br="([A-Z]*)(\d+)"/g)) {
      const column = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      if (Number(match[2]) > MAX_ROWS + 1 || column > 64) throw new Error('IMPORT_ROW_LIMIT');
    }
    seen.add(name); cursor += 46 + nameLength + extraLength + commentLength;
    if (cursor > end) throw new Error('IMPORT_XLSX_INVALID');
  }
  if (cursor !== end || !seen.has('[Content_Types].xml')) throw new Error('IMPORT_XLSX_INVALID');
}
export async function parseImport(bytes: Buffer, extension: string): Promise<{ encoding: string; columns: string[]; rows: string[][] }> {
  if (!bytes.length || bytes.length > MAX_FILE) throw new Error('IMPORT_FILE_LIMIT');
  let rows: string[][], encoding: string;
  if (extension === '.csv') {
    encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
    rows = parseCsv(new TextDecoder(encoding, { fatal: true }).decode(bytes));
  } else if (extension === '.xlsx') {
    checkXlsxContainer(bytes); encoding = 'xlsx-unicode';
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    if (workbook.worksheets.length !== 1) throw new Error('IMPORT_ONE_SHEET');
    const sheet = workbook.worksheets[0]; if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > 64) throw new Error('IMPORT_ROW_LIMIT');
    rows = [];
    sheet.eachRow({ includeEmpty: true }, row => {
      const values: string[] = [];
      for (let i = 1; i <= sheet.columnCount; i++) {
        const cell = row.getCell(i), value = cell.value;
        if (value && typeof value === 'object' && !(value instanceof Date)) throw new Error('IMPORT_FORMULA_OR_COMPLEX_CELL');
        const text = value instanceof Date ? value.toISOString().slice(0, 10) : value == null ? '' : String(value);
        if (text.length > 2000) throw new Error('IMPORT_CELL_LIMIT'); values.push(text.normalize('NFC'));
      }
      rows.push(values);
    });
  } else throw new Error('IMPORT_FORMAT');
  if (rows.length < 2) throw new Error('IMPORT_EMPTY');
  const columns = rows.shift()!.map(v => v.trim());
  if (!columns.length || columns.some(v => !v || v.length > 120) || new Set(columns).size !== columns.length || rows.some(row => row.length > columns.length)) throw new Error('IMPORT_HEADERS');
  return { encoding, columns, rows };
}
type Source = Awaited<ReturnType<typeof parseImport>> & { id: string; hash: string; owner: string; expires: number; filename: string };
type Staged = { preview: ImportPreview; source: Source; families: FamilyDraft[]; wards: { id: string; code: string; name: string; nameMl: string }[] };
export class ImportService {
  private source?: Source;
  private staged?: Staged;
  private busy = false;
  constructor(private readonly store: WorkspaceStore, private readonly backup: Pick<BackupService, 'create'>) {}
  private authorize() { const auth = this.store.security; auth.require('settings.change'); auth.require('families.create'); auth.require('backup.create'); auth.global(); return auth.require(); }
  async select(bytes: Buffer, extension: string, filename: string): Promise<ImportSource> {
    const user = this.authorize(); this.cancel(); const parsed = await parseImport(bytes, extension); this.authorize();
    this.source = { ...parsed, id: randomUUID(), hash: createHash('sha256').update(bytes).digest('hex'), owner: user.id, expires: Date.now() + 30 * 60000, filename };
    return { sourceId: this.source.id, filename, encoding: parsed.encoding, columns: parsed.columns, rows: parsed.rows.slice(0, 10), totalRows: parsed.rows.length };
  }
  cancel() { this.authorize(); if (this.busy) throw new Error('IMPORT_BUSY'); this.source = undefined; this.staged = undefined; return null; }
  preview(input: unknown): ImportPreview {
    const user = this.authorize(), request = mappingSchema.parse(input), source = this.source;
    if (this.busy || !source || source.id !== request.sourceId || source.owner !== user.id || source.expires < Date.now()) throw new Error('IMPORT_EXPIRED');
    const indexes = new Map<ImportField, number>();
    for (const [field, column] of Object.entries(request.mapping)) if (column) { const i = source.columns.indexOf(column); if (i < 0) throw new Error('IMPORT_MAPPING'); indexes.set(field as ImportField, i); }
    for (const required of ['wardCode','familyNumber','relationship'] as const) if (!indexes.has(required)) throw new Error('IMPORT_MAPPING');
    if (!indexes.has('memberName') && !indexes.has('memberNameMl')) throw new Error('IMPORT_MAPPING');
    if (new Set(indexes.values()).size !== indexes.size) throw new Error('IMPORT_MAPPING');
    const issues: ImportIssue[] = [], families: FamilyDraft[] = [], wards: Staged['wards'] = [], sample: ImportPreview['sample'] = [];
    const existingWards = this.store.getWards(), groups = new Map<string, { row: number; value: Partial<Record<ImportField, string>> }[]>();
    source.rows.forEach((cells, i) => {
      if (!cells.some(c => c.trim())) return;
      const value = Object.fromEntries([...indexes].map(([key, index]) => [key, (cells[index] ?? '').trim()])) as Partial<Record<ImportField, string>>;
      value.wardCode = value.wardCode?.toUpperCase(); value.familyNumber = value.familyNumber?.toUpperCase();
      const key = `${value.wardCode}\0${value.familyNumber}`;
      const group = groups.get(key) ?? []; group.push({ row: i + 2, value }); groups.set(key, group);
    });
    for (const group of [...groups.values()].slice(0, request.familyLimit)) {
      const first = group[0], v = first.value;
      const issue = (row: number, field: string, code: string, severity: ImportIssue['severity'] = 'error') => issues.push({ row, field, code, severity });
      const code = v.wardCode ?? '';
      if (!/^[A-Z0-9][A-Z0-9-]{0,23}$/.test(code)) { issue(first.row, 'wardCode', 'INVALID_WARD'); continue; }
      let ward = existingWards.find(w => w.code.toUpperCase() === code) ?? wards.find(w => w.code === code);
      if (!ward) { if (!wardSetupSchema.safeParse({ id: '', code, name: v.wardName, nameMl: v.wardNameMl ?? '', active: true }).success) { issue(first.row, 'wardName', 'WARD_NAME_REQUIRED'); continue; } ward = { id: randomUUID(), code, name: v.wardName!, nameMl: v.wardNameMl ?? '' }; wards.push(ward); }
      if ('active' in ward && !ward.active) issue(first.row, 'wardCode', 'INACTIVE_WARD');
      for (const item of group) {
        if (item.value.wardName && item.value.wardName !== ward.name || item.value.wardNameMl && item.value.wardNameMl !== ward.nameMl) issue(item.row, 'wardName', 'WARD_NAME_CONFLICT');
      }
      if (this.store.security.db.prepare('SELECT 1 FROM families WHERE ward_id=? AND family_number=?').get(ward.id, v.familyNumber ?? '')) issue(first.row, 'familyNumber', 'DUPLICATE_FAMILY');
      const familyValue = (key: ImportField) => { const values = [...new Set(group.map(item => item.value[key] ?? '').filter(Boolean))]; if (values.length > 1) issue(first.row, key, 'INCONSISTENT_FAMILY'); return values[0] ?? ''; };
      const members = group.map(item => {
        const m = blankMember(); const fields = item.value;
        return { ...m, name: fields.memberName ?? '', nameMl: fields.memberNameMl ?? '', relationship: fields.relationship?.toLowerCase() || 'unknown', gender: fields.gender?.toLowerCase() || 'unknown', dob: fields.dob ?? '', phone: fields.phone ?? '', fatherName: fields.fatherName ?? '', motherName: fields.motherName ?? '', maritalStatus: fields.maritalStatus?.toLowerCase() || 'unknown', education: fields.education ?? '', occupation: fields.occupation ?? '', bloodGroup: fields.bloodGroup ?? '' };
      });
      const guardians = members.filter(m => m.relationship === 'guardian');
      if (guardians.length !== 1) issue(first.row, 'relationship', 'ONE_GUARDIAN_REQUIRED');
      const draft = { id: null, revision: 0, wardId: ward.id, familyNumber: v.familyNumber ?? '', houseName: familyValue('houseName'), houseNameMl: familyValue('houseNameMl'), houseNumber: familyValue('houseNumber'), address: familyValue('address'), locality: familyValue('locality'), postalCode: familyValue('postalCode'), email: familyValue('email'), registrationDate: familyValue('registrationDate'), notes: '', status: 'registered', guardianKey: guardians[0]?.clientKey ?? randomUUID(), members };
      const validated = saveFamilySchema.safeParse(draft);
      if (!validated.success) for (const error of validated.error.issues) { const n = error.path[0] === 'members' && typeof error.path[1] === 'number' ? error.path[1] : 0; issue(group[n]?.row ?? first.row, error.path.join('.'), error.code === 'custom' ? error.message : 'INVALID_VALUE'); }
      else families.push(validated.data);
      const seenMembers = new Set<string>();
      members.forEach((member, i) => {
        const key = `${member.name.toLocaleLowerCase()}|${member.nameMl}|${member.dob}`;
        if (seenMembers.has(key)) issue(group[i].row, 'memberName', 'POSSIBLE_DUPLICATE_MEMBER', 'warning'); seenMembers.add(key);
        if (member.dob && this.store.security.db.prepare('SELECT 1 FROM members WHERE (name=? OR (name_ml<>\'\' AND name_ml=?)) AND dob=? LIMIT 1').get(member.name, member.nameMl, member.dob)) issue(group[i].row, 'memberName', 'EXISTING_MEMBER_MATCH', 'warning');
        if (sample.length < 20) sample.push({ row: group[i].row, family: `${code}/${v.familyNumber}`, member: member.name || member.nameMl });
      });
    }
    const preview: ImportPreview = { previewId: randomUUID(), families: families.length, members: families.reduce((n, f) => n + f.members.length, 0), newWards: wards.length, issues, sample, sourceRows: source.rows.length };
    this.staged = { preview, source, families, wards }; return preview;
  }
  report(id: string): ImportPreview { const user = this.authorize(); if (!this.staged || this.staged.preview.previewId !== id || this.staged.source.owner !== user.id || this.staged.source.expires < Date.now()) throw new Error('IMPORT_EXPIRED'); return this.staged.preview; }
  async commit(input: unknown) {
    const request = importCommitSchema.parse(input), user = this.authorize();
    const preview = this.report(request.previewId), staged = this.staged!;
    if (this.busy || !preview.families || preview.issues.some(i => i.severity === 'error')) throw new Error('IMPORT_INVALID');
    this.store.security.reauthenticate(request.currentPassword, 'settings.change'); this.busy = true;
    try {
      // A configured, independently encrypted backup must succeed before any row changes.
      await this.backup.create(request.backupPassword); this.authorize();
      const db = this.store.security.db;
      const result = db.transaction(() => {
        for (const ward of staged.wards) db.prepare('INSERT INTO wards(id,code,name,name_ml,sort_order) VALUES(?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM wards))').run(ward.id, ward.code, ward.name, ward.nameMl);
        for (const family of staged.families) this.store.registration.save(family);
        const result = { families: staged.families.length, members: preview.members, wards: staged.wards.length };
        db.prepare('INSERT INTO import_batches(id,source_sha256,families,members,wards,staff_id) VALUES(?,?,?,?,?,?)').run(preview.previewId, staged.source.hash, result.families, result.members, result.wards, user.id);
        this.store.security.audit('import.committed', 'import', preview.previewId, 'success', `Imported ${result.families} families and ${result.members} members`);
        return result;
      }).immediate();
      this.staged = undefined; this.source = undefined; return result;
    } catch (error) { this.store.security.audit('import.failed', 'import', preview.previewId, 'failure', 'Import did not commit; original records preserved'); throw error; }
    finally { this.busy = false; }
  }
}
