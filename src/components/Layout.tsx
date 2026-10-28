import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Building2, House, MapPin, Users, UserRound, HeartHandshake, FileText, CalendarDays, WalletCards, Coins, ChartNoAxesCombined, Bell, Files, ArrowDownUp, Database, UserRoundCog, Settings, History, AlertCircle, Globe2, Sun, Moon } from 'lucide-react';
import { useWorkspace } from './WorkspaceProvider';
import type { TranslationKey } from '../lib/i18n';
import { lifeText } from '../../shared/life-labels';

const planned = [
  ['notifications', Bell, 6], ['documents', Files, 5], ['imports', ArrowDownUp, 3], ['backup', Database, 7], ['staff', UserRoundCog, 7],
] as const;
const labels: Record<string, TranslationKey> = { '/': 'dashboard', '/wards': 'wards', '/families': 'families', '/members': 'members', '/settings': 'settings', '/activity': 'activity', '/payments':'payments', '/finance':'payments', '/donations':'donations', '/reports':'reports' };

export function Layout() {
  const { snapshot, save, t, notify, dirty } = useWorkspace();
  const location = useLocation();
  const eventKind=location.pathname.split('/')[2];
  const breadcrumb:TranslationKey=location.pathname.startsWith('/events/')&&['marriage','divorce','death'].includes(eventKind)?eventKind as TranslationKey:location.pathname==='/household-transfer'?'families':location.pathname==='/event-categories'?'divorce':labels[`/${location.pathname.split('/')[1]}`]??'dashboard';
  const [busy, setBusy] = useState(false);
  async function preference(change: Partial<typeof snapshot.settings>) {
    setBusy(true);
    try { await save({ ...snapshot.settings, ...change }); }
    catch { notify(t('errorTitle'), true); }
    finally { setBusy(false); }
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>{t('skip')}</a>
    <aside className="sidebar">
      <Link to="/" className="brand" aria-label="Mosque Suite"><Building2 size={38} strokeWidth={1.5} /><span><strong>MOSQUE SUITE</strong><small>{t('tagline')}</small></span></Link>
      <nav aria-label={t('workspace')} className="navigation">
        <NavLink end to="/" className="nav-link"><House /><span>{t('dashboard')}</span></NavLink>
        <NavLink to="/wards" className="nav-link"><MapPin /><span>{t('wards')}</span></NavLink>
        <NavLink to="/families" className="nav-link"><Users /><span>{t('families')}</span></NavLink>
        <NavLink to="/members" className="nav-link"><UserRound /><span>{t('members')}</span></NavLink>
        <NavLink to="/events/marriage" className="nav-link"><HeartHandshake/><span>{t('marriage')}</span></NavLink>
        <NavLink to="/events/divorce" className="nav-link"><FileText/><span>{t('divorce')}</span></NavLink>
        <NavLink to="/events/death" className="nav-link"><CalendarDays/><span>{t('death')}</span></NavLink>
        <NavLink to="/payments" className="nav-link"><WalletCards/><span>{t('payments')}</span></NavLink>
        <NavLink to="/donations" className="nav-link"><Coins/><span>{t('donations')}</span></NavLink>
        <NavLink to="/reports" className="nav-link"><ChartNoAxesCombined/><span>{t('reports')}</span></NavLink>
        <div className="nav-section-label">{t('workspace')} <span>{t('later')}</span></div>
        {planned.map(([key, Icon, phase]) => <div key={key} className="nav-link planned" aria-disabled="true" title={`${t('later')} · Phase ${phase}`}><Icon /><span>{t(key)}</span></div>)}
        <div className="nav-divider" />
        <NavLink to="/settings" className="nav-link"><Settings /><span>{t('settings')}</span></NavLink>
        <NavLink to="/activity" className="nav-link"><History /><span>{t('activity')}</span></NavLink>
      </nav>
      <div className="sidebar-footer"><Database size={20} /><span>{t('local')}</span></div>
    </aside>
    <div className="workspace">
      <div className="topbar"><div className="breadcrumb"><span>{t('workspace')}</span><span aria-hidden="true">/</span><strong>{t(breadcrumb)}</strong></div>
        <div className="toolbar"><label className="language-control"><Globe2 size={18} /><span className="sr-only">{t('language')}</span><select aria-label={t('language')} value={snapshot.settings.locale} disabled={busy || dirty} onChange={event => void preference({ locale: event.target.value as 'en' | 'ml' })}><option value="en">English</option><option value="ml">മലയാളം</option></select></label>
          <button className="icon-button theme-button" aria-label={t('themeSwitch')} disabled={busy || dirty} onClick={() => void preference({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' })}>{snapshot.settings.theme === 'dark' ? <Moon /> : <Sun />}</button>
        </div>
      </div>
      <main id="main-content" tabIndex={-1} className="main-content">
        <div className="preview-notice"><AlertCircle size={21} /><p><strong>{snapshot.lifeEventsDemo?lifeText(snapshot.settings.locale,'demoTitle'):t('preview')}</strong><span aria-hidden="true"> · </span>{snapshot.lifeEventsDemo?lifeText(snapshot.settings.locale,'demoNotice'):t('warning')}</p></div>
        <Outlet />
      </main>
      <footer className="workspace-footer">MOSQUE SUITE {snapshot.version} · {t('preview')}</footer>
    </div>
  </div>;
}
