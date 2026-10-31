// Domain audit trails keep field names, never free-text values or credentials.
// The business record retains authorized details; security audit supplies actor/outcome.
export function auditSummary(value: unknown): string {
  const fields = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).filter(key => /^[a-z][a-zA-Z0-9]{0,40}$/.test(key)).sort()
    : [];
  return JSON.stringify({ fields });
}
