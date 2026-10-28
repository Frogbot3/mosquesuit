import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { FamilyQuery, FamilySummary } from '../../shared/registration';
import { desktop, unwrap } from '../lib/api';
import { useRegistrationData } from '../lib/useRegistrationData';
import { useRegistrationText } from '../lib/registration-i18n';
import { PageHeading } from '../components/Primitives';
import { useWorkspace } from '../components/WorkspaceProvider';
import { useLifeText } from '../components/life-events/LifeShared';
import { BilingualName, RegistrationStatus, RegistryFilters, RegistryPagination, RegistryState, RegistryTable } from '../components/registration/RegistryShared';

export function Families() {
  const r = useRegistrationText(); const { snapshot } = useWorkspace(); const life=useLifeText();
  const [query, setQuery] = useState<FamilyQuery>({ search: '', wardId: '', page: 1, pageSize: 10 });
  const load = useCallback(() => unwrap(desktop().listFamilies(query)), [query]);
  const result = useRegistrationData(load);
  const columns = useMemo<ColumnDef<FamilySummary>[]>(() => [
    { accessorKey: 'familyCode', header: r('familyId'), cell: ({ row }) => <Link className="text-link" to={`/families/${row.original.id}`}>{row.original.familyCode}</Link> },
    { accessorKey: 'wardName', header: r('wardId'), cell: ({ row }) => snapshot.settings.locale === 'ml' ? row.original.wardNameMl || row.original.wardName : row.original.wardName },
    { accessorKey: 'houseNumber', header: r('houseNumber'), cell: info => String(info.getValue() || '—') },
    { id: 'house', header: r('house'), cell: ({ row }) => <BilingualName name={row.original.houseName} nameMl={row.original.houseNameMl} /> },
    { id: 'guardian', header: r('guardian'), cell: ({ row }) => <BilingualName name={row.original.guardianName} nameMl={row.original.guardianNameMl} /> },
    { accessorKey: 'phone', header: r('phoneLabel'), cell: info => <span className="nowrap">{String(info.getValue() || '—')}</span> },
    { accessorKey: 'livingMembers', header: r('livingMembers') },
    { accessorKey: 'status', header: r('status'), cell: ({ row }) => <><RegistrationStatus status={row.original.status} />{row.original.needsGuardian&&<p className="field-error">{life('guardianWarning')}</p>}</> },
    { id: 'actions', header: r('actions'), cell: ({ row }) => <div className="row-actions"><Link className="text-link" aria-label={`${r('view')} ${row.original.familyCode}`} to={`/families/${row.original.id}`}>{r('view')}</Link><Link className="text-link" aria-label={`${r('edit')} ${row.original.familyCode}`} to={`/families/${row.original.id}/edit`}>{r('edit')}</Link></div> },
  ], [r, life, snapshot.settings.locale]);
  const filtered = Boolean(query.search || query.wardId);
  return <><PageHeading title={r('familyDirectory')} description={r('familyDirectorySub')} action={<Link className="button primary" to="/families/new"><Plus size={19} />{r('addFamily')}</Link>} />
    <section className="panel directory-panel"><RegistryFilters query={query} onChange={setQuery} kind="families" /><RegistryState error={result.error} loading={result.loading} retry={result.retry} />
      {result.data && !result.error && <><RegistryTable rows={result.data.items} columns={columns} caption={r('families')} />
        {!result.data.total && !result.loading && <div className="empty-state"><Users size={34} /><h2>{r(filtered ? 'noMatches' : 'noFamilies')}</h2><p>{r(filtered ? 'noMatchesHelp' : 'noFamiliesHelp')}</p>{filtered ? <button className="button secondary" onClick={() => setQuery({ ...query, search: '', wardId: '', page: 1 })}>{r('clearFilters')}</button> : <Link className="button primary" to="/families/new">{r('addFamily')}</Link>}</div>}
        <RegistryPagination result={result.data} onPage={page => setQuery({ ...query, page })} />
      </>}
    </section></>;
}
