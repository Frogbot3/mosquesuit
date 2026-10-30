import { createContext,useCallback,useContext,useState,type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { integrationText } from '../../../shared/integration-labels';
import type { IntegrationState } from '../../../shared/integrations';
import { financeRoles,type FinanceRole } from '../../../shared/finance';
import { useWorkspace } from '../WorkspaceProvider';
import { FinanceField,CheckField,useFinanceAction } from '../finance/FinanceShared';
import { desktop,unwrap } from '../../lib/api';
import { useRegistrationData } from '../../lib/useRegistrationData';
export function useIntegrationText(){const {snapshot}=useWorkspace();return useCallback((key:string)=>integrationText(snapshot.settings.locale,key),[snapshot.settings.locale]);}
const Context=createContext<{state:IntegrationState;refresh:()=>void}|null>(null);
export function useIntegration(){const context=useContext(Context);if(!context)throw new Error('Integration context required');return context;}
export const integrationPaths=[['/notifications','notifications'],['/integrations/consent','consents'],['/integrations/templates','templates'],['/integrations/schedules','schedules'],['/integrations/payments','onlinePayments'],['/integrations/settings','integrations']] as const;
export function IntegrationArea({children}:{children:ReactNode}){const {snapshot}=useWorkspace();const t=useIntegrationText();return snapshot.integrationsDemo?<Frame>{children}</Frame>:<section className="panel empty-state"><h1>{t('integrations')}</h1><p>{t('gate')}</p></section>;}
function Frame({children}:{children:ReactNode}){const t=useIntegrationText();const {dirty,notify}=useWorkspace();const load=useCallback(()=>unwrap(desktop().getIntegrationState()),[]);const result=useRegistrationData(load);const action=useFinanceAction();const [busy,setBusy]=useState(false);
 async function role(role:FinanceRole){setBusy(true);try{await unwrap(desktop().setFinanceDemoRole({role}));result.retry();}catch{notify(t('STORAGE'),true);}finally{setBusy(false);}}
 return <><div className="finance-toolbar"><p>{t('simulation')}</p>{result.data&&<label>{t('demoRole')}<select aria-label={t('demoRole')} disabled={dirty||busy} value={result.data.role} onChange={e=>void role(e.target.value as FinanceRole)}>{financeRoles.map(r=><option key={r} value={r}>{t(r)}</option>)}</select></label>}</div><nav className="finance-tabs" aria-label={t('integrations')}>{integrationPaths.map(([path,label])=><NavLink end key={path} to={path}>{t(label)}</NavLink>)}</nav>{result.error&&<p role="alert" className="form-error">{t(result.error)}</p>}{result.loading&&!result.data&&<p role="status">{t('loading')}</p>}{result.data&&<Context.Provider value={{state:result.data,refresh:result.retry}}><div className="integration-sync panel"><div><strong>{t(result.data.connected?'connected':'offline')}</strong><small>{t('lastSync')}: {result.data.lastSync?stamp(result.data.lastSync):t('never')}</small></div><button className="button secondary" disabled={dirty||action.busy||result.data.role==='viewer'||!result.data.connected} onClick={()=>action.ask(<p>{t('sync')}</p>,async()=>{await unwrap(desktop().syncIntegrations());result.retry();})}>{t('sync')}</button></div>{children}</Context.Provider>}<IntegrationAction action={action}/></>;
}
export function IField(props:React.ComponentProps<typeof FinanceField>){const t=useIntegrationText();return <FinanceField {...props} label={t(props.label)}/>;}
export function ICheck(props:React.ComponentProps<typeof CheckField>){const t=useIntegrationText();return <CheckField {...props} label={t(props.label)}/>;}
export function IntegrationAction({action}:{action:ReturnType<typeof useFinanceAction>}){const t=useIntegrationText();return <>{action.error&&<p className="form-error" role="alert">{t(action.error)}</p>}{action.dialog}</>;}
export const stamp=(time:number)=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(time);
