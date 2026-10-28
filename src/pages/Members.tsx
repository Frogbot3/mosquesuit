import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserRound } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { calculateAge, type FamilyQuery, type MemberSummary } from '../../shared/registration';
import { PageHeading } from '../components/Primitives';
import { useWorkspace } from '../components/WorkspaceProvider';
import { BilingualName, RegistryFilters, RegistryPagination, RegistryState, RegistryTable } from '../components/registration/RegistryShared';
import { desktop, unwrap } from '../lib/api';
import { useRegistrationData } from '../lib/useRegistrationData';
import { useRegistrationText } from '../lib/registration-i18n';

export function Members() {
  const r = useRegistrationText(); const { snapshot } = useWorkspace();
  const [query, setQuery] = useState<FamilyQuery>({ search: '', wardId: '', page: 1, pageSize: 10 });
  const load = useCallback(() => unwrap(desktop().listMembers(query)), [query]); const result = useRegistrationData(load);
  const columns = useMemo<ColumnDef<MemberSummary>[]>(() => [
    { id: 'name', header: r('member'), cell: ({ row }) => <Link to={`/members/${row.original.id}`}><BilingualName name={row.original.name} nameMl={row.original.nameMl} /></Link> },
    { accessorKey: 'familyCode', header: r('familyId'), cell: ({ row }) => <Link className="text-link" to={`/families/${row.original.familyId}`}>{row.original.familyCode}</Link> },
    { accessorKey: 'wardName', header: r('wardId'), cell: ({ row }) => snapshot.settings.locale === 'ml' ? row.original.wardNameMl || row.original.wardName : row.original.wardName },
    { accessorKey: 'relationship', header: r('relationship'), cell: ({ row }) => r(row.original.relationship) },
    { accessorKey: 'gender', header: r('gender'), cell: ({ row }) => r(row.original.gender) },
    { id: 'age', header: r('age'), cell: ({ row }) => calculateAge(row.original.dob) ?? r('notRecorded') },
    { accessorKey: 'phone', header: r('phoneLabel'), cell: info => String(info.getValue() || '—') },
    { id: 'actions', header: r('actions'), cell: ({ row }) => <div className="row-actions"><Link className="text-link" to={`/members/${row.original.id}`}>{r('view')}</Link><Link className="text-link" to={`/families/${row.original.familyId}/edit?member=${row.original.id}`}>{r('edit')}</Link></div> },
  ], [r, snapshot.settings.locale]);
  return <><PageHeading title={r('memberDirectory')} description={r('memberDirectorySub')} action={<Link to="/families" className="button secondary"><Users size={18} />{r('families')}</Link>} />
    <section className="panel directory-panel"><RegistryFilters query={query} onChange={setQuery} kind="members" /><RegistryState error={result.error} loading={result.loading} retry={result.retry} />
      {result.data && !result.error && <><RegistryTable rows={result.data.items} columns={columns} caption={r('members')} />{!result.data.total && !result.loading && <div className="empty-state"><UserRound size={34} /><h2>{r(query.search || query.wardId ? 'noMatches' : 'noMembers')}</h2><p>{r('noFamiliesHelp')}</p><Link className="button primary" to="/families">{r('families')}</Link></div>}<RegistryPagination result={result.data} onPage={page => setQuery({ ...query, page })} /></>}
    </section></>;
}
