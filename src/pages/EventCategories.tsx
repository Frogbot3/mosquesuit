import { useCallback,useState } from 'react';
import { Link } from 'react-router-dom';
import { categorySchema,type DivorceCategory } from '../../shared/life-events';
import { LifeGate,LifeState,useLifeText } from '../components/life-events/LifeShared';
import { PageHeading } from '../components/Primitives';
import { useWorkspace } from '../components/WorkspaceProvider';
import { desktop,unwrap,ApiError } from '../lib/api';
import { useRegistrationData } from '../lib/useRegistrationData';
import { useUnsavedRegistration } from '../lib/useUnsavedRegistration';
import { ConfirmDialog } from '../components/ConfirmDialog';
const empty:DivorceCategory={id:'',name:'',nameMl:'',active:true};
export function EventCategories() {const {snapshot}=useWorkspace();return <LifeGate>{snapshot.lifeEventsDemo&&<Categories/>}</LifeGate>;}
function Categories() {
  const t=useLifeText();const {notify}=useWorkspace();const load=useCallback(()=>unwrap(desktop().getEventCategories()),[]);const result=useRegistrationData(load);const [draft,setDraft]=useState(empty);const [dirty,setDirty]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const {blocker}=useUnsavedRegistration(dirty);
  async function save(){const parsed=categorySchema.safeParse(draft);if(!parsed.success){setError('invalid');return;}setBusy(true);try{await unwrap(desktop().saveEventCategory(parsed.data));setDraft(empty);setDirty(false);setError(null);result.retry();notify(t('saved'));}catch(cause){setError(cause instanceof ApiError?cause.code:'STORAGE');}finally{setBusy(false);}}
  return <><Link className="back-link" to="/events/divorce">{t('back')}</Link><PageHeading title={t('categories')} description={t('administrative')}/><LifeState {...result}/><section className="panel"><ul className="history-list">{result.data?.map(c=><li key={c.id}><span>{c.name} · {c.nameMl} {c.active?'':t('inactive')}</span><button className="text-link" disabled={dirty||busy} onClick={()=>{setDraft(c);setError(null);}}>{t('edit')}</button></li>)}</ul></section><form className="panel profile-history" onSubmit={e=>{e.preventDefault();void save();}}><fieldset className="registration-fieldset registration-grid" disabled={busy}>{(['name','nameMl'] as const).map(key=><div className="field" key={key}><label htmlFor={`category-${key}`}>{t(key==='name'?'categoryName':'categoryNameMl')}</label><input id={`category-${key}`} value={draft[key]} maxLength={80} onChange={e=>{setDraft({...draft,[key]:e.target.value});setDirty(true);}}/></div>)}<label><input type="checkbox" checked={draft.active} onChange={e=>{setDraft({...draft,active:e.target.checked});setDirty(true);}}/> {t('active')}</label></fieldset><LifeState error={error} loading={false}/><div className="life-actions"><button className="button primary" disabled={!dirty||busy}>{t('save')}</button><button className="button secondary" type="button" disabled={busy} onClick={()=>{setDraft(empty);setDirty(false);}}>{t('cancel')}</button></div></form><ConfirmDialog open={blocker.state==='blocked'} title={t('discardTitle')} confirm={t('discard')} cancel={t('keep')} onCancel={()=>{if(blocker.state==='blocked')blocker.reset();}} onConfirm={()=>{if(blocker.state==='blocked')blocker.proceed();}}>{t('discardHelp')}</ConfirmDialog></>;
}
