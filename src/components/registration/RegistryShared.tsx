import { useId, type ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { FamilyQuery, PageResult } from '../../../shared/registration';
import { useWorkspace } from '../WorkspaceProvider';
import { isRegistrationKey, useRegistrationText } from '../../lib/registration-i18n';

export function RegistryState({ error, retry, loading }: { error: string | null; retry: () => void; loading: boolean }) {
  const r = useRegistrationText();
  if (error) return <div className="panel empty-state" role="alert"><AlertCircle /><p>{r(isRegistrationKey(error) ? error : 'error')}</p><button className="button secondary" onClick={retry}>{r('retry')}</button></div>;
  if (loading) return <p className="registry-loading" role="status">{r('loading')}</p>;
  return null;
}
export function BilingualName({ name, nameMl }: { name: string; nameMl: string }) {
  const { snapshot } = useWorkspace();
  const primary = snapshot.settings.locale === 'ml' ? nameMl || name : name || nameMl;
  const secondary = name && nameMl ? snapshot.settings.locale === 'ml' ? name : nameMl : '';
  return <span className="bilingual-name"><strong lang={primary === nameMl ? 'ml' : 'en'}>{primary || '—'}</strong>{secondary && <small lang={secondary === nameMl ? 'ml' : 'en'}>{secondary}</small>}</span>;
}
export function RegistrationStatus({ status }: { status: 'draft' | 'registered' }) {
  const r = useRegistrationText();
  return <span className={`status registration-${status}`}>{r(status)}</span>;
}
export function RegistryTable<T>({ rows, columns, caption }: { rows: T[]; columns: ColumnDef<T>[]; caption: string }) {
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  return <div className="table-scroll"><table className="registry-table"><caption className="sr-only">{caption}</caption><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>;
}
export function RegistryFilters({ query, onChange, kind }: { query: FamilyQuery; onChange: (query: FamilyQuery) => void; kind: 'families' | 'members' }) {
  const { snapshot } = useWorkspace(); const r = useRegistrationText(); const id = useId();
  return <div className="registry-filters"><label className="search-field"><Search size={19} /><span className="sr-only">{r(kind === 'families' ? 'searchFamilies' : 'searchMembers')}</span><input type="search" maxLength={100} value={query.search} placeholder={r(kind === 'families' ? 'searchFamiliesHint' : 'searchMembersHint')} onChange={event => onChange({ ...query, search: event.target.value, page: 1 })} /></label>
    <div className="filter-field"><label htmlFor={`${id}-ward`}>{r('wardId')}</label><select id={`${id}-ward`} value={query.wardId} onChange={event => onChange({ ...query, wardId: event.target.value, page: 1 })}><option value="">{r('allWards')}</option>{snapshot.wards.map(ward => <option key={ward.id} value={ward.id}>{snapshot.settings.locale === 'ml' ? ward.nameMl || ward.name : ward.name}</option>)}</select></div>
    <div className="filter-field"><label htmlFor={`${id}-size`}>{r('perPage')}</label><select id={`${id}-size`} value={query.pageSize} onChange={event => onChange({ ...query, pageSize: Number(event.target.value) as 10 | 25 | 50, page: 1 })}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select></div>
  </div>;
}
export function RegistryPagination({ result, onPage }: { result: Pick<PageResult<unknown>, 'page' | 'pageSize' | 'total'>; onPage: (page: number) => void }) {
  const r = useRegistrationText();
  return <div className="registry-pagination"><span role="status">{r('showing')} {result.total ? (result.page - 1) * result.pageSize + 1 : 0}–{Math.min(result.page * result.pageSize, result.total)} {r('of')} {result.total}</span><div><button className="button secondary" disabled={result.page <= 1} onClick={() => onPage(result.page - 1)}><ChevronLeft size={17} />{r('previous')}</button><button className="button secondary" disabled={result.page * result.pageSize >= result.total} onClick={() => onPage(result.page + 1)}>{r('next')}<ChevronRight size={17} /></button></div></div>;
}
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  const r = useRegistrationText();
  return <div><dt>{label}</dt><dd>{children || <span className="muted">{r('notRecorded')}</span>}</dd></div>;
}
