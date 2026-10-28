import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeading } from '../components/Primitives';
import { useWorkspace } from '../components/WorkspaceProvider';
import type { AuditEvent } from '../../shared/contracts';
import type { TranslationKey } from '../lib/i18n';

const eventLabels: Record<AuditEvent['kind'], TranslationKey> = { 'workspace.created': 'created', 'settings.updated': 'updated', 'demo.reset': 'demoReset' };
export function Activity() {
  const { snapshot, refresh, t, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  useEffect(() => { void refresh().catch(() => notify(t('errorTitle'), true)); }, [refresh, notify, t]);
  async function reload() { setBusy(true); try { await refresh(); } catch { notify(t('errorTitle'), true); } finally { setBusy(false); } }
  const formatter = new Intl.DateTimeFormat(snapshot.settings.locale === 'ml' ? 'ml-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  return <><PageHeading title={t('activityHeading')} description={t('activitySub')} action={<button className="button secondary" disabled={busy} onClick={() => void reload()}><RefreshCw size={18} />{t('refresh')}</button>} />
    <section className="panel directory-panel"><div className="table-scroll"><table><caption className="sr-only">{t('activity')}</caption><thead><tr><th scope="col">{t('event')}</th><th scope="col">{t('when')} (IST)</th><th scope="col">{t('actor')}</th></tr></thead><tbody>{snapshot.activity.map(event => <tr key={event.id}><td><strong>{t(eventLabels[event.kind])}</strong><small className="event-number">#{event.id}</small></td><td><time dateTime={event.createdAt}>{formatter.format(new Date(event.createdAt))}</time></td><td className="muted">{t('localPreview')}</td></tr>)}</tbody></table></div>{snapshot.activity.length === 0 && <div className="empty-state">{t('noActivity')}</div>}</section>
  </>;
}
