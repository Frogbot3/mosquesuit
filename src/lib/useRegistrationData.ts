import { useEffect, useState } from 'react';
import { ApiError } from './api';

export function useRegistrationData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true); setError(null);
    const timer = setTimeout(() => {
      void load().then(result => { if (current) setData(result); }).catch(cause => {
        if (current) { setData(null); setError(cause instanceof ApiError ? cause.code : 'error'); }
      }).finally(() => { if (current) setLoading(false); });
    }, 160);
    return () => { current = false; clearTimeout(timer); };
  }, [load, attempt]);
  return { data, error, loading, retry: () => setAttempt(value => value + 1) };
}
