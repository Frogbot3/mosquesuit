import { useEffect, useRef } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { useWorkspace } from '../components/WorkspaceProvider';

export function useUnsavedRegistration(dirty: boolean) {
  const { setDirty } = useWorkspace();
  const permitted = useRef(false);
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !permitted.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useBeforeUnload(event => { if (dirty && !permitted.current) { event.preventDefault(); event.returnValue = ''; } });
  return { blocker, allowNavigation: () => { permitted.current = true; setDirty(false); } };
}
