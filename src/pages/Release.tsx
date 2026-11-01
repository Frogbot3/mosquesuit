import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../components/WorkspaceProvider';
import { useSecurity } from '../components/SecurityProvider';
import { PageHeading } from '../components/Primitives';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useUnsavedRegistration } from '../lib/useUnsavedRegistration';
import { useRegistrationData } from '../lib/useRegistrationData';
import { desktop, unwrap } from '../lib/api';
import { releaseText } from '../../shared/release-labels';
import { mosqueSetupSchema, type DeploymentSettings, type MosqueSetup, type ReleaseState } from '../../shared/release';

export function MosqueSetupPage() {
  const { snapshot } = useWorkspace(), t = (k: string) => releaseText(snapshot.settings.locale, k);
  const load = useCallback(() => unwrap(desktop().getDeploymentSettings()), []), result = useRegistrationData(load);
  if (!result.data) return <section className="panel"><h1>{t('setup')}</h1><p role={result.error ? 'alert' : 'status'}>{t(result.error ? 'error' : 'loading')}</p>{result.error && <button className="button secondary" onClick={result.retry}>{t('retry')}</button>}</section>;
  return <SetupForm initial={result.data} />;
}
function SetupForm({ initial }: { initial: DeploymentSettings }) {
  const { snapshot, refresh, notify } = useWorkspace(), navigate = useNavigate(), t = (k: string) => releaseText(snapshot.settings.locale, k);
  const [form, setForm] = useState<MosqueSetup>({ revision: initial.revision, name: initial.mosque.name, nameMl: initial.mosque.nameMl, address: initial.mosque.address, contact: initial.mosque.contact, email: initial.email, locale: initial.mosque.locale, receiptPrefix: initial.receiptPrefix, financialYearStart: initial.financialYearStart, wards: initial.wards, currentPassword: '', confirmed: true });
  const [reviewed, setReviewed] = useState(false), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [logo, setLogo] = useState(initial.logo);
  const { blocker, allowNavigation } = useUnsavedRegistration(dirty || busy);
  const change = <K extends keyof MosqueSetup>(key: K, value: MosqueSetup[K]) => { setForm(old => ({ ...old, [key]: value })); setDirty(true); };
  async function chooseLogo(remove: boolean) {
    setBusy(true); setError('');
    try { setLogo(await unwrap(desktop().chooseDeploymentLogo({ remove }))); const state = await unwrap(desktop().getDeploymentSettings()); setForm(old => ({ ...old, revision: state.revision })); }
    catch { setError(t('error')); } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); if (!reviewed || !mosqueSetupSchema.safeParse(form).success) { setError(t('validation')); return; }
    setBusy(true);
    try { const saved = await unwrap(desktop().saveDeploymentSettings(form)); setForm(old => ({ ...old, revision: saved.revision, wards: saved.wards, currentPassword: '' })); setReviewed(false); setDirty(false); await refresh(); allowNavigation(); notify(t('saved')); navigate('/'); }
    catch { setError(t('error')); } finally { setBusy(false); }
  }
  return <><PageHeading title={t('setup')} description={t('setupHelp')} /><section className="panel release-panel"><div className="life-actions">{logo && <img className="setup-logo" src={logo} alt="" />}<button className="button secondary" disabled={busy} onClick={() => void chooseLogo(false)}>{t('chooseLogo')}</button><button className="button secondary" disabled={busy || !logo} onClick={() => void chooseLogo(true)}>{t('removeLogo')}</button></div><p className="field-help">{t('logoHelp')}</p>
    <form onSubmit={event => void save(event)}><fieldset disabled={busy}><div className="release-grid">{(['name','nameMl','address','contact','email','receiptPrefix'] as const).map(key => <label className="field" key={key}>{t(key)}<input value={form[key]} maxLength={key === 'address' ? 400 : key === 'receiptPrefix' ? 12 : 120} required={['name','address','contact','receiptPrefix'].includes(key)} type={key === 'email' ? 'email' : 'text'} onChange={e => change(key, e.target.value)} /></label>)}<label className="field">{t('financialYearStart')}<input type="number" min="1" max="12" value={form.financialYearStart} onChange={e => change('financialYearStart', Number(e.target.value))} /></label><label className="field">{t('locale')}<select value={form.locale} onChange={e => change('locale', e.target.value as 'en' | 'ml')}><option value="en">English</option><option value="ml">മലയാളം</option></select></label></div><p>INR (₹)</p>
    <h2>{t('wards')}</h2><div className="release-wards">{form.wards.map((ward, i) => <div className="release-grid ward-config" key={ward.id || `new-${i}`}>{(['code','name','nameMl'] as const).map(key => <label className="field" key={key}>{t(key === 'name' ? 'wardName' : key === 'nameMl' ? 'wardNameMl' : 'code')} {i + 1}<input value={ward[key]} maxLength={key === 'code' ? 24 : 120} required={key !== 'nameMl'} onChange={e => change('wards', form.wards.map((w, n) => n === i ? { ...w, [key]: e.target.value } : w))} /></label>)}<label className="checkbox-label"><input type="checkbox" checked={ward.active} onChange={e => change('wards', form.wards.map((w, n) => n === i ? { ...w, active: e.target.checked } : w))} />{t('active')}</label></div>)}</div><button className="button secondary" type="button" disabled={form.wards.length >= 100} onClick={() => change('wards', [...form.wards, { id: '', code: '', name: '', nameMl: '', active: true }])}>{t('addWard')}</button>
    <label className="field">{t('currentPassword')}<input type="password" autoComplete="current-password" required value={form.currentPassword} onChange={e => change('currentPassword', e.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={reviewed} required onChange={e => setReviewed(e.target.checked)} />{t('confirmed')}</label>{error && <p role="alert" className="form-error">{error}</p>}<button className="button primary" type="submit" disabled={!reviewed}>{t('save')}</button></fieldset></form></section>
    <ConfirmDialog children={t('leave')} open={blocker.state === 'blocked'} title={t('leave')} confirm={t('discard')} cancel={t('keep')} busy={busy} onConfirm={() => blocker.proceed?.()} onCancel={() => blocker.reset?.()} />
  </>;
}
export function AboutPage() {
  const { snapshot, notify } = useWorkspace(), { can, state: security } = useSecurity(), t = (k: string) => releaseText(snapshot.settings.locale, k);
  const [changed, setChanged] = useState<ReleaseState | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(() => unwrap(desktop().getReleaseState()), []), result = useRegistrationData(load), state = changed ?? result.data;
  async function action(kind: 'check' | 'activate' | 'diagnostics') { setBusy(true); try { if (kind === 'diagnostics') await unwrap(desktop().exportDiagnostics()); else setChanged(await unwrap(kind === 'check' ? desktop().checkForUpdates() : desktop().activateOfflineLicense())); } catch { notify(t('error'), true); } finally { setBusy(false); } }
  return <><PageHeading title={t('about')} description={t('releaseHelp')} /><section className="panel release-panel">{state ? <><dl className="profile-details">{(['version','schemaVersion','edition','licenseStatus','updateStatus','availableVersion','lastCheck','publisher','supportEmail'] as const).map(key => <div key={key}><dt>{t(key === 'schemaVersion' ? 'schema' : key)}</dt><dd>{state[key] ? ['licenseStatus','updateStatus'].includes(key) ? t(String(state[key])) : String(state[key]) : t('pending')}</dd></div>)}</dl><h2>{t('releaseNotes')}</h2><p>{state.releaseNotes}</p></> : <p role={result.error ? 'alert' : 'status'}>{t(result.error ? 'error' : 'loading')}</p>}<div className="life-actions">{can('settings.change') && security.user?.allWards && <><button className="button primary" disabled={busy} onClick={() => void action('check')}>{t('check')}</button><button className="button secondary" disabled={busy} onClick={() => void action('activate')}>{t('activate')}</button></>}{can('data.export') && can('audit.view') && security.user?.allWards && <button className="button secondary" disabled={busy} onClick={() => void action('diagnostics')}>{t('diagnostics')}</button>}</div><p className="field-help">{t('diagnosticHelp')}</p></section></>;
}
