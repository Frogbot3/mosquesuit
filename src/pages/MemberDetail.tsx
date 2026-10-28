import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { calculateAge } from '../../shared/registration';
import { useWorkspace } from '../components/WorkspaceProvider';
import { PageHeading } from '../components/Primitives';
import { BilingualName, Detail, RegistryState } from '../components/registration/RegistryShared';
import { desktop, unwrap } from '../lib/api';
import { useRegistrationData } from '../lib/useRegistrationData';
import { useRegistrationText } from '../lib/registration-i18n';

export function MemberDetail() {
  const { id = '' } = useParams(); const r = useRegistrationText(); const { snapshot } = useWorkspace();
  const load = useCallback(() => unwrap(desktop().getMember({ id })), [id]); const result = useRegistrationData(load);
  if (result.loading || !result.data || result.data.id !== id) return <RegistryState error={result.error} loading={result.loading} retry={result.retry} />;
  const member = result.data; const age = calculateAge(member.dob);
  const name = snapshot.settings.locale === 'ml' ? member.nameMl || member.name : member.name || member.nameMl;
  return <><Link className="back-link" to={`/families/${member.familyId}`}><ArrowLeft size={17} />{r('viewFamily')} · {member.familyCode}</Link>
    <PageHeading title={name} description={`${r('memberDetails')} · ${member.familyCode}`} action={!member.archivedAt && <Link className="button primary" to={`/families/${member.familyId}/edit?member=${member.id}`}><Pencil size={18} />{r('editMember')}</Link>} />
    <section className="panel"><div className="section-heading"><h2>{r('personalDetails')}</h2><span className="status">{r(member.archivedAt ? 'removed' : member.lifeStatus)}</span></div><dl className="profile-details">
      <Detail label={r('member')}><BilingualName name={member.name} nameMl={member.nameMl} /></Detail><Detail label={r('familyId')}><Link to={`/families/${member.familyId}`} className="text-link">{member.familyCode}</Link></Detail>
      <Detail label={r('relationship')}>{r(member.relationship)}</Detail><Detail label={r('gender')}>{r(member.gender)}</Detail><Detail label={r('dob')}>{member.dob}</Detail><Detail label={r('age')}>{age === null ? r('unknownAge') : `${age} ${r('years')}`}</Detail>
      <Detail label={r('fatherName')}>{member.fatherName}</Detail><Detail label={r('motherName')}>{member.motherName}</Detail><Detail label={r('maritalStatus')}>{r(member.maritalStatus)}</Detail>
      <Detail label={r('education')}>{member.education}</Detail><Detail label={r('occupation')}>{member.occupation}</Detail><Detail label={r('bloodGroup')}>{member.bloodGroup && member.bloodGroup !== 'unknown' ? member.bloodGroup : r('notRecorded')}</Detail>
      <Detail label={r('phone')}>{member.phone}</Detail><Detail label={r('remarks')}>{member.remarks}</Detail>
    </dl><p className="record-id">{r('recordId')}: <code>{member.id}</code></p></section>
  </>;
}
