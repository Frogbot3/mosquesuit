import { useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, getFilteredRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Search, MapPin } from 'lucide-react';
import type { Ward } from '../../shared/contracts';
import { useWorkspace } from '../components/WorkspaceProvider';
import { PageHeading, Status } from '../components/Primitives';

export function Wards() {
  const { snapshot, t } = useWorkspace();
  const [search, setSearch] = useState('');
  const columns = useMemo<ColumnDef<Ward>[]>(() => [
    { accessorKey: 'code', header: t('code'), cell: info => <span className="ward-code compact">{String(info.getValue())}</span> },
    { accessorKey: 'name', header: t('ward'), cell: info => <strong>{String(info.getValue())}</strong> },
    { accessorKey: 'nameMl', header: t('malayalamName'), cell: info => <span lang="ml">{String(info.getValue())}</span> },
    { accessorKey: 'active', header: t('status'), enableGlobalFilter: false, cell: info => <Status active={Boolean(info.getValue())} /> },
  ], [t]);
  const table = useReactTable({ data: snapshot.wards, columns, state: { globalFilter: search }, onGlobalFilterChange: setSearch, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), globalFilterFn: 'includesString' });
  return <><PageHeading title={t('wardHeading')} description={t('wardDescription')} />
    <section className="panel directory-panel"><div className="directory-toolbar"><label className="search-field"><Search size={20} /><span className="sr-only">{t('searchWards')}</span><input type="search" placeholder={t('searchWards')} value={search} onChange={event => setSearch(event.target.value)} /></label><span className="muted" role="status">{table.getRowModel().rows.length} {t('wardsFound')}</span></div>
      <div className="table-scroll"><table><caption className="sr-only">{t('wards')}</caption><thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div>
      {table.getRowModel().rows.length === 0 && <div className="empty-state"><MapPin size={32} /><h2>{t('noWards')}</h2><p>{t('trySearch')}</p><button className="button secondary" onClick={() => setSearch('')}>{t('clearSearch')}</button></div>}
    </section></>;
}
