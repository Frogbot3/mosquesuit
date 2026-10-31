import { authorizeIpc } from './ipc-authorization';
import { SecurityError } from '../shared/security';
import { ipcMain,type BrowserWindow } from 'electron';
import { z } from 'zod';
import { FINANCE_CHANNELS as C } from '../shared/finance-channels';
import { emptyRequest,type Result } from '../shared/contracts';
import { adjustmentSchema,assignmentSchema,correctionSchema,creditSchema,donationSchema,expenseDecisionSchema,expenseSchema,financeCategorySchema,financeConfigSchema,financeFilterSchema,financeIdSchema,financeLogoSchema,financeOutputSchema,financeReportSchema,financeRoleSchema,fundSchema,generateSchema,paymentSchema,planSchema,policySchema,FinanceError } from '../shared/finance';
import type { WorkspaceStore } from './database/store';
import { isTrustedDocument } from './security';
import { chooseFinanceLogo,outputFinance } from './finance-output';

export function registerFinanceIpc(window:BrowserWindow,store:WorkspaceStore,development:boolean,rendererRoot:string){
  function handle<S extends z.ZodType,T>(channel:string,schema:S,run:(input:z.output<S>)=>T|Promise<T>){
    ipcMain.handle(channel,async(event,input:unknown):Promise<Result<T>>=>{
      if(event.sender!==window.webContents||!event.senderFrame||event.senderFrame!==event.sender.mainFrame||!isTrustedDocument(event.senderFrame.url,development))return {ok:false,error:{code:'FORBIDDEN',message:'Request denied.'}};
      try{store.finance.require();const parsed=schema.safeParse(input);if(!parsed.success)return {ok:false,error:{code:'VALIDATION',message:'Check the supplied values.'}};authorizeIpc(store.security,channel,parsed.data);return {ok:true,data:await store.security.operation(()=>run(parsed.data))};}
      catch(error){return {ok:false,error:{code:error instanceof SecurityError||error instanceof FinanceError?error.code:'STORAGE',message:'The financial operation could not be completed.'}};}
    });
  }
  handle(C.getFinanceSetup,emptyRequest,()=>store.finance.setup());
  handle(C.setFinanceDemoRole,financeRoleSchema,d=>store.finance.setRole(d));
  handle(C.saveFinancePlan,planSchema,d=>store.finance.savePlan(d));
  handle(C.saveFinanceAssignment,assignmentSchema,d=>store.finance.saveAssignment(d));
  handle(C.saveFinancePolicy,policySchema,d=>store.finance.savePolicy(d));
  handle(C.generateFinanceDues,generateSchema,d=>store.finance.generate(d));
  handle(C.getFamilyFinance,financeIdSchema,d=>store.finance.family(d));
  handle(C.recordFinancePayment,paymentSchema,d=>store.finance.payment(d));
  handle(C.applyFinanceCredit,creditSchema,d=>store.finance.applyCredit(d));
  handle(C.adjustFinanceDue,adjustmentSchema,d=>store.finance.adjust(d));
  handle(C.correctFinanceTransaction,correctionSchema,d=>store.finance.correct(d));
  handle(C.saveFinanceFund,fundSchema,d=>store.finance.saveFund(d));
  handle(C.saveFinanceCategory,financeCategorySchema,d=>store.finance.saveCategory(d));
  handle(C.recordFinanceDonation,donationSchema,d=>store.finance.donation(d));
  handle(C.recordFinanceExpense,expenseSchema,d=>store.finance.expense(d));
  handle(C.decideFinanceExpense,expenseDecisionSchema,d=>store.finance.decideExpense(d));
  handle(C.getFinanceDashboard,financeFilterSchema,d=>store.finance.dashboard(d));
  handle(C.getFinanceReport,financeReportSchema,d=>store.finance.report(d));
  handle(C.getFinanceTransaction,financeIdSchema,d=>store.finance.transaction(d));
  handle(C.getFinanceReceipt,financeIdSchema,d=>store.finance.receipt(d));
  handle(C.getFinanceAudit,emptyRequest,()=>store.finance.auditHistory());
  handle(C.saveFinanceConfig,financeConfigSchema,d=>store.finance.saveConfig(d));
  handle(C.chooseFinanceLogo,financeLogoSchema,d=>chooseFinanceLogo(window,store,d));
  handle(C.outputFinanceDocument,financeOutputSchema,d=>outputFinance(window,store,rendererRoot,d));
  handle(C.backupFinance,emptyRequest,()=>{throw new SecurityError('AUTH_PERMISSION');});
}
