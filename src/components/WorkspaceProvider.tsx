import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, LoaderCircle, X } from 'lucide-react';
import type { Settings, Snapshot } from '../../shared/contracts';
import { desktop, unwrap, ApiError } from '../lib/api';
import { translate, type TranslationKey } from '../lib/i18n';

type Notice = { message: string; error: boolean } | null;
interface WorkspaceContextValue {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  save: (settings: Settings) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  t: (key: TranslationKey) => string;
  dirty: boolean;
  setDirty: (value: boolean) => void;
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('Workspace provider is missing.');
  return context;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [dirty, setDirty] = useState(false);
  const locale = snapshot?.settings.locale ?? 'en';
  const t = useCallback((key: TranslationKey) => translate(locale, key), [locale]);
  const notify = useCallback((message: string, error = false) => setNotice({ message, error }), []);

  const refresh = useCallback(async () => {
    const data = await unwrap(desktop().getSnapshot());
    setSnapshot(data);
    setFailure(null);
  }, []);
  const load = useCallback(() => {
    setFailure(null);
    void refresh().catch(error => setFailure(error instanceof ApiError ? error.code : 'INTERNAL'));
  }, [refresh]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!snapshot) return;
    document.documentElement.lang = snapshot.settings.locale;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = snapshot.settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : snapshot.settings.theme;
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [snapshot]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const save = useCallback(async (settings: Settings) => {
    const saved = await unwrap(desktop().saveSettings(settings));
    // Saving has already committed; do not report failure merely because a later read fails.
    setSnapshot(previous => previous ? { ...previous, settings: saved } : previous);
    setDirty(false);
  }, []);

  if (failure) return <main className="startup"><AlertCircle size={40} /><h1>{t('errorHeading')}</h1><p>{t(failure === 'DESKTOP_REQUIRED' ? 'desktopRequired' : 'unexpected')}</p><button className="button primary" onClick={load}>{t('retry')}</button></main>;
  if (!snapshot) return <main className="startup" role="status"><LoaderCircle className="spin" size={32} /><p>{t('loading')}</p></main>;
  return <WorkspaceContext.Provider value={{ snapshot, refresh, save, notify, t, dirty, setDirty }}>
    {children}
    {notice && <div className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
      <span>{notice.message}</span><button aria-label={t('close')} className="icon-button" onClick={() => setNotice(null)}><X size={18} /></button>
    </div>}
  </WorkspaceContext.Provider>;
}
