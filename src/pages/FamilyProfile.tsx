import { integrationText } from '../../shared/integration-labels';
import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Printer, ShieldCheck } from 'lucide-react';
import { calculateAge, type HistoryAction } from '../../shared/registration';
import { useWorkspace } from '../components/WorkspaceProvider';
import { PageHeading } from '../components/Primitives';
import { BilingualName, Detail, RegistrationStatus, RegistryState } from '../components/registration/RegistryShared';
import { desktop, unwrap } from '../lib/api';
import { isRegistrationKey, useRegistrationText, type RegistrationKey } from '../lib/registration-i18n';
import { useRegistrationData } from '../lib/useRegistrationData';
import { TransferHistoryPanel,useLifeText } from '../components/life-events/LifeShared';
import { FamilyFinanceSummary } from '../components/finance/FinanceSummaries';

const historyLabels: Record<HistoryAction, RegistrationKey> = {
  'family.created': 'familyCreated', 'family.updated': 'familyUpdated', 'guardian.changed': 'guardianChanged',
  'member.added': 'memberAdded', 'member.updated': 'memberUpdated', 'member.removed': 'memberRemoved',
};
export function FamilyProfilePage() {
  const { id = '' } = useParams(); const r = useRegistrationText(); const { snapshot } = useWorkspace(); const life=useLifeText();
  const load = useCallback(() => unwrap(desktop().getFamily({ id })), [id]); const result = useRegistrationData(load);
  if (result.loading || !result.data || result.data.id !== id) return <RegistryState error={result.error} loading={result.loading} retry={result.retry} />;
  const family = result.data; const guardian = family.members.find(member => member.id === family.guardianMemberId)!;
  const current = family.members.filter(member => !member.archivedAt); const removed = family.members.filter(member => member.archivedAt);
  const locale = snapshot.settings.locale === 'ml' ? 'ml-IN' : 'en-IN';
  const date = (value: string) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : r('notRecorded');
  const time = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
  const title = snapshot.settings.locale === 'ml' ? family.houseNameMl || family.houseName : family.houseName || family.houseNameMl;
  return <>{snapshot.integrationsDemo&&<div className="life-actions"><Link className="button secondary" to={`/integrations/consent?family=${id}`}>{integrationText(snapshot.settings.locale,'consents')}</Link><Link className="button secondary" to={`/integrations/payments?family=${id}`}>{integrationText(snapshot.settings.locale,'onlinePayments')}</Link></div>}
    <Link className="back-link" to="/families"><ArrowLeft size={17} />{r('backFamilies')}</Link>
    <PageHeading title={title || `${r('familyProfile')} ${family.familyCode}`} description={`${family.familyCode} · ${snapshot.settings.locale === 'ml' ? family.wardNameMl || family.wardName : family.wardName}`} action={<Link className="button primary" to={`/families/${id}/edit`}><Pencil size={18} />{r('editFamily')}</Link>} />
    <section className="panel profile-overview"><div className="section-heading"><h2>{r('familyDetails')}</h2><RegistrationStatus status={family.status} /></div>
      {family.needsGuardian&&<p className="form-error" role="alert">{life('guardianWarning')}</p>}
      <dl className="profile-details">
        <Detail label={r('familyId')}>{family.familyCode}</Detail><Detail label={r('houseNumber')}>{family.houseNumber}</Detail>
        <Detail label={r('houseName')}>{family.houseName}</Detail><Detail label={r('houseNameMl')}><span lang="ml">{family.houseNameMl || r('notRecorded')}</span></Detail>
        <Detail label={r('guardian')}><BilingualName name={guardian.name} nameMl={guardian.nameMl} /></Detail><Detail label={r('phone')}>{guardian.phone}</Detail>
        <Detail label={r('address')}>{family.address}</Detail><Detail label={r('locality')}>{family.locality}</Detail><Detail label={r('postalCode')}>{family.postalCode}</Detail>
        <Detail label={r('email')}>{family.email}</Detail><Detail label={r('registrationDate')}>{date(family.registrationDate)}</Detail>
      </dl>{family.notes && <div className="profile-notes"><h3>{r('notes')}</h3><p>{family.notes}</p></div>}
      <p className="record-id">{r('recordId')}: <code>{family.id}</code></p>
    </section>
    <dl className="metrics family-metrics" aria-label={r('householdSummary')}><div><dt>{r('livingMembers')}</dt><dd className="metric-number">{family.totals.living}</dd></div><div><dt>{r('maleMembers')}</dt><dd>{family.totals.male}</dd></div><div><dt>{r('femaleMembers')}</dt><dd>{family.totals.female}</dd></div><div><dt>{r('otherUnknown')}</dt><dd>{family.totals.other + family.totals.unknown}</dd></div></dl>
    <section className="panel directory-panel"><div className="profile-section-heading"><h2>{r('householdMembers')}</h2><span className="muted">{r('deceased')}: {family.totals.deceased}</span></div>
      <div className="table-scroll"><table><caption className="sr-only">{r('householdMembers')}</caption><thead><tr>{['member', 'relationship', 'gender', 'dob', 'age', 'phoneLabel', 'actions'].map(key => <th key={key} scope="col">{r(key as RegistrationKey)}</th>)}</tr></thead><tbody>{current.map(member => <tr key={member.id}><td><div className="member-name-cell"><BilingualName name={member.name} nameMl={member.nameMl} />{member.id === family.guardianMemberId && <span className="guardian-label"><ShieldCheck size={15} />{r('guardian')}</span>}{member.lifeStatus === 'deceased' && <span className="muted">{r('deceased')}</span>}</div></td><td>{r(member.relationship)}</td><td>{r(member.gender)}</td><td>{date(member.dob)}</td><td>{calculateAge(member.dob) ?? '—'}</td><td className="nowrap">{member.phone || '—'}</td><td><div className="row-actions"><Link className="text-link" to={`/members/${member.id}`}>{r('view')}</Link><Link className="text-link" to={`/families/${id}/edit?member=${member.id}`}>{r('edit')}</Link></div></td></tr>)}</tbody></table></div>
    </section>
    {removed.length > 0 && <details className="panel removed-records"><summary>{r('removedMembers')} ({removed.length})</summary><ul>{removed.map(member => <li key={member.id}><Link className="text-link" to={`/members/${member.id}`}>{member.name || member.nameMl}</Link><span className="muted">{date(member.archivedAt!)}</span></li>)}</ul></details>}
    <section className="panel profile-history"><h2>{r('registrationHistory')}</h2><p className="muted section-description">{r('historyHelp')}</p><ol className="history-list">{family.history.map(event => <li key={event.id}><div><strong>{r(historyLabels[event.action])}</strong>{event.memberId && <Link to={`/members/${event.memberId}`} className="history-member">{event.memberName || event.memberNameMl}</Link>}{event.fields.length > 0 && <p className="field-help">{r('changedFields')}: {event.fields.map(field => isRegistrationKey(field) ? r(field) : field).join(', ')}</p>}</div><time dateTime={event.createdAt}>{time(event.createdAt)} IST</time></li>)}</ol></section>
    <section className="panel profile-history"><h2>{r('assignmentHistory')}</h2><div className="table-scroll"><table><caption className="sr-only">{r('assignmentHistory')}</caption><thead><tr>{['wardId', 'familyNumber', 'houseNumber', 'from', 'until'].map(key => <th key={key} scope="col">{r(key as RegistrationKey)}</th>)}</tr></thead><tbody>{family.assignments.map(assignment => <tr key={assignment.id}><td>{snapshot.settings.locale === 'ml' ? assignment.wardNameMl || assignment.wardName : assignment.wardName}</td><td>{assignment.familyNumber}</td><td>{assignment.houseNumber || '—'}</td><td>{time(assignment.startedAt)}</td><td>{assignment.endedAt ? time(assignment.endedAt) : r('current')}</td></tr>)}</tbody></table></div></section>
    {snapshot.lifeEventsDemo&&<><p className="life-links"><Link className="text-link" to="/household-transfer">{life('transfer')}</Link></p><TransferHistoryPanel familyId={family.id}/></>}
    {snapshot.financeDemo&&<FamilyFinanceSummary id={family.id}/>}
    <div className="planned-print"><Printer size={19} /><div><strong>{r('printFamily')} · {r('planned')}</strong><p>{r('printHelp')}</p></div></div>
  </>;
}
