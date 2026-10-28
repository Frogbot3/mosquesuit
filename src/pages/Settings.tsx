import { useEffect, useState } from 'react';
import { Link,useBlocker, useBeforeUnload } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Database, RotateCcw, Save } from 'lucide-react';
import { settingsSchema, type Settings as SettingsValues } from '../../shared/contracts';
import { useWorkspace } from '../components/WorkspaceProvider';
import { PageHeading } from '../components/Primitives';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ApiError, desktop, unwrap } from '../lib/api';
import { financeText } from '../../shared/finance-labels';

export function SettingsPage() {
  const { snapshot, save, refresh, t, notify, setDirty } = useWorkspace();
  const { register, handleSubmit, reset, formState: { errors, isDirty, isSubmitting } } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema), defaultValues: snapshot.settings,
  });
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [healthy, setHealthy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => { reset(snapshot.settings); }, [snapshot.settings, reset]);
  useEffect(() => { setDirty(isDirty); return () => setDirty(false); }, [isDirty, setDirty]);
  useBeforeUnload(event => { if (isDirty) { event.preventDefault(); event.returnValue = ''; } });

  async function submit(values: SettingsValues) {
    setError(null);
    try { await save(values); notify(t('saved')); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : t('unexpected')); }
  }
  async function checkStorage() {
    setChecking(true); setHealthy(false);
    try { await unwrap(desktop().checkStorage()); setHealthy(true); }
    catch { notify(t('errorTitle'), true); }
    finally { setChecking(false); }
  }
  async function resetDemo() {
    setResetting(true);
    try { await unwrap(desktop().resetDemo({ confirmation: 'RESET DEMO' })); await refresh(); setShowReset(false); notify(t('resetDone')); }
    catch { notify(t('errorTitle'), true); }
    finally { setResetting(false); }
  }
  return <>
    <PageHeading title={t('settingsHeading')} description={t('settingsSub')} />
    {snapshot.financeDemo&&<p className="life-links"><Link className="button secondary" to="/finance/settings">{financeText(snapshot.settings.locale,'financeSettings')} · {financeText(snapshot.settings.locale,'logo')}</Link></p>}
    <div className="settings-layout"><form onSubmit={handleSubmit(submit)} className="panel settings-form" noValidate>
      <section><h2>{t('profile')}</h2><p className="muted section-description">{t('profileHelp')}</p>
        <div className="form-grid"><div className="field"><label htmlFor="name">{t('name')} <span className="required">*</span></label><input id="name" autoComplete="organization" maxLength={120} aria-required="true" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} {...register('name')} />{errors.name && <span id="name-error" className="field-error" role="alert">{errors.name.message}</span>}</div>
          <div className="field"><label htmlFor="nameMl">{t('nameMl')} <span className="optional">{t('optional')}</span></label><input id="nameMl" lang="ml" maxLength={120} aria-invalid={Boolean(errors.nameMl)} aria-describedby={errors.nameMl ? 'name-ml-error' : undefined} {...register('nameMl')} />{errors.nameMl && <span id="name-ml-error" className="field-error" role="alert">{errors.nameMl.message}</span>}</div>
          <div className="field full"><label htmlFor="address">{t('address')} <span className="optional">{t('optional')}</span></label><textarea id="address" rows={3} maxLength={400} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'address-error' : undefined} {...register('address')} />{errors.address && <span id="address-error" className="field-error" role="alert">{errors.address.message}</span>}</div>
          <div className="field"><label htmlFor="contact">{t('contact')} <span className="optional">{t('optional')}</span></label><input id="contact" type="tel" autoComplete="tel" maxLength={40} aria-invalid={Boolean(errors.contact)} aria-describedby={errors.contact ? 'contact-error' : undefined} {...register('contact')} />{errors.contact && <span id="contact-error" className="field-error" role="alert">{errors.contact.message}</span>}</div>
        </div>
      </section>
      <section className="preferences-section"><h2>{t('preferences')}</h2><div className="form-grid"><div className="field"><label htmlFor="locale">{t('language')}</label><select id="locale" {...register('locale')}><option value="en">English</option><option value="ml">മലയാളം</option></select></div><div className="field"><label htmlFor="theme">{t('appearance')}</label><select id="theme" {...register('theme')}><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option><option value="system">{t('system')}</option></select></div></div></section>
      {error && <div className="form-error" role="alert"><p>{error}</p><button type="button" className="text-link" onClick={() => { reset(snapshot.settings); setError(null); void refresh().catch(() => notify(t('errorTitle'), true)); }}>{t('reload')}</button></div>}
      <div className="form-actions"><span className="muted" aria-live="polite">{isDirty ? t('unsaved') : ''}</span><button type="button" className="button secondary" disabled={!isDirty || isSubmitting} onClick={() => { reset(snapshot.settings); setError(null); }}>{t('discard')}</button><button type="submit" className="button primary" disabled={!isDirty || isSubmitting}><Save size={18} />{t(isSubmitting ? 'saving' : 'save')}</button></div>
    </form>
      <aside className="settings-aside"><section className="panel"><Database className="panel-icon" /><h2>{t('storageHeading')}</h2><dl className="detail-list"><div><dt>{t('schema')}</dt><dd>{snapshot.schemaVersion}</dd></div><div><dt>{t('status')}</dt><dd className="connected">{t('connected')}</dd></div></dl><p className="muted">{t('storageSub')}</p><button className="button secondary wide" disabled={checking} onClick={() => void checkStorage()}>{t(checking ? 'checking' : 'checkStorage')}</button>{healthy && <div role="status" className="health-result"><strong><Check size={16} />{t('healthy')}</strong><p>{t('healthDetail')}</p></div>}<p className="storage-warning">{t('noBackup')}</p></section>
        {snapshot.canResetDemo && <section className="panel"><RotateCcw className="panel-icon" /><h2>{t('demoHeading')}</h2><p className="muted">{t('demoHelp')}</p><button className="button secondary wide" disabled={isSubmitting || isDirty} onClick={() => setShowReset(true)}>{t('reset')}</button></section>}
      </aside>
    </div>
    <ConfirmDialog open={showReset} title={t('resetTitle')} confirm={t('confirmReset')} cancel={t('cancel')} busy={resetting} onConfirm={() => void resetDemo()} onCancel={() => setShowReset(false)}>{t('resetDescription')}</ConfirmDialog>
    <ConfirmDialog open={blocker.state === 'blocked'} title={t('discardTitle')} confirm={t('leave')} cancel={t('stay')} onConfirm={() => { if (blocker.state === 'blocked') blocker.proceed(); }} onCancel={() => { if (blocker.state === 'blocked') blocker.reset(); }}>{t('discardDescription')}</ConfirmDialog>
  </>;
}
