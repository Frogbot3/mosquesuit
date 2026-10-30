import type Database from 'better-sqlite3';
import { SecurityError,type Permission } from '../../shared/security';
import type { SecurityStore } from './security-store';
import type { FinanceStore } from './finance-store';

type Domain='registration'|'lifeEvents'|'finance'|'integrations';
type Input=Record<string,unknown>;
const financePermission:Record<string,Permission>={setup:'finance.view',family:'finance.view',transaction:'finance.view',receipt:'finance.view',dashboard:'finance.view',report:'reports.generate',auditHistory:'audit.view',savePlan:'finance.configure',saveAssignment:'finance.configure',savePolicy:'finance.configure',generate:'finance.configure',payment:'payments.record',applyCredit:'payments.record',adjust:'payments.reverse',correct:'payments.reverse',saveFund:'finance.configure',saveCategory:'finance.configure',donation:'donations.manage',expense:'expenses.record',decideExpense:'expenses.approve',saveConfig:'finance.configure',setLogo:'finance.configure'};
const integrationPermission:Record<string,Permission>={state:'notifications.send',saveConsent:'notifications.send',saveTemplate:'settings.change',preview:'notifications.send',queue:'notifications.send',decide:'notifications.send',saveSchedule:'settings.change',runSchedules:'notifications.send',saveConfig:'settings.change',configureMock:'settings.change',sync:'payments.record',createLink:'payments.record',cancelLink:'payments.record',simulate:'settings.change',refund:'payments.reverse',resolve:'payments.reverse',exportSnapshot:'notifications.send'};
const readOnly=new Set(['get','list','listMembers','getMember','counts','categories','transfers','document','setup','family','transaction','receipt','dashboard','report','auditHistory','state','exportSnapshot']);
export function authorizedService<T extends object>(domain:Domain,raw:T,auth:SecurityStore,db:Database.Database,finance:FinanceStore):T {
 const family=(id:unknown)=>{if(typeof id==='string'&&id)auth.family(id);};
 const eventPermission=(id:unknown,kind?:unknown)=>{const stored=typeof id==='string'&&id?db.prepare('SELECT kind FROM life_events WHERE id=?').get(id) as {kind:string}|undefined:undefined;const value=stored?.kind??kind;if(!['marriage','divorce','death'].includes(String(value)))throw new SecurityError('AUTH_PERMISSION');auth.require(`life.${value}` as Permission);auth.global();};
 const refreshFinance=()=>{if(!finance.enabled)return;const user=auth.require();const grants=auth.permissions(user);const role=grants.some(p=>['payments.reverse','expenses.approve','finance.configure','settings.change'].includes(p))?'administrator':grants.some(p=>['payments.record','donations.manage','expenses.record','notifications.send'].includes(p))?'accountant':'viewer';if(finance.setup().session.role!==role)finance.setRole({role});};
 function authorize(method:string,args:unknown[]){const d=(args[0]&&typeof args[0]==='object'?args[0]:{}) as Input;auth.require();
  if(domain==='registration'){
   if(method==='list'||method==='counts'){auth.require('families.view');if(d.wardId)auth.ward(String(d.wardId));}
   else if(method==='get'){auth.require('families.view');auth.require('members.view');family(d.id);}
   else if(method==='listMembers'||method==='getMember'){auth.require('members.view');if(d.wardId)auth.ward(String(d.wardId));if(method==='getMember')auth.member(String(d.id));}
   else if(method==='save'){auth.require(d.id?'families.edit':'families.create');auth.ward(String(d.wardId));if(d.id){family(d.id);const members=Array.isArray(d.members)?d.members as {id?:string}[]:[];const old=db.prepare('SELECT id FROM members WHERE family_id=? AND archived_at IS NULL').all(String(d.id)) as {id:string}[];if(old.some(m=>!members.some(n=>n.id===m.id)))auth.require('families.archive');}}
   else throw new SecurityError('AUTH_PERMISSION');
  }else if(domain==='lifeEvents'){
   if(method==='requireDemo')return;
   if(method==='categories'||method==='saveCategory'){auth.require('life.divorce');auth.global();}
   else if(method==='transfer'){auth.require('families.edit');auth.global();auth.member(String(d.memberId));family(d.toFamilyId);}
   else if(method==='transfers'){auth.require('families.view');auth.global();family(args[0]);}
   else if(method==='document'){auth.require('data.export');const row=db.prepare('SELECT event_id FROM event_documents WHERE id=?').get(String(d.id)) as {event_id:string}|undefined;eventPermission(row?.event_id);}
   else if(['get','list','save','transition','addDocument','output'].includes(method))eventPermission(d.id,d.kind);
   else throw new SecurityError('AUTH_PERMISSION');
  }else if(domain==='finance'){
   if(method==='require'){refreshFinance();return;}
   const permission=financePermission[method];if(!permission)throw new SecurityError('AUTH_PERMISSION');auth.require(permission);
   if(method==='family')family(d.id);else if(['payment','donation','saveAssignment','savePolicy'].includes(method)){family(d.familyId);auth.global();}
   else auth.global();refreshFinance();
  }else{
   if(method==='require'){refreshFinance();return;}
   const permission=integrationPermission[method];if(!permission)throw new SecurityError('AUTH_PERMISSION');auth.require(permission);auth.global();if(method==='sync')auth.require('notifications.send');refreshFinance();
  }
 }
 return new Proxy(raw,{get(target,key,receiver){if(key==='enabled')return Reflect.get(target,key,receiver);if(domain==='integrations'&&key==='workspaceId')return Reflect.get(target,key,target);if(domain==='integrations'&&key==='attach')return (Reflect.get(target,key,target) as (...args:unknown[])=>unknown).bind(target);const value=Reflect.get(target,key,target);if(typeof value!=='function')return undefined;const method=String(key);return (...args:unknown[])=>{authorize(method,args);if(['require','requireDemo'].includes(method))return value.apply(target,args);const actor=auth.require().id;const action=`${domain}.${method}`;const d=(args[0]??{}) as Input;const entityId=typeof d.id==='string'?d.id:typeof d.familyId==='string'?d.familyId:'';
   return auth.operation(()=>{const invoke=()=>{const result=value.apply(target,args);if(result instanceof Promise)return result.then(v=>{auth.require();if(!readOnly.has(method))auth.audit(action,domain,entityId,'success','Authorized operation completed',actor);return v;});if(!readOnly.has(method))auth.audit(action,domain,entityId,'success',domain==='registration'?'Family/member fields and membership history updated':'Authorized operation completed',actor);return result;};try{if(readOnly.has(method)||['sync','createLink','cancelLink','simulate','refund','resolve','configureMock'].includes(method))return invoke();return db.transaction(invoke)();}catch(e){auth.audit(action,domain,entityId,'failure','Operation rejected; details redacted',actor);throw e;}});
  };}});
}
