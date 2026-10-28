import { resolve, relative, isAbsolute } from 'node:path';

export const APP_ORIGIN = 'app://mosque';
export const DEV_ORIGIN = 'http://127.0.0.1:5173';
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function isTrustedDocument(rawUrl: string, development: boolean): boolean {
  try {
    const url = new URL(rawUrl);
    return development
      ? url.origin === DEV_ORIGIN && url.pathname === '/' && !url.username && !url.password
      : url.protocol === 'app:' && url.hostname === 'mosque' && !url.port && !url.username && !url.password && url.pathname === '/index.html';
  } catch { return false; }
}

// Resolve only packaged renderer assets. No caller-supplied filesystem API is exposed.
export function resolveAsset(root: string, rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'app:' || url.hostname !== 'mosque' || url.port || url.username || url.password) return null;
    const path = decodeURIComponent(url.pathname);
    if (path.includes('\\') || path.includes('\0') || path.includes(':') || path.split('/').includes('..')) return null;
    const candidate = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    const within = relative(root, candidate);
    if (within.startsWith('..') || isAbsolute(within)) return null;
    if (!(within === 'index.html' || within.startsWith('assets/') || within.startsWith('assets\\'))) return null;
    return candidate;
  } catch { return null; }
}
