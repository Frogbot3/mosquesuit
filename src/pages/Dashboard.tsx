import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Settings } from 'lucide-react';
import { PageHeading, Status } from '../components/Primitives';
import { useWorkspace } from '../components/WorkspaceProvider';
import { DashboardFinanceSummary } from '../components/finance/FinanceSummaries';

export function Dashboard() {
  const { snapshot, t, refresh, notify } = useWorkspace();
  useEffect(() => { void refresh().catch(() => notify(t('errorTitle'), true)); }, [refresh, notify, t]);
  return <>
    <PageHeading title={t('welcome')} description={t('welcomeSub')} action={<Link className="button primary" to="/settings"><Settings size={19} />{t('configure')}</Link>} />
    <dl className="metrics"><div><dt>{t('activeWards')}</dt><dd className="metric-number">{snapshot.wards.filter(ward => ward.active).length}</dd></div><div><dt>{t('familyRegistry')}</dt><dd><Link to="/families">{snapshot.registryCounts.families}</Link></dd></div><div><dt>{t('contributions')}</dt><dd>{snapshot.financeDemo?<Link to="/payments">{t('payments')}</Link>:t('notStarted')}</dd></div></dl>
    <div className="dashboard-columns">
      <section className="panel ward-panel"><div className="section-heading"><div><h2>{t('yourWards')}</h2><p>{t('wardsSub')}</p></div><Link to="/wards" className="text-link">{t('viewAll')}</Link></div>
        <ul className="ward-list">{snapshot.wards.map(ward => <li key={ward.id}><span className="ward-code">{ward.code}</span><div className="ward-names"><strong>{ward.name}</strong><span lang="ml">{ward.nameMl}</span></div><Status active={ward.active} /></li>)}</ul>
      </section>
      <section className="panel setup-panel"><h2>{t('makeYours')}</h2><p>{t('makeYoursSub')}</p><Link to="/settings" className="button primary wide"><Settings size={19} />{t('openSettings')}</Link><div className="storage-summary"><div><h3>{t('localStorage')}</h3><span className="connected"><span className="dot" />{t('connected')}</span></div><p>{t('storageSub')}</p></div></section>
    </div>
    <section className="panel roadmap"><h2>{t('carefulSteps')}</h2><ol>{(['foundation', 'registry', 'records'] as const).map((step, index) => <li key={step}><span className={`step-number ${index < 2 ? 'current' : ''}`}>0{index + 1}</span><strong>{t(step)}</strong><span className={index < 2 ? 'connected' : 'muted'}><span className="dot" />{t(index < 2 ? 'active' : 'later')}</span></li>)}</ol></section>
    {snapshot.financeDemo&&<DashboardFinanceSummary/>}
  </>;
}
