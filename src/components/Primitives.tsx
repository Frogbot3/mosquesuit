import type { ReactNode } from 'react';
import { useWorkspace } from './WorkspaceProvider';

export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}
export function Status({ active = true }: { active?: boolean }) {
  const { t } = useWorkspace();
  return <span className={`status ${active ? '' : 'inactive'}`}><span className="dot" aria-hidden="true" />{t(active ? 'active' : 'inactive')}</span>;
}
