import type { Result } from '../../shared/contracts';

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function desktop() {
  if (!window.mosque) throw new ApiError('DESKTOP_REQUIRED', 'Open the desktop application to use your local workspace.');
  return window.mosque;
}
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new ApiError(result.error.code, result.error.message);
  return result.data;
}
