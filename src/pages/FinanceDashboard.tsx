import { useCallback,useState } from 'react';
import { Link } from 'react-router-dom';
import { financeFilters,money } from '../../shared/finance';
import { FinanceArea,FinanceFiltersBar,FinanceState,FinanceTable,TransactionTable,useFinanceText } from '../components/finance/FinanceShared';
import { PageHeading } from '../components/Primitives';
import { useWorkspace } from '../components/WorkspaceProvider';
import { desktop,unwrap } from '../lib/api';
import { useRegistrationData } from '../lib/useRegistrationData';
export function FinanceDashboardPage(){return <FinanceArea><Overview/></FinanceArea>;}
function Overview(){
  const t=useFinanceText();const {snapshot}=useWorkspace();const [filters,setFilters]=useState(financeFilters);const load=useCallback(()=>unwrap(desktop().getFinanceDashboard(filters)),[filters]);const result=useRegistrationData(load);
  return <><PageHeading title={t('overview')} description={t('dashboardBasis')} action={<Link className="button primary" to="/finance/collect">{t('collect')}</Link>}/><FinanceFiltersBar value={filters} onChange={setFilters}/><FinanceState {...result}/>{result.data&&<><dl className="finance-metrics">{(['billedPaise','collectedPaise','outstandingPaise','overduePaise','donationPaise','expensePaise','refundPaise','reversalPaise','netCashPaise'] as const).map(key=><div key={key}><dt>{t(key)}</dt><dd>{money(result.data![key],snapshot.settings.locale)}</dd></div>)}<div><dt>{t('collectionPercent')}</dt><dd>{result.data.collectionPercent}%</dd></div></dl><section className="panel"><h2>{t('wards')}</h2><FinanceTable caption="wards" columns={['ward','billedPaise','settledPaise','outstandingPaise'].map(key=>({key,label:key}))} rows={result.data.wards.map(w=>({ward:w.ward,billedPaise:money(w.billedPaise),settledPaise:money(w.paidPaise),outstandingPaise:money(w.outstandingPaise)}))}/></section><section className="panel profile-history"><h2>{t('history')}</h2><TransactionTable transactions={result.data.recent}/></section></>}</>;
}
